import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext } from '../../lib/supabase.js';

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;
    const isSale = request.query?.resource === 'sales' || request.body?.resource === 'sale';
    if (request.method === 'GET') {
      const table = isSale ? 'sales' : 'opportunities';
      const order = isSale ? 'sale_date' : 'updated_at';
      const { data, error } = await context.supabase.from(table).select('*').eq('organisation_id', orgId).order(order, { ascending: false }).limit(500);
      if (error) throw error;
      return response.status(200).json({ items: data });
    }
    if (isSale && request.method === 'POST') {
      const payload = {
        organisation_id: orgId,
        customer_id: request.body?.customerId || null,
        contact_id: request.body?.contactId || null,
        machine_id: request.body?.machineId || null,
        opportunity_id: request.body?.opportunityId || null,
        owner_clerk_user_id: session.clerkUserId,
        reference: request.body?.reference || null,
        sale_price: request.body?.salePrice ?? null,
        currency: request.body?.currency || 'GBP',
        status: request.body?.status || 'completed',
        sale_date: request.body?.saleDate || new Date().toISOString().slice(0, 10),
        notes: request.body?.notes || null
      };
      const { data, error } = await context.supabase.from('sales').insert(payload).select('*').single();
      if (error) throw error;
      if (payload.machine_id) await context.supabase.from('machines').update({ status: 'sold', is_published: false }).eq('organisation_id', orgId).eq('id', payload.machine_id);
      if (payload.opportunity_id) await context.supabase.from('opportunities').update({ stage: 'won' }).eq('organisation_id', orgId).eq('id', payload.opportunity_id);
      await context.supabase.from('audit_events').insert({ organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, event_type: 'sale.recorded', record_type: 'sale', record_id: data.id, payload: { salePrice: data.sale_price, reference: data.reference } });
      return response.status(201).json({ item: data });
    }
    if (request.method === 'PATCH') {
      const id = requireText(request.body?.id, 'Opportunity ID');
      const allowed = ['title', 'customer_id', 'machine_id', 'owner_clerk_user_id', 'stage', 'value', 'next_action', 'next_action_at', 'source'];
      const payload = Object.fromEntries(Object.entries(request.body || {}).filter(([key, value]) => allowed.includes(key) && value !== undefined));
      const { data, error } = await context.supabase.from('opportunities').update(payload).eq('organisation_id', orgId).eq('id', id).select('*').maybeSingle();
      if (error) throw error;
      if (!data) return response.status(404).json({ error: 'Opportunity not found.' });
      return response.status(200).json({ item: data });
    }
    const title = requireText(request.body?.title, 'Opportunity title');
    const payload = { organisation_id: orgId, title, customer_id: request.body?.customerId || null, machine_id: request.body?.machineId || null, owner_clerk_user_id: request.body?.ownerClerkUserId || session.clerkUserId, stage: request.body?.stage || 'new', value: request.body?.value ?? null, next_action: request.body?.nextAction || null, next_action_at: request.body?.nextActionAt || null, source: request.body?.source || 'manual' };
    const { data, error } = await context.supabase.from('opportunities').insert(payload).select('*').single();
    if (error) throw error;
    await context.supabase.from('audit_events').insert({ organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, event_type: 'opportunity.created', record_type: 'opportunity', record_id: data.id });
    return response.status(201).json({ item: data });
  } catch (error) {
    return handleApiError(response, error);
  }
}
