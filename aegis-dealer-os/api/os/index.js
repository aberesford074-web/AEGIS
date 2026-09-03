import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { machineryTemplates, matchRequirements, operationalInsights, stockAgeDays } from '../../lib/os-intelligence.js';
import { organisationContext } from '../../lib/supabase.js';

async function workspace(context) {
  const orgId = context.organisation.id;
  const [machines, opportunities, activities, deals, proposals, records, connections, automations, reservations, publishingJobs, marketplacePublications] = await Promise.all([
    context.supabase.from('machines').select('*').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(1000),
    context.supabase.from('opportunities').select('*').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(500),
    context.supabase.from('activities').select('*').eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(500),
    context.supabase.from('deals').select('*').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(500),
    context.supabase.from('sales_proposals').select('*').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(500),
    context.supabase.from('business_records').select('*').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(1000),
    context.supabase.from('integration_connections').select('id,provider_config_key,display_name,status,last_synced_at').eq('organisation_id', orgId),
    context.supabase.from('automation_rules').select('id,name,kind,enabled,requires_approval,last_run_at,next_run_at').eq('organisation_id', orgId),
    context.supabase.from('machine_reservations').select('*,machine:machines(id,make,model),customer:customers(id,name)').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(500),
    context.supabase.from('publishing_jobs').select('*').eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(500),
    context.supabase.from('marketplace_publications').select('*').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(500)
  ]);
  for (const result of [machines, opportunities, activities, deals, proposals, records, connections, automations, reservations, publishingJobs, marketplacePublications]) if (result.error) throw result.error;
  const requirements = (records.data || []).filter((item) => item.record_type === 'buyer_requirement' && item.status !== 'closed');
  const available = (machines.data || []).filter((item) => ['in-stock', 'available-to-source'].includes(item.status));
  const matches = matchRequirements(requirements, available);
  const insights = operationalInsights({ machines: machines.data, opportunities: opportunities.data, activities: activities.data, deals: deals.data, matches });
  return { machines: machines.data || [], opportunities: opportunities.data || [], activities: activities.data || [], deals: deals.data || [], proposals: proposals.data || [], records: records.data || [], requirements, matches, insights, connections: connections.data || [], automations: automations.data || [], reservations: reservations.data || [], publishingJobs: publishingJobs.data || [], marketplacePublications: marketplacePublications.data || [] };
}

