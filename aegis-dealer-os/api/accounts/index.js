import { createClerkClient } from '@clerk/backend';
import {
  initialWebsiteStatus,
  normaliseEmail,
  normaliseWebsiteConnectionType,
  normaliseWebsiteURL,
  portalBaseURL,
  portalReadiness
} from '../../lib/client-onboarding.js';
import { normaliseModules, portalTier, publicSlug } from '../../lib/client-portals.js';
import { requireUserSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../lib/http.js';
import { supabaseAdmin } from '../../lib/supabase.js';

export const accountSelection = 'id,name,clerk_organisation_id,public_slug,website_url,portal_status,portal_tier,enabled_modules,client_contact_name,client_contact_email,invitation_id,invitation_status,invitation_sent_at,invitation_accepted_at,invitation_last_error,website_connection_type,website_connection_status,website_last_checked_at,website_last_error,portal_activated_at,created_at,updated_at';

async function uniqueSlug(supabase, value, excludingId = null) {
  const base = publicSlug(value);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix ? `${base}-${suffix + 1}` : base;
    let query = supabase.from('organisations').select('id').eq('public_slug', candidate);
    if (excludingId) query = query.neq('id', excludingId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error('AEGIS could not create a unique portal address for this client.');
}

async function listAccounts(supabase, userId) {
  const { data: memberships, error } = await supabase
    .from('organisation_memberships')
    .select('organisation_id,role')
    .eq('clerk_user_id', userId);
  if (error) throw error;
  const ids = (memberships || []).map((membership) => membership.organisation_id);
  if (!ids.length) return [];
  const { data: organisations, error: organisationsError } = await supabase
    .from('organisations')
    .select(accountSelection)
    .in('id', ids)
    .order('updated_at', { ascending: false });
  if (organisationsError) throw organisationsError;
  const roleById = Object.fromEntries(memberships.map((membership) => [membership.organisation_id, membership.role]));
  const { data: allMemberships, error: allMembershipsError } = await supabase
    .from('organisation_memberships')
    .select('organisation_id,clerk_user_id,role')
    .in('organisation_id', ids);
  if (allMembershipsError) throw allMembershipsError;
  const acceptedIds = new Set((allMemberships || [])
    .filter((membership) => membership.clerk_user_id !== userId)
    .map((membership) => membership.organisation_id));
  const acceptedAt = new Date().toISOString();
  await Promise.all(organisations
    .filter((organisation) => acceptedIds.has(organisation.id) && organisation.invitation_status !== 'accepted')
    .map((organisation) => supabase.from('organisations').update({
      invitation_status: 'accepted',
      invitation_accepted_at: organisation.invitation_accepted_at || acceptedAt,
      invitation_last_error: null
    }).eq('id', organisation.id)));
  return organisations.map((organisation) => {
    const invitationStatus = acceptedIds.has(organisation.id) ? 'accepted' : organisation.invitation_status;
    return {
      ...organisation,
      invitation_status: invitationStatus,
      onboarding: portalReadiness({
        invitationStatus,
        websiteConnectionType: organisation.website_connection_type,
        websiteConnectionStatus: organisation.website_connection_status
      }),
      role: roleById[organisation.id]
    };
  });
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) {
    return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  }
  try {
    const session = await requireUserSession(request);
    const supabase = supabaseAdmin();

    if (request.method === 'GET') {
      return response.status(200).json({ items: await listAccounts(supabase, session.clerkUserId) });
    }

    if (request.method === 'POST') {
      const name = String(request.body?.name || '').trim();
      if (!name) return response.status(400).json({ error: 'Client business name is required.' });
      const modules = normaliseModules(request.body?.enabled_modules);
      const clientEmail = normaliseEmail(request.body?.client_contact_email);
      const websiteConnectionType = normaliseWebsiteConnectionType(request.body?.website_connection_type);
      const websiteURL = normaliseWebsiteURL(request.body?.website_url, websiteConnectionType);
      const websiteConnectionStatus = initialWebsiteStatus(websiteConnectionType);
      const slug = await uniqueSlug(supabase, request.body?.public_slug || name);
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const clerkOrganisation = await clerk.organizations.createOrganization({
        name,
        createdBy: session.clerkUserId
      });
      let { data: organisation, error } = await supabase.from('organisations').insert({
        clerk_organisation_id: clerkOrganisation.id,
        name,
        public_slug: slug,
        website_url: websiteURL,
        portal_status: 'setup',
        portal_tier: portalTier(modules),
        enabled_modules: modules,
        client_contact_name: String(request.body?.client_contact_name || '').trim() || null,
        client_contact_email: clientEmail,
        invitation_status: 'not_sent',
        website_connection_type: websiteConnectionType,
        website_connection_status: websiteConnectionStatus
      }).select(accountSelection).single();
      if (error) throw error;
      const { error: membershipError } = await supabase.from('organisation_memberships').insert({
        organisation_id: organisation.id,
        clerk_user_id: session.clerkUserId,
        role: 'owner'
      });
      if (membershipError) throw membershipError;
      if (websiteConnectionType !== 'none') {
        const { error: connectionError } = await supabase.from('integration_connections').upsert({
          organisation_id: organisation.id,
          provider_config_key: 'website',
          nango_connection_id: `website:${organisation.id}`,
          display_name: 'Dealer website',
          configuration: {
            type: websiteConnectionType,
            url: websiteURL,
            stock_feed_url: `${portalBaseURL()}/api/machines?publicOrg=${encodeURIComponent(slug)}`
          },
          status: websiteConnectionStatus
        }, { onConflict: 'organisation_id,provider_config_key' });
        if (connectionError) throw connectionError;
      }
      let invitation = null;
      let invitationWarning = null;
      try {
        const sent = await clerk.organizations.createOrganizationInvitation({
          organizationId: clerkOrganisation.id,
          emailAddress: clientEmail,
          role: 'org:member',
          inviterUserId: session.clerkUserId,
          redirectUrl: portalBaseURL()
        });
        const sentAt = new Date(sent.createdAt || Date.now()).toISOString();
        const updated = await supabase.from('organisations').update({
          invitation_id: sent.id,
          invitation_status: sent.status === 'accepted' ? 'accepted' : 'pending',
          invitation_sent_at: sentAt,
          invitation_last_error: null
        }).eq('id', organisation.id).select(accountSelection).single();
        if (updated.error) throw updated.error;
        organisation = updated.data;
        invitation = { id: sent.id, email_address: sent.emailAddress, status: sent.status, url: sent.url };
      } catch (invitationError) {
        invitationWarning = `The workspace was created, but AEGIS could not send the client invitation: ${invitationError.message}`;
        await supabase.from('organisations').update({ invitation_status: 'failed', invitation_last_error: invitationWarning }).eq('id', organisation.id);
        organisation = { ...organisation, invitation_status: 'failed', invitation_last_error: invitationWarning };
      }
      return response.status(201).json({
        item: {
          ...organisation,
          role: 'owner',
          onboarding: portalReadiness({
            invitationStatus: organisation.invitation_status,
            websiteConnectionType: organisation.website_connection_type,
            websiteConnectionStatus: organisation.website_connection_status
          })
        },
        invitation,
        warning: invitationWarning
      });
    }

    const id = String(request.body?.id || '');
    const { data: membership, error: membershipError } = await supabase
      .from('organisation_memberships')
      .select('role')
      .eq('organisation_id', id)
      .eq('clerk_user_id', session.clerkUserId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      return response.status(403).json({ error: 'You do not have permission to configure this client portal.' });
    }
    const changes = request.body?.changes || {};
    const update = {};
    if (typeof changes.name === 'string' && changes.name.trim()) update.name = changes.name.trim();
    if (typeof changes.portal_status === 'string' && ['setup', 'live', 'paused'].includes(changes.portal_status)) update.portal_status = changes.portal_status;
    if (typeof changes.client_contact_name === 'string') update.client_contact_name = changes.client_contact_name.trim() || null;
    if (typeof changes.client_contact_email === 'string') update.client_contact_email = normaliseEmail(changes.client_contact_email);
    if (typeof changes.website_connection_type === 'string') {
      update.website_connection_type = normaliseWebsiteConnectionType(changes.website_connection_type);
      update.website_connection_status = initialWebsiteStatus(update.website_connection_type);
      update.website_last_checked_at = null;
      update.website_last_error = null;
    }
    if (typeof changes.website_url === 'string') {
      const type = update.website_connection_type || changes.website_connection_type;
      update.website_url = normaliseWebsiteURL(changes.website_url, type || 'none');
      if ((type || 'none') !== 'none') update.website_connection_status = 'awaiting_access';
    }
    if (Array.isArray(changes.enabled_modules)) {
      update.enabled_modules = normaliseModules(changes.enabled_modules);
      update.portal_tier = portalTier(update.enabled_modules);
    }
    if (typeof changes.public_slug === 'string' && changes.public_slug.trim()) {
      update.public_slug = await uniqueSlug(supabase, changes.public_slug, id);
    }
    const { data: organisation, error } = await supabase
      .from('organisations')
      .update(update)
      .eq('id', id)
      .select(accountSelection)
      .single();
    if (error) throw error;
    if (update.website_connection_type || Object.hasOwn(update, 'website_url')) {
      const { error: connectionError } = await supabase.from('integration_connections').upsert({
        organisation_id: organisation.id,
        provider_config_key: 'website',
        nango_connection_id: `website:${organisation.id}`,
        display_name: 'Dealer website',
        configuration: {
          type: organisation.website_connection_type,
          url: organisation.website_url,
          stock_feed_url: `${portalBaseURL()}/api/machines?publicOrg=${encodeURIComponent(organisation.public_slug)}`
        },
        status: organisation.website_connection_status
      }, { onConflict: 'organisation_id,provider_config_key' });
      if (connectionError) throw connectionError;
    }
    return response.status(200).json({ item: {
      ...organisation,
      role: membership.role,
      onboarding: portalReadiness({
        invitationStatus: organisation.invitation_status,
        websiteConnectionType: organisation.website_connection_type,
        websiteConnectionStatus: organisation.website_connection_status
      })
    } });
  } catch (error) {
    return handleApiError(response, error);
  }
}
