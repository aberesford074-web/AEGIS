import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext } from '../../lib/supabase.js';

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;
    if (request.method === 'GET') {
      const { data, error } = await context.supabase.from('activities')
        .select('*,customer:customers(id,name),contact:contacts(id,first_name,last_name),machine:machines(id,make,model),deal:deals(id,reference)')
        .eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return response.status(200).json({ items: (data || []).map((row) => ({
        ...row,
        relationship_name: row.customer?.name || [row.contact?.first_name, row.contact?.last_name].filter(Boolean).join(' ') || null,
        machine_label: [row.machine?.make, row.machine?.model].filter(Boolean).join(' '),
        deal_reference: row.deal?.reference || null
      })) });
    }
    const fields = ['opportunity_id', 'customer_id', 'contact_id', 'machine_id', 'deal_id', 'activity_type', 'body', 'due_at', 'completed_at', 'assigned_to_clerk_user_id', 'metadata'];
    const body = Object.fromEntries(Object.entries(request.body || {}).filter(([key, value]) => fields.includes(key) && value !== undefined));
    if (request.method === 'POST') {
      body.organisation_id = orgId;
      body.actor_clerk_user_id = session.clerkUserId;
      body.activity_type = requireText(body.activity_type, 'Activity type');
      const { data, error } = await context.supabase.from('activities').insert(body).select('*').single();
      if (error) throw error;
      return response.status(201).json({ item: data });
    }
    const id = requireText(request.body?.id, 'Activity ID');
    const { data, error } = await context.supabase.from('activities').update(body).eq('organisation_id', orgId).eq('id', id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ error: 'Activity not found.' });
    return response.status(200).json({ item: data });
  } catch (error) { return handleApiError(response, error); }
}
