import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../lib/http.js';
import { organisationContext, requireManager } from '../../lib/supabase.js';
import { refreshGmailCredentials, sealGmailCredentials, sendGmailMessage, unsealGmailCredentials } from '../../lib/google-gmail.js';

const pick = (value, fields) => Object.fromEntries(Object.entries(value || {}).filter(([key, item]) => fields.includes(key) && item !== undefined));
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

async function assertOrganisationRecord(context, table, id) {
  if (!id) return;
  const { data, error } = await context.supabase.from(table).select('id').eq('id', id).eq('organisation_id', context.organisation.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`The linked ${table} record is not part of this dealer workspace.`);
}

async function executeApproved(context, session, approval) {
  const endpoint = String(approval.payload?.endpoint || '');
  const body = approval.payload?.body && typeof approval.payload.body === 'object' ? approval.payload.body : {};
  const orgId = context.organisation.id;
  let table;
  let payload;

  if (approval.action_type === 'send_email') {
    const to = String(approval.payload?.to || '').trim();
    const subject = String(approval.payload?.subject || '').trim();
    const bodyText = String(approval.payload?.body || '').trim();
    if (!to || !subject || !bodyText) throw new Error('This email approval is missing its recipient, subject or body. Prepare a new email approval.');
    const { data: connection, error: connectionError } = await context.supabase
      .from('integration_connections')
      .select('id, configuration, status')
      .eq('organisation_id', orgId)
      .eq('provider_config_key', 'gmail')
      .eq('status', 'active')
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection?.configuration?.credential) throw new Error('Gmail is not connected. Open Connections and connect Gmail before approving this email.');
    if (!(connection.configuration.granted_scopes || []).includes(GMAIL_SEND_SCOPE)) {
      throw new Error('Gmail needs one permission upgrade before it can send. Open Connections and choose Authorise Gmail sending, then approve the email again.');
    }

    let credentials = unsealGmailCredentials(connection.configuration.credential);
    if (!credentials.accessToken || Number(credentials.expiresAt || 0) < Date.now() + 60_000) {
      credentials = await refreshGmailCredentials(credentials);
      const sealed = sealGmailCredentials({
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken,
        expires_in: Math.max(1, Math.floor((credentials.expiresAt - Date.now()) / 1000)),
        token_type: credentials.tokenType,
        scope: credentials.scope
      });
      const { error: refreshError } = await context.supabase
        .from('integration_connections')
        .update({
          configuration: { ...connection.configuration, credential: sealed },
          last_synced_at: new Date().toISOString()
        })
        .eq('id', connection.id)
        .eq('organisation_id', orgId);
      if (refreshError) throw refreshError;
    }
    const sent = await sendGmailMessage(credentials.accessToken, { to, subject, body: bodyText });
    await context.supabase.from('audit_events').insert({
      organisation_id: orgId,
      actor_clerk_user_id: session.clerkUserId,
      event_type: 'gmail.email.sent',
      record_type: 'approval_queue',
      record_id: approval.id,
      payload: { approvalId: approval.id, gmailMessageId: sent.id, to, subject }
    });
    return { id: sent.id, provider: 'gmail', to, subject, status: 'sent' };
  }

  if (endpoint.startsWith('api/customers?resource=contacts')) {
    table = 'contacts';
    await assertOrganisationRecord(context, 'customers', body.customer_id);
    payload = { organisation_id: orgId, ...pick(body, ['customer_id', 'first_name', 'last_name', 'job_title', 'email', 'phone', 'notes', 'source']) };
  } else if (endpoint === 'api/customers') {
    table = 'customers';
    payload = { organisation_id: orgId, ...pick(body, ['name', 'website', 'lifecycle_stage', 'relationship_roles', 'primary_contact_name', 'primary_contact_email', 'primary_contact_phone', 'address', 'notes']) };
  } else if (endpoint === 'api/machines') {
    table = 'machines';
    await assertOrganisationRecord(context, 'customers', body.customer_id);
    payload = { organisation_id: orgId, ...pick(body, ['customer_id', 'serial_number', 'make', 'model', 'machine_type', 'year', 'hours', 'ownership_status', 'status', 'condition', 'location', 'price', 'currency', 'description', 'image_urls']), is_published: false };
  } else if (endpoint === 'api/opportunities') {
    table = 'opportunities';
    await assertOrganisationRecord(context, 'customers', body.customerId || body.customer_id);
    await assertOrganisationRecord(context, 'machines', body.machineId || body.machine_id);
    payload = { organisation_id: orgId, title: body.title, customer_id: body.customerId || body.customer_id || null, machine_id: body.machineId || body.machine_id || null, owner_clerk_user_id: session.clerkUserId, stage: body.stage || 'new', value: body.value ?? null, next_action: body.nextAction || body.next_action || null, source: 'aegis-ai-approved' };
  } else if (endpoint.startsWith('api/opportunities?resource=sales')) {
    table = 'sales';
    await assertOrganisationRecord(context, 'customers', body.customerId);
    await assertOrganisationRecord(context, 'machines', body.machineId);
    payload = { organisation_id: orgId, customer_id: body.customerId || null, machine_id: body.machineId || null, owner_clerk_user_id: session.clerkUserId, reference: body.reference || null, sale_price: body.salePrice ?? body.value ?? null, currency: body.currency || 'GBP', status: body.status || 'completed', notes: body.notes || null };
  } else if (endpoint === 'api/deals') {
    table = 'deals';
    await assertOrganisationRecord(context, 'machines', body.machineId);
    await assertOrganisationRecord(context, 'customers', body.buyerCustomerId);
    await assertOrganisationRecord(context, 'customers', body.sellerCustomerId);
    payload = { organisation_id: orgId, reference: body.reference, deal_type: body.dealType || 'owned_stock', status: body.status || 'draft', machine_id: body.machineId, buyer_customer_id: body.buyerCustomerId || null, seller_customer_id: body.sellerCustomerId || null, salesperson_clerk_user_id: session.clerkUserId, purchase_price: body.purchasePrice ?? null, sale_price: body.salePrice ?? null, transport_cost: body.transportCost || 0, preparation_cost: body.preparationCost || 0, other_costs: body.otherCosts || 0, commission: body.commission || 0, currency: body.currency || 'GBP', notes: body.notes || null };
  } else if (endpoint === 'api/activities') {
    table = 'activities';
    await assertOrganisationRecord(context, 'customers', body.customer_id);
    await assertOrganisationRecord(context, 'contacts', body.contact_id);
    await assertOrganisationRecord(context, 'machines', body.machine_id);
    await assertOrganisationRecord(context, 'deals', body.deal_id);
    payload = { organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, ...pick(body, ['customer_id', 'contact_id', 'machine_id', 'deal_id', 'opportunity_id', 'activity_type', 'body', 'due_at', 'metadata']) };
  } else if (endpoint === 'api/automations') {
    table = 'automation_rules';
    payload = { organisation_id: orgId, name: body.name, kind: body.kind, cadence_minutes: body.cadenceMinutes || 1440, configuration: body.configuration || {}, requires_approval: body.requiresApproval !== false };
  } else if (endpoint === 'api/campaigns') {
    // AI may prepare a campaign, but scheduling a bulk send remains a separate
    // explicit manager action in the Campaigns screen.
    table = 'email_campaigns';
    payload = {
      organisation_id: orgId,
      name: body.name,
      subject: body.subject,
      body: body.body,
      status: 'draft',
      audience_filter: { marketingStatus: body.audience === 'all_eligible' ? 'all_eligible' : 'subscribed' },
      created_by_clerk_user_id: session.clerkUserId
    };
  } else if (endpoint === 'api/integrations') {
    if (body.providerConfigKey !== 'website') {
      throw new Error('OAuth connections cannot be created from an approval. Open Connections and authorise the provider directly.');
    }
    table = 'integration_connections';
    payload = { organisation_id: orgId, provider_config_key: 'website', nango_connection_id: `website:${orgId}`, display_name: body.displayName || null, configuration: body.configuration || {}, status: 'active' };
  } else {
    throw new Error('This approved action type is not executable.');
  }

  const { data, error } = await context.supabase.from(table).insert(payload).select('*').single();
  if (error) throw error;
  if (table === 'deals' && data.status === 'completed' && data.machine_id) {
    const events = [];
    if (data.seller_customer_id) events.push({ role: 'seller', customer_id: data.seller_customer_id });
    if (data.buyer_customer_id) events.push({ role: 'buyer', customer_id: data.buyer_customer_id });
    if (events.length) {
      const { error: ownershipError } = await context.supabase.from('machine_ownership_events').insert(events.map((event) => ({ organisation_id: orgId, machine_id: data.machine_id, deal_id: data.id, ...event })));
      if (ownershipError) throw ownershipError;
    }
    await context.supabase.from('machines').update({ status: 'sold', is_published: false, customer_id: data.buyer_customer_id || null }).eq('organisation_id', orgId).eq('id', data.machine_id);
  }
  await context.supabase.from('audit_events').insert({ organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, event_type: 'approval.executed', record_type: table, record_id: data.id, payload: { approvalId: approval.id, endpoint } });
  return data;
}

