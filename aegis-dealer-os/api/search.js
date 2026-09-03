import { requireOrganisationSession } from '../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../lib/http.js';
import { organisationContext } from '../lib/supabase.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;
    const raw = String(request.query?.q || '').trim();
    if (raw.length < 2) return response.status(400).json({ error: 'Search needs at least two characters.' });
    const q = raw.replace(/[%_,]/g, ' ');
    const [companies, contacts, machines, deals, opportunities, activities] = await Promise.all([
      context.supabase.from('customers').select('id,name,lifecycle_stage,relationship_roles').eq('organisation_id', orgId).or(`name.ilike.%${q}%,primary_contact_name.ilike.%${q}%,primary_contact_email.ilike.%${q}%`).limit(20),
      context.supabase.from('contacts').select('id,first_name,last_name,email,phone,customer_id').eq('organisation_id', orgId).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(20),
      context.supabase.from('machines').select('id,make,model,serial_number,status').eq('organisation_id', orgId).or(`make.ilike.%${q}%,model.ilike.%${q}%,serial_number.ilike.%${q}%,machine_type.ilike.%${q}%`).limit(20),
      context.supabase.from('deals').select('id,reference,status,machine_id,buyer_customer_id,seller_customer_id').eq('organisation_id', orgId).ilike('reference', `%${q}%`).limit(20),
      context.supabase.from('opportunities').select('id,title,stage,next_action').eq('organisation_id', orgId).or(`title.ilike.%${q}%,next_action.ilike.%${q}%`).limit(20),
      context.supabase.from('activities').select('id,activity_type,body,due_at,completed_at').eq('organisation_id', orgId).ilike('body', `%${q}%`).limit(20)
    ]);
    for (const result of [companies, contacts, machines, deals, opportunities, activities]) if (result.error) throw result.error;
    const results = [
      ...(companies.data || []).map((item) => ({ type: 'company', title: item.name, status: item.lifecycle_stage, ...item })),
      ...(contacts.data || []).map((item) => ({ type: 'contact', title: [item.first_name, item.last_name].filter(Boolean).join(' '), status: item.email || item.phone, ...item })),
      ...(machines.data || []).map((item) => ({ type: 'machine', title: [item.make, item.model].filter(Boolean).join(' '), status: item.status, ...item })),
      ...(deals.data || []).map((item) => ({ type: 'deal', title: item.reference, status: item.status, ...item })),
      ...(opportunities.data || []).map((item) => ({ type: 'opportunity', title: item.title, status: item.stage, ...item })),
      ...(activities.data || []).map((item) => ({ type: 'activity', title: item.body || item.activity_type, status: item.completed_at ? 'completed' : 'open', ...item }))
    ];
    return response.status(200).json({ query: raw, count: results.length, items: results });
  } catch (error) { return handleApiError(response, error); }
}
