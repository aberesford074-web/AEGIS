import { createClerkClient } from '@clerk/backend';
import {
  portalBaseURL,
  portalReadiness,
  verifyWebsiteConnection
} from '../../lib/client-onboarding.js';
import { requireUserSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../lib/http.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { accountSelection } from './index.js';

async function managerAccount(supabase, id, userId) {
  const { data: membership, error: membershipError } = await supabase
    .from('organisation_memberships')
    .select('role')
    .eq('organisation_id', id)
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership || !['owner', 'manager'].includes(membership.role)) {
    const error = new Error('You do not have permission to manage this client onboarding.');
    error.statusCode = 403;
    throw error;
  }
  const { data: organisation, error } = await supabase
    .from('organisations')
    .select(accountSelection)
    .eq('id', id)
    .single();
  if (error) throw error;
  return { organisation, role: membership.role };
}

function publicAccount(organisation, role) {
  return {
    ...organisation,
    role,
    onboarding: portalReadiness({
      invitationStatus: organisation.invitation_status,
      websiteConnectionType: organisation.website_connection_type,
      websiteConnectionStatus: organisation.website_connection_status
    })
  };
}

async function latestInvitation(clerk, organisation) {
  const list = await clerk.organizations.getOrganizationInvitationList({
    organizationId: organisation.clerk_organisation_id,
    limit: 100
  });
  return (list.data || [])
    .filter((item) => String(item.emailAddress || '').toLowerCase() === organisation.client_contact_email)
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))[0] || null;
}

async function refreshAcceptedMembership({ clerk, supabase, organisation }) {
  const users = await clerk.users.getUserList({ emailAddress: [organisation.client_contact_email], limit: 20 });
  const user = users.data?.[0];
  if (!user) return null;
  const memberships = await clerk.users.getOrganizationMembershipList({ userId: user.id, limit: 100 });
  const accepted = memberships.data.find((item) => item.organization.id === organisation.clerk_organisation_id);
  if (!accepted) return null;
  const role = ['org:admin', 'org:owner'].includes(accepted.role) ? 'manager' : 'operations';
  const { error: membershipError } = await supabase.from('organisation_memberships').upsert({
    organisation_id: organisation.id,
    clerk_user_id: user.id,
    role
  });
  if (membershipError) throw membershipError;
  const acceptedAt = new Date().toISOString();
  const updated = await supabase.from('organisations').update({
    invitation_status: 'accepted',
    invitation_accepted_at: organisation.invitation_accepted_at || acceptedAt,
    invitation_last_error: null
  }).eq('id', organisation.id).select(accountSelection).single();
  if (updated.error) throw updated.error;
  return updated.data;
}

