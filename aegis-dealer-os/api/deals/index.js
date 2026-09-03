import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext } from '../../lib/supabase.js';

const number = (value) => value === '' || value == null ? null : Number(value);
const cost = (value) => Number.isFinite(number(value)) ? number(value) : 0;

function payload(body, organisationId, userId) {
  return {
    organisation_id: organisationId,
    reference: body?.reference || null,
    deal_type: body?.dealType || 'owned_stock',
    status: body?.status || 'draft',
    machine_id: body?.machineId || null,
    opportunity_id: body?.opportunityId || null,
    buyer_customer_id: body?.buyerCustomerId || null,
    buyer_contact_id: body?.buyerContactId || null,
    seller_customer_id: body?.sellerCustomerId || null,
    seller_contact_id: body?.sellerContactId || null,
    salesperson_clerk_user_id: body?.salespersonClerkUserId || userId,
    purchase_price: number(body?.purchasePrice),
    sale_price: number(body?.salePrice),
    transport_cost: cost(body?.transportCost),
    preparation_cost: cost(body?.preparationCost),
    other_costs: cost(body?.otherCosts),
    commission: cost(body?.commission),
    currency: body?.currency || 'GBP',
    completed_at: body?.status === 'completed' ? (body?.completedAt || new Date().toISOString()) : null,
    notes: body?.notes || null
  };
}

function present(row) {
  const totalCosts = cost(row.transport_cost) + cost(row.preparation_cost) + cost(row.other_costs) + cost(row.commission);
  const grossMargin = row.sale_price == null ? null : cost(row.sale_price) - cost(row.purchase_price) - totalCosts;
  return {
    ...row,
    buyer_name: row.buyer?.name || null,
    seller_name: row.seller?.name || null,
    machine_label: [row.machine?.make, row.machine?.model].filter(Boolean).join(' '),
    gross_margin: grossMargin
  };
}

async function recordOwnership(context, deal) {
  if (!deal.machine_id || deal.status !== 'completed') return;
  const events = [];
  if (deal.seller_customer_id) events.push({ role: 'seller', customer_id: deal.seller_customer_id });
  if (deal.buyer_customer_id) events.push({ role: 'buyer', customer_id: deal.buyer_customer_id });
  if (events.length) {
    const { error } = await context.supabase.from('machine_ownership_events').insert(events.map((event) => ({
      organisation_id: context.organisation.id,
      machine_id: deal.machine_id,
      deal_id: deal.id,
      effective_at: deal.completed_at || new Date().toISOString(),
      ...event
    })));
    if (error) throw error;
  }
  await context.supabase.from('machines').update({ status: 'sold', is_published: false, customer_id: deal.buyer_customer_id || null })
    .eq('organisation_id', context.organisation.id).eq('id', deal.machine_id);
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;
    const selection = '*,buyer:customers!deals_buyer_customer_id_fkey(id,name),seller:customers!deals_seller_customer_id_fkey(id,name),machine:machines(id,make,model,serial_number)';
    if (request.method === 'GET') {
      let query = context.supabase.from('deals').select(selection).eq('organisation_id', orgId);
      if (request.query?.status) query = query.eq('status', request.query.status);
      const { data, error } = await query.order('updated_at', { ascending: false }).limit(500);
      if (error) throw error;
      return response.status(200).json({ items: (data || []).map(present) });
    }
    if (request.method === 'POST') {
      const body = payload(request.body, orgId, session.clerkUserId);
      body.reference = requireText(body.reference, 'Deal reference');
      if (!body.machine_id) return response.status(400).json({ error: 'A deal must link a machine.' });
      if (!body.buyer_customer_id && !body.seller_customer_id) return response.status(400).json({ error: 'Link a buyer or seller to the deal.' });
      const { data, error } = await context.supabase.from('deals').insert(body).select('*').single();
      if (error) throw error;
      await recordOwnership(context, data);
      await context.supabase.from('audit_events').insert({ organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, event_type: 'deal.created', record_type: 'deal', record_id: data.id, payload: { reference: data.reference, status: data.status } });
      return response.status(201).json({ item: present(data) });
    }
    const id = requireText(request.body?.id, 'Deal ID');
    const body = payload(request.body, orgId, session.clerkUserId);
    delete body.organisation_id;
    const { data, error } = await context.supabase.from('deals').update(body).eq('organisation_id', orgId).eq('id', id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ error: 'Deal not found.' });
    await recordOwnership(context, data);
    return response.status(200).json({ item: present(data) });
  } catch (error) { return handleApiError(response, error); }
}