export function approvalRequiresExecution(approval) {
  return approval?.action_type === 'send_email' || Boolean(approval?.payload?.endpoint);
}

export default async function handler(request, response) {
  if (request.method !== 'PATCH') return methodNotAllowed(response, ['PATCH']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    requireManager(context.membership);
    const decision = request.body?.decision;
    if (!['approved', 'rejected'].includes(decision)) return response.status(400).json({ error: 'Decision must be approved or rejected.' });
    const { data: pending, error: readError } = await context.supabase.from('approval_queue').select('*').eq('id', request.query.id).eq('organisation_id', context.organisation.id).eq('status', 'pending').maybeSingle();
    if (readError) throw readError;
    if (!pending) return response.status(404).json({ error: 'Pending approval not found.' });

    console.info('[approvals] decision received', { approvalId: pending.id, actionType: pending.action_type, decision });
    let executedRecord = null;
    if (decision === 'approved' && approvalRequiresExecution(pending)) {
      executedRecord = await executeApproved(context, session, pending);
      console.info('[approvals] action executed', { approvalId: pending.id, actionType: pending.action_type, executionStatus: executedRecord?.status || 'completed' });
    }
    const finalStatus = executedRecord ? 'executed' : decision;
    const now = new Date().toISOString();
    const { data, error } = await context.supabase.from('approval_queue').update({ status: finalStatus, approved_by_clerk_user_id: session.clerkUserId, decided_at: now, executed_at: executedRecord ? now : null }).eq('id', pending.id).eq('status', 'pending').select('*').maybeSingle();
    if (error) throw error;
    return response.status(200).json({ item: data, executedRecord });
  } catch (error) {
    console.error('[approvals] decision failed', { approvalId: request.query?.id, error: String(error?.message || error) });
    return handleApiError(response, error);
  }
}
