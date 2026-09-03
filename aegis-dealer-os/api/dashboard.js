import { requireOrganisationSession } from '../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../lib/http.js';
import { organisationContext } from '../lib/supabase.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
  try {
    const context = await organisationContext(await requireOrganisationSession(request));
    const orgId = context.organisation.id;
    const [opportunities, approvals, machines, publishedMachines, customers, contacts, sales, deals, activities, unreadNotifications, enabledAutomations] = await Promise.all([
      context.supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId).neq('stage', 'won').neq('stage', 'lost'),
      context.supabase.from('approval_queue').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('status', 'pending'),
      context.supabase.from('machines').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId),
      context.supabase.from('machines').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('is_published', true),
      context.supabase.from('customers').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId),
      context.supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId),
      context.supabase.from('sales').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId),
      context.supabase.from('deals').select('sale_price,purchase_price,transport_cost,preparation_cost,other_costs,commission').eq('organisation_id', orgId).eq('status', 'completed'),
      context.supabase.from('activities').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId).is('completed_at', null),
      context.supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId).is('read_at', null),
      context.supabase.from('automation_rules').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('enabled', true)
    ]);
    for (const result of [opportunities, approvals, machines, publishedMachines, customers, contacts, sales, deals, activities, unreadNotifications, enabledAutomations]) if (result.error) throw result.error;
    const grossMargin = (deals.data || []).reduce((total, item) => total + Number(item.sale_price || 0) - Number(item.purchase_price || 0) - Number(item.transport_cost || 0) - Number(item.preparation_cost || 0) - Number(item.other_costs || 0) - Number(item.commission || 0), 0);
    return response.status(200).json({ organisation: context.organisation, role: context.membership.role, metrics: { openOpportunities: opportunities.count || 0, pendingApprovals: approvals.count || 0, machines: machines.count || 0, publishedMachines: publishedMachines.count || 0, customers: customers.count || 0, contacts: contacts.count || 0, sales: sales.count || 0, deals: deals.data?.length || 0, grossMargin, openActivities: activities.count || 0, unreadNotifications: unreadNotifications.count || 0, enabledAutomations: enabledAutomations.count || 0 } });
  } catch (error) {
    return handleApiError(response, error);
  }
}