async function audit(supabase, organisationId, userId, eventType, payload = {}) {
  const { error } = await supabase.from('audit_events').insert({
    organisation_id: organisationId,
    actor_clerk_user_id: userId,
    event_type: eventType,
    record_type: 'organisation',
    record_id: organisationId,
    payload
  });
  if (error) console.error('Could not write onboarding audit event.', error);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  try {
    const session = await requireUserSession(request);
    const supabase = supabaseAdmin();
    const id = String(request.body?.id || '').trim();
    const action = String(request.body?.action || '').trim();
    if (!id || !action) return response.status(400).json({ error: 'Client portal and onboarding action are required.' });
    let { organisation, role } = await managerAccount(supabase, id, session.clerkUserId);
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

    if (action === 'refresh_invitation') {
      organisation = await refreshAcceptedMembership({ clerk, supabase, organisation }) || organisation;
      if (organisation.invitation_status !== 'accepted') {
        const invitation = await latestInvitation(clerk, organisation);
        if (invitation) {
          const updated = await supabase.from('organisations').update({
            invitation_id: invitation.id,
            invitation_status: invitation.status === 'accepted' ? 'accepted' : invitation.status === 'revoked' ? 'revoked' : 'pending',
            invitation_sent_at: new Date(invitation.createdAt || Date.now()).toISOString(),
            invitation_last_error: null
          }).eq('id', id).select(accountSelection).single();
          if (updated.error) throw updated.error;
          organisation = updated.data;
        }
      }
      return response.status(200).json({ item: publicAccount(organisation, role) });
    }

    if (action === 'resend_invitation') {
      const pending = await clerk.organizations.getOrganizationInvitationList({
        organizationId: organisation.clerk_organisation_id,
        status: ['pending'],
        limit: 100
      });
      for (const invitation of pending.data || []) {
        if (String(invitation.emailAddress || '').toLowerCase() === organisation.client_contact_email) {
          await clerk.organizations.revokeOrganizationInvitation({
            organizationId: organisation.clerk_organisation_id,
            invitationId: invitation.id
          });
        }
      }
      const sent = await clerk.organizations.createOrganizationInvitation({
        organizationId: organisation.clerk_organisation_id,
        emailAddress: organisation.client_contact_email,
        role: 'org:member',
        inviterUserId: session.clerkUserId,
        redirectUrl: portalBaseURL()
      });
      const updated = await supabase.from('organisations').update({
        invitation_id: sent.id,
        invitation_status: 'pending',
        invitation_sent_at: new Date(sent.createdAt || Date.now()).toISOString(),
        invitation_accepted_at: null,
        invitation_last_error: null
      }).eq('id', id).select(accountSelection).single();
      if (updated.error) throw updated.error;
      organisation = updated.data;
      await audit(supabase, id, session.clerkUserId, 'client_invitation_resent', { email: organisation.client_contact_email });
      return response.status(200).json({ item: publicAccount(organisation, role), invitation_url: sent.url });
    }

    if (action === 'copy_invitation_link') {
      const invitation = await latestInvitation(clerk, organisation);
      if (!invitation?.url || invitation.status !== 'pending') {
        const error = new Error('There is no pending invitation link. Resend the invitation first.');
        error.statusCode = 409;
        throw error;
      }
      return response.status(200).json({ item: publicAccount(organisation, role), invitation_url: invitation.url });
    }

    if (action === 'verify_website') {
      const verification = await verifyWebsiteConnection({
        type: organisation.website_connection_type,
        websiteURL: organisation.website_url,
        publicSlug: organisation.public_slug
      });
      const updated = await supabase.from('organisations').update({
        website_connection_status: verification.status,
        website_last_checked_at: verification.checkedAt,
        website_last_error: verification.error
      }).eq('id', id).select(accountSelection).single();
      if (updated.error) throw updated.error;
      organisation = updated.data;
      const { error: connectionError } = await supabase.from('integration_connections').upsert({
        organisation_id: id,
        provider_config_key: 'website',
        nango_connection_id: `website:${id}`,
        display_name: 'Dealer website',
        configuration: {
          type: organisation.website_connection_type,
          url: organisation.website_url,
          stock_feed_url: verification.feedURL || `${portalBaseURL()}/api/machines?publicOrg=${encodeURIComponent(organisation.public_slug)}`,
          verification_note: verification.note || null,
          last_error: verification.error
        },
        status: verification.status
      }, { onConflict: 'organisation_id,provider_config_key' });
      if (connectionError) throw connectionError;
      await audit(supabase, id, session.clerkUserId, 'client_website_verified', { status: verification.status, type: organisation.website_connection_type });
      return response.status(200).json({ item: publicAccount(organisation, role), message: verification.note || verification.error });
    }

    if (action === 'activate_portal') {
      organisation = await refreshAcceptedMembership({ clerk, supabase, organisation }) || organisation;
      const readiness = portalReadiness({
        invitationStatus: organisation.invitation_status,
        websiteConnectionType: organisation.website_connection_type,
        websiteConnectionStatus: organisation.website_connection_status
      });
      if (!readiness.canActivate) {
        const blockers = [];
        if (!readiness.emailReady) blockers.push('the customer must accept their invitation');
        if (!readiness.websiteReady) blockers.push('the selected website connection must be verified');
        const error = new Error(`This portal cannot go live yet: ${blockers.join(' and ')}.`);
        error.statusCode = 409;
        throw error;
      }
      const activatedAt = new Date().toISOString();
      const updated = await supabase.from('organisations').update({
        portal_status: 'live',
        portal_activated_at: organisation.portal_activated_at || activatedAt
      }).eq('id', id).select(accountSelection).single();
      if (updated.error) throw updated.error;
      organisation = updated.data;
      await audit(supabase, id, session.clerkUserId, 'client_portal_activated');
      return response.status(200).json({ item: publicAccount(organisation, role) });
    }

    return response.status(400).json({ error: 'Unknown onboarding action.' });
  } catch (error) {
    return handleApiError(response, error);
  }
}

