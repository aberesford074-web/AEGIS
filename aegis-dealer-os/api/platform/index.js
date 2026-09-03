import { createClerkClient } from '@clerk/backend';

import {
  initialWebsiteStatus,
  normaliseEmail,
  normaliseWebsiteConnectionType,
  normaliseWebsiteURL,
  portalBaseURL,
  portalReadiness,
  verifyWebsiteConnection
} from '../../lib/client-onboarding.js';
import { normaliseModules, portalTier, publicSlug } from '../../lib/client-portals.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { requirePlatformAdmin, requirePlatformWrite } from '../../lib/platform-admin.js';
import { createGmailState, gmailAuthorizationURL } from '../../lib/google-gmail.js';
import { createCheckoutSession, createCustomerPortalSession } from '../../lib/stripe-billing.js';

const organisationSelection = 'id,name,clerk_organisation_id,public_slug,website_url,portal_status,portal_tier,enabled_modules,client_contact_name,client_contact_email,invitation_status,website_connection_type,website_connection_status,website_last_checked_at,website_last_error,portal_activated_at,billing_required,created_at,updated_at';

function countByOrganisation(rows) {
  return (rows || []).reduce((counts, row) => {
    counts[row.organisation_id] = (counts[row.organisation_id] || 0) + 1;
    return counts;
  }, {});
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function uniqueSlug(supabase, value) {
  const base = publicSlug(value);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix ? `${base}-${suffix + 1}` : base;
    const { data, error } = await supabase.from('organisations').select('id').eq('public_slug', candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error('AEGIS could not create a unique portal address for this client.');
}

async function overview(supabase) {
  const [organisations, machines, opportunities, customers, contacts, deals, activities, approvals, connections, automations, memberships, audit, billing] = await Promise.all([
    supabase.from('organisations').select(organisationSelection).order('updated_at', { ascending: false }),
    supabase.from('machines').select('id,organisation_id,status,is_published,price,created_at,updated_at'),
    supabase.from('opportunities').select('id,organisation_id,stage,value,next_action_at,updated_at').neq('stage', 'won').neq('stage', 'lost'),
    supabase.from('customers').select('id,organisation_id'),
    supabase.from('contacts').select('id,organisation_id'),
    supabase.from('deals').select('id,organisation_id,status,sale_price,purchase_price,transport_cost,preparation_cost,other_costs,commission,updated_at'),
    supabase.from('activities').select('id,organisation_id,due_at,completed_at,updated_at').is('completed_at', null),
    supabase.from('approval_queue').select('id,organisation_id,status,action_type,created_at').eq('status', 'pending'),
    supabase.from('integration_connections').select('id,organisation_id,provider_config_key,display_name,status,last_synced_at'),
    supabase.from('automation_rules').select('id,organisation_id,enabled,next_run_at,last_run_at'),
    supabase.from('organisation_memberships').select('organisation_id,clerk_user_id,role'),
    supabase.from('audit_events').select('id,organisation_id,actor_clerk_user_id,event_type,record_type,record_id,payload,created_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('billing_subscriptions').select('organisation_id,status,stripe_price_id,current_period_end,cancel_at_period_end,last_payment_at,last_payment_failed_at')
  ]);
  const results = [organisations, machines, opportunities, customers, contacts, deals, activities, approvals, connections, automations, memberships, audit, billing];
  for (const result of results) if (result.error) throw result.error;

  const counts = {
    machines: countByOrganisation(machines.data),
    publishedMachines: countByOrganisation((machines.data || []).filter((item) => item.is_published)),
    opportunities: countByOrganisation(opportunities.data),
    customers: countByOrganisation(customers.data),
    contacts: countByOrganisation(contacts.data),
    deals: countByOrganisation((deals.data || []).filter((item) => item.status === 'completed')),
    activities: countByOrganisation(activities.data),
    approvals: countByOrganisation(approvals.data),
    connections: countByOrganisation((connections.data || []).filter((item) => ['active', 'connected'].includes(item.status))),
    automations: countByOrganisation((automations.data || []).filter((item) => item.enabled)),
    users: countByOrganisation(memberships.data)
  };
  const marginByOrganisation = (deals.data || []).filter((item) => item.status === 'completed').reduce((totals, item) => {
    totals[item.organisation_id] = (totals[item.organisation_id] || 0) + number(item.sale_price) - number(item.purchase_price) - number(item.transport_cost) - number(item.preparation_cost) - number(item.other_costs) - number(item.commission);
    return totals;
  }, {});
  const stockValueByOrganisation = (machines.data || []).filter((item) => item.status !== 'sold').reduce((totals, item) => {
    totals[item.organisation_id] = (totals[item.organisation_id] || 0) + number(item.price);
    return totals;
  }, {});
  const ageingCutoff = Date.now() - 90 * 86_400_000;
  const agedStockByOrganisation = countByOrganisation((machines.data || []).filter((item) => item.status !== 'sold' && new Date(item.created_at || item.updated_at).getTime() <= ageingCutoff));
  const billingByOrganisation = Object.fromEntries((billing.data || []).map((item) => [item.organisation_id, item]));
  const items = (organisations.data || []).map((organisation) => ({
    ...organisation,
    billing: billingByOrganisation[organisation.id] || { status: organisation.billing_required ? 'not_started' : 'not_required' },
    metrics: {
      machines: counts.machines[organisation.id] || 0,
      publishedMachines: counts.publishedMachines[organisation.id] || 0,
      opportunities: counts.opportunities[organisation.id] || 0,
      relationships: (counts.customers[organisation.id] || 0) + (counts.contacts[organisation.id] || 0),
      completedDeals: counts.deals[organisation.id] || 0,
      grossMargin: marginByOrganisation[organisation.id] || 0,
      stockValue: stockValueByOrganisation[organisation.id] || 0,
      agedStock: agedStockByOrganisation[organisation.id] || 0,
      openActivities: counts.activities[organisation.id] || 0,
      pendingApprovals: counts.approvals[organisation.id] || 0,
      activeConnections: counts.connections[organisation.id] || 0,
      enabledAutomations: counts.automations[organisation.id] || 0,
      users: counts.users[organisation.id] || 0
    }
  }));
  const organisationNames = Object.fromEntries(items.map((item) => [item.id, item.name]));
  const alerts = items.flatMap((item) => {
    const messages = [];
    if (item.invitation_status !== 'accepted') messages.push({ organisationId: item.id, organisationName: item.name, kind: 'invitation', severity: 'warning', message: 'Customer invitation is not accepted.' });
    if (item.website_connection_type !== 'none' && item.website_connection_status !== 'connected') messages.push({ organisationId: item.id, organisationName: item.name, kind: 'website', severity: 'warning', message: item.website_last_error || 'Website connection needs attention.' });
    if (item.metrics.pendingApprovals) messages.push({ organisationId: item.id, organisationName: item.name, kind: 'approval', severity: 'info', message: `${item.metrics.pendingApprovals} approval${item.metrics.pendingApprovals === 1 ? '' : 's'} waiting.` });
    return messages;
  });
  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      organisations: items.length,
      liveOrganisations: items.filter((item) => item.portal_status === 'live').length,
      setupOrganisations: items.filter((item) => item.portal_status === 'setup').length,
      machines: machines.data?.length || 0,
      publishedMachines: (machines.data || []).filter((item) => item.is_published).length,
      openOpportunities: opportunities.data?.length || 0,
      pendingApprovals: approvals.data?.length || 0,
      openActivities: activities.data?.length || 0,
      grossMargin: Object.values(marginByOrganisation).reduce((total, value) => total + value, 0),
      stockValue: Object.values(stockValueByOrganisation).reduce((total, value) => total + value, 0),
      agedStock: Object.values(agedStockByOrganisation).reduce((total, value) => total + value, 0)
    },
    organisations: items,
    alerts,
    recentActivity: (audit.data || []).map((item) => ({ ...item, organisationName: organisationNames[item.organisation_id] || 'Unknown dealer' }))
  };
}

const resources = {
  machines: { table: 'machines', selection: 'id,organisation_id,make,model,serial_number,website_category,status,is_published,price,currency,image_urls,updated_at' },
  opportunities: { table: 'opportunities', selection: 'id,organisation_id,title,stage,value,next_action,next_action_at,source,updated_at' },
  relationships: { table: 'customers', selection: 'id,organisation_id,name,lifecycle_stage,relationship_roles,primary_contact_name,primary_contact_email,primary_contact_phone,notes,updated_at' },
  activities: { table: 'activities', selection: 'id,organisation_id,activity_type,body,due_at,completed_at,created_at,updated_at' },
  proposals: { table: 'sales_proposals', selection: 'id,organisation_id,proposal_number,title,status,total_price,currency,valid_until,customer_id,machine_id,updated_at' },
  deals: { table: 'deals', selection: 'id,organisation_id,reference,deal_type,status,machine_id,purchase_price,sale_price,transport_cost,preparation_cost,other_costs,commission,currency,updated_at' },
  requirements: { table: 'business_records', selection: 'id,organisation_id,record_type,title,summary,status,data,relationships,updated_at', filters: { record_type: 'buyer_requirement' } },
  commercial_records: { table: 'business_records', selection: 'id,organisation_id,record_type,title,summary,status,data,relationships,updated_at', filterIn: { record_type: ['reservation', 'document'] } },
  ai_records: { table: 'approval_queue', selection: 'id,organisation_id,action_type,payload,status,created_at,decided_at', filters: { action_type: 'ai_recommendation' }, sort: 'created_at' },
  approvals: { table: 'approval_queue', selection: 'id,organisation_id,action_type,payload,status,created_at,decided_at', sort: 'created_at' },
  connections: { table: 'integration_connections', selection: 'id,organisation_id,provider_config_key,display_name,status,last_synced_at,created_at', sort: 'created_at' },
  platform_connections: { table: 'platform_integration_connections', selection: 'id,provider_config_key,display_name,status,last_synced_at,created_at,updated_at', sort: 'created_at', organisationScoped: false },
  automations: { table: 'automation_rules', selection: 'id,organisation_id,name,kind,enabled,cadence_minutes,requires_approval,last_run_at,next_run_at,updated_at' },
  appointments: { table: 'website_consultations', selection: 'id,business_name,contact_name,contact_email,contact_phone,current_website_url,notes,starts_at,ends_at,timezone,status,source,created_at,updated_at', sort: 'starts_at', ascending: true, organisationScoped: false },
  audit: { table: 'audit_events', selection: 'id,organisation_id,actor_clerk_user_id,event_type,record_type,record_id,payload,created_at' }
};

async function records(supabase, resource, organisationId) {
  const definition = resources[resource];
  if (!definition) {
    const error = new Error('Unknown platform resource.');
    error.statusCode = 404;
    throw error;
  }
  let query = supabase.from(definition.table).select(definition.selection);
  if (organisationId && definition.organisationScoped !== false) query = query.eq('organisation_id', organisationId);
  for (const [key, value] of Object.entries(definition.filters || {})) query = query.eq(key, value);
  for (const [key, value] of Object.entries(definition.filterIn || {})) query = query.in(key, value);
  const sortField = definition.sort || (resource === 'audit' ? 'created_at' : 'updated_at');
  const { data, error } = await query.order(sortField, { ascending: definition.ascending === true }).limit(500);
  if (error) throw error;
  return data || [];
}

async function updateRecord(session, resource, body) {
  requirePlatformWrite(session);
  const id = requireText(body?.id, 'Record ID');
  const organisationId = requireText(body?.organisationId, 'Organisation ID');
  const definitions = {
    organisation: { table: 'organisations', allowed: ['portal_status', 'website_url', 'website_connection_type', 'website_connection_status', 'enabled_modules'] },
    machine: { table: 'machines', allowed: ['is_published', 'status', 'website_category'] },
    automation: { table: 'automation_rules', allowed: ['enabled'] },
    approval: { table: 'approval_queue', allowed: ['status'] }
  };
  const definition = definitions[resource];
  if (!definition) {
    const error = new Error('This platform resource cannot be changed.');
    error.statusCode = 400;
    throw error;
  }
  if (resource === 'organisation' && id !== organisationId) {
    const error = new Error('The organisation record does not match the selected dealer.');
    error.statusCode = 400;
    throw error;
  }
  const changes = Object.fromEntries(Object.entries(body?.changes || {}).filter(([key]) => definition.allowed.includes(key)));
  if (!Object.keys(changes).length) {
    const error = new Error('No permitted changes were supplied.');
    error.statusCode = 400;
    throw error;
  }
  if (resource === 'approval' && !['approved', 'rejected'].includes(changes.status)) {
    const error = new Error('An approval may only be approved or rejected here.');
    error.statusCode = 400;
    throw error;
  }
  if (resource === 'approval') {
    changes.approved_by_clerk_user_id = session.clerkUserId;
    changes.decided_at = new Date().toISOString();
  }
  if (resource === 'machine' && changes.is_published === true) changes.published_at = new Date().toISOString();
  const idColumn = resource === 'organisation' ? 'id' : 'id';
  let query = session.supabase.from(definition.table).update(changes).eq(idColumn, id);
  if (resource !== 'organisation') query = query.eq('organisation_id', organisationId);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  if (!data) {
    const missing = new Error('Record not found in the selected dealer.');
    missing.statusCode = 404;
    throw missing;
  }
  await session.supabase.from('audit_events').insert({
    organisation_id: organisationId,
    actor_clerk_user_id: session.clerkUserId,
    event_type: `platform.${resource}.updated`,
    record_type: resource,
    record_id: resource === 'organisation' ? null : id,
    payload: { changes }
  });
  return data;
}

async function createOrganisation(session, body) {
  requirePlatformWrite(session);
  const name = requireText(body?.name, 'Client business name');
  const email = normaliseEmail(body?.clientContactEmail);
  const modules = normaliseModules(body?.enabledModules);
  const connectionType = normaliseWebsiteConnectionType(body?.websiteConnectionType);
  const websiteURL = normaliseWebsiteURL(body?.websiteUrl, connectionType);
  const slug = await uniqueSlug(session.supabase, body?.publicSlug || name);
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const clerkOrganisation = await clerk.organizations.createOrganization({ name, slug });
  const { data: organisation, error } = await session.supabase.from('organisations').insert({
    clerk_organisation_id: clerkOrganisation.id,
    name,
    public_slug: slug,
    website_url: websiteURL,
    portal_status: 'setup',
    portal_tier: portalTier(modules),
    enabled_modules: modules,
    client_contact_name: String(body?.clientContactName || '').trim() || null,
    client_contact_email: email,
    invitation_status: 'not_sent',
    website_connection_type: connectionType,
    website_connection_status: initialWebsiteStatus(connectionType)
  }).select(organisationSelection).single();
  if (error) {
    await clerk.organizations.deleteOrganization(clerkOrganisation.id).catch(() => undefined);
    throw error;
  }
  const invitation = await clerk.organizations.createOrganizationInvitation({
    organizationId: clerkOrganisation.id,
    emailAddress: email,
    role: 'org:member',
    redirectUrl: portalBaseURL()
  });
  const { data: updated, error: updateError } = await session.supabase.from('organisations').update({
    invitation_id: invitation.id,
    invitation_status: invitation.status === 'accepted' ? 'accepted' : 'pending',
    invitation_sent_at: new Date(invitation.createdAt || Date.now()).toISOString()
  }).eq('id', organisation.id).select(organisationSelection).single();
  if (updateError) throw updateError;
  await session.supabase.from('audit_events').insert({
    organisation_id: organisation.id,
    actor_clerk_user_id: session.clerkUserId,
    event_type: 'platform.organisation.created',
    record_type: 'organisation',
    record_id: organisation.id,
    payload: { modules, websiteConnectionType: connectionType }
  });
  return updated;
}

async function organisationAction(session, body) {
  requirePlatformWrite(session);
  const organisationId = requireText(body?.organisationId, 'Organisation ID');
  const action = requireText(body?.action, 'Action');
  const { data: organisation, error } = await session.supabase.from('organisations')
    .select(organisationSelection).eq('id', organisationId).maybeSingle();
  if (error) throw error;
  if (!organisation) {
    const missing = new Error('Dealer organisation not found.');
    missing.statusCode = 404;
    throw missing;
  }
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  let changes = {};
  let message = '';
  let redirectUrl = null;
  if (action === 'refresh_invitation') {
    const users = await clerk.users.getUserList({ emailAddress: [organisation.client_contact_email], limit: 20 });
    const user = users.data?.[0];
    if (user) {
      const memberships = await clerk.users.getOrganizationMembershipList({ userId: user.id, limit: 100 });
      const accepted = memberships.data.find((item) => item.organization.id === organisation.clerk_organisation_id);
      if (accepted) {
        const role = ['org:admin', 'org:owner'].includes(accepted.role) ? 'manager' : 'operations';
        const membership = await session.supabase.from('organisation_memberships').upsert({
          organisation_id: organisation.id,
          clerk_user_id: user.id,
          role
        });
        if (membership.error) throw membership.error;
        changes = { invitation_status: 'accepted', invitation_accepted_at: organisation.invitation_accepted_at || new Date().toISOString(), invitation_last_error: null };
        message = 'Customer access is active.';
      }
    }
    if (!Object.keys(changes).length) message = 'The customer invitation is still waiting to be accepted.';
  } else if (action === 'resend_invitation') {
    const pending = await clerk.organizations.getOrganizationInvitationList({ organizationId: organisation.clerk_organisation_id, status: ['pending'], limit: 100 });
    for (const invitation of pending.data || []) {
      if (String(invitation.emailAddress || '').toLowerCase() === organisation.client_contact_email) {
        await clerk.organizations.revokeOrganizationInvitation({ organizationId: organisation.clerk_organisation_id, invitationId: invitation.id });
      }
    }
    const sent = await clerk.organizations.createOrganizationInvitation({
      organizationId: organisation.clerk_organisation_id,
      emailAddress: organisation.client_contact_email,
      role: 'org:member',
      redirectUrl: portalBaseURL()
    });
    changes = { invitation_id: sent.id, invitation_status: 'pending', invitation_sent_at: new Date(sent.createdAt || Date.now()).toISOString(), invitation_accepted_at: null, invitation_last_error: null };
    message = 'A new secure invitation was sent.';
  } else if (action === 'verify_website') {
    const verification = await verifyWebsiteConnection({ type: organisation.website_connection_type, websiteURL: organisation.website_url, publicSlug: organisation.public_slug });
    changes = { website_connection_status: verification.status, website_last_checked_at: verification.checkedAt, website_last_error: verification.error };
    message = verification.note || verification.error || 'Website check complete.';
    const connection = await session.supabase.from('integration_connections').upsert({
      organisation_id: organisation.id,
      provider_config_key: 'website',
      nango_connection_id: `website:${organisation.id}`,
      display_name: 'Dealer website',
      configuration: { type: organisation.website_connection_type, url: organisation.website_url, stock_feed_url: verification.feedURL || `${portalBaseURL()}/api/machines?publicOrg=${encodeURIComponent(organisation.public_slug)}` },
      status: verification.status
    }, { onConflict: 'organisation_id,provider_config_key' });
    if (connection.error) throw connection.error;
  } else if (action === 'activate_portal') {
    const { data: billing, error: billingError } = await session.supabase
      .from('billing_subscriptions')
      .select('status')
      .eq('organisation_id', organisation.id)
      .maybeSingle();
    if (billingError) throw billingError;
    const readiness = portalReadiness({
      invitationStatus: organisation.invitation_status,
      websiteConnectionType: organisation.website_connection_type,
      websiteConnectionStatus: organisation.website_connection_status,
      billingRequired: organisation.billing_required,
      billingStatus: billing?.status
    });
    if (!readiness.canActivate) {
      const blocked = new Error('The customer invitation, required website connection and active subscription must be ready before activation.');
      blocked.statusCode = 409;
      throw blocked;
    }
    changes = { portal_status: 'live', portal_activated_at: organisation.portal_activated_at || new Date().toISOString() };
    message = 'The dealer portal is live.';
  } else if (action === 'create_checkout') {
    const checkout = await createCheckoutSession({ supabase: session.supabase, organisation });
    redirectUrl = checkout.url;
    changes = { billing_required: true };
    message = 'Stripe Checkout is ready for this dealer.';
  } else if (action === 'billing_portal') {
    const portal = await createCustomerPortalSession({ supabase: session.supabase, organisationID: organisation.id });
    redirectUrl = portal.url;
    message = 'Stripe Billing Portal is ready.';
  } else {
    const unknown = new Error('Unknown organisation action.');
    unknown.statusCode = 400;
    throw unknown;
  }
  let updated = organisation;
  if (Object.keys(changes).length) {
    const result = await session.supabase.from('organisations').update(changes).eq('id', organisation.id).select(organisationSelection).single();
    if (result.error) throw result.error;
    updated = result.data;
  }
  await session.supabase.from('audit_events').insert({ organisation_id: organisation.id, actor_clerk_user_id: session.clerkUserId, event_type: `platform.organisation.${action}`, record_type: 'organisation', record_id: organisation.id });
  return { item: updated, message, redirectUrl };
}

async function platformAction(session, action) {
  requirePlatformWrite(session);
  if (action !== 'connect_platform_gmail') {
    const error = new Error('Unknown platform action.');
    error.statusCode = 400;
    throw error;
  }
  const state = createGmailState({ clerkUserId: session.clerkUserId, scope: 'platform' });
  return {
    message: 'Google authorisation is ready.',
    authorizationUrl: gmailAuthorizationURL(state)
  };
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    const session = await requirePlatformAdmin(request);
    if (request.method === 'POST') {
      if (request.body?.action === 'connect_platform_gmail') {
        return response.status(200).json(await platformAction(session, request.body.action));
      }
      if (request.body?.action) return response.status(200).json(await organisationAction(session, request.body));
      return response.status(201).json({ item: await createOrganisation(session, request.body) });
    }
    if (request.method === 'PATCH') {
      const item = await updateRecord(session, String(request.query?.resource || ''), request.body);
      return response.status(200).json({ item });
    }
    const resource = String(request.query?.resource || 'overview');
    if (resource === 'overview') return response.status(200).json(await overview(session.supabase));
    if (resource === 'organisations') {
      const data = await overview(session.supabase);
      return response.status(200).json({ items: data.organisations });
    }
    const items = await records(session.supabase, resource, String(request.query?.organisationId || '').trim());
    return response.status(200).json({ items });
  } catch (error) {
    return handleApiError(response, error);
  }
}