function commercialRecords(data) {
  const flexible = data.records.filter((item) => item.record_type === 'document');
  const reservations = data.reservations.map((item) => ({ ...item, record_type: 'reservation', data: { deposit: item.deposit_amount, expires_at: item.expires_at } }));
  return [...data.proposals.map((item) => ({ ...item, record_type: 'quotation', title: item.title, reference: item.proposal_number })), ...reservations, ...flexible]
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

async function createBusinessRecord(context, session, record) {
  const { data, error } = await context.supabase.from('business_records').insert({
    organisation_id: context.organisation.id,
    created_by_clerk_user_id: session.clerkUserId,
    source: 'dealerfoundry-os',
    ...record
  }).select('*').single();
  if (error) throw error;
  return data;
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const resource = String(request.query?.resource || 'overview');
    if (request.method === 'GET') {
      if (resource === 'templates') return response.status(200).json({ items: machineryTemplates() });
      const data = await workspace(context);
      if (resource === 'matches') return response.status(200).json({ requirements: data.requirements, matches: data.matches });
      if (resource === 'commercial') return response.status(200).json({ items: commercialRecords(data) });
      if (resource === 'integrations') return response.status(200).json({ items: data.connections, approvedProviders: ['website', 'gmail', 'whatsapp', 'csv-import', 'machinerytrader', 'mascus'] });
      if (resource === 'publishing') return response.status(200).json({ jobs: data.publishingJobs, marketplace: data.marketplacePublications, machines: data.machines });
      if (resource === 'ai') return response.status(200).json({ insights: data.insights, automations: data.automations });
      const activeStock = data.machines.filter((item) => item.status !== 'sold');
      const stockValue = activeStock.reduce((total, item) => total + Number(item.price || 0), 0);
      const grossMargin = data.deals.filter((item) => item.status === 'completed').reduce((total, item) => total + Number(item.sale_price || 0) - Number(item.purchase_price || 0) - Number(item.transport_cost || 0) - Number(item.preparation_cost || 0) - Number(item.other_costs || 0) - Number(item.commission || 0), 0);
      return response.status(200).json({
        generatedAt: new Date().toISOString(),
        metrics: { machines: data.machines.length, published: data.machines.filter((item) => item.is_published).length, stockValue, openEnquiries: data.opportunities.filter((item) => !['won', 'lost'].includes(item.stage)).length, openTasks: data.activities.filter((item) => !item.completed_at).length, quotations: data.proposals.length, requirements: data.requirements.length, matches: data.matches.length, grossMargin, agedStock: activeStock.filter((item) => stockAgeDays(item) >= 90).length },
        insights: data.insights,
        templates: machineryTemplates(),
        commercial: commercialRecords(data).slice(0, 20),
        matches: data.matches.slice(0, 20)
      });
    }

    const action = requireText(request.body?.action, 'OS action');
    if (action === 'buyer_requirement') {
      const title = requireText(request.body?.title, 'Requirement title');
      const item = await createBusinessRecord(context, session, { record_type: 'buyer_requirement', title, summary: request.body?.summary || null, status: 'active', data: request.body?.data || {}, relationships: { customer_id: request.body?.customerId || null } });
      return response.status(201).json({ item });
    }
    if (action === 'reservation') {
      const machineId = requireText(request.body?.machineId, 'Machine');
      const title = requireText(request.body?.title, 'Reservation title');
      const machine = await context.supabase.from('machines').select('id,make,model,status').eq('organisation_id', context.organisation.id).eq('id', machineId).maybeSingle();
      if (machine.error) throw machine.error;
      if (!machine.data) return response.status(404).json({ error: 'Machine not found.' });
      const { data: item, error: reservationError } = await context.supabase.from('machine_reservations').insert({
        organisation_id: context.organisation.id,
        machine_id: machineId,
        customer_id: request.body?.customerId || null,
        title,
        notes: request.body?.summary || null,
        deposit_amount: Number(request.body?.deposit || 0),
        currency: request.body?.currency || 'GBP',
        expires_at: request.body?.expiresAt || null,
        created_by_clerk_user_id: session.clerkUserId
      }).select('*').single();
      if (reservationError) {
        if (reservationError.code === '23505') {
          const conflict = new Error('This machine already has an active reservation.');
          conflict.statusCode = 409;
          throw conflict;
        }
        throw reservationError;
      }
      const update = await context.supabase.from('machines').update({ status: 'reserved' }).eq('organisation_id', context.organisation.id).eq('id', machineId);
      if (update.error) throw update.error;
      return response.status(201).json({ item });
    }
    if (action === 'document') {
      const item = await createBusinessRecord(context, session, { record_type: 'document', title: requireText(request.body?.title, 'Document title'), summary: request.body?.summary || null, status: request.body?.status || 'draft', data: { document_type: request.body?.documentType || 'general', file_url: request.body?.fileUrl || null }, relationships: request.body?.relationships || {} });
      return response.status(201).json({ item });
    }
    if (action === 'ai_assist') {
      const data = await workspace(context);
      const insight = data.insights.find((item) => item.count > 0) || data.insights[0];
      const { data: approval, error } = await context.supabase.from('approval_queue').insert({ organisation_id: context.organisation.id, requested_by_clerk_user_id: session.clerkUserId, action_type: 'ai_recommendation', payload: { objective: request.body?.objective || 'Review dealer operation', insight, proposedAction: insight.action }, status: 'pending' }).select('*').single();
      if (error) throw error;
      return response.status(201).json({ item: approval, message: 'AI recommendation prepared for human approval.' });
    }
    return response.status(400).json({ error: 'Unsupported OS action.' });
  } catch (error) {
    return handleApiError(response, error);
  }
}
