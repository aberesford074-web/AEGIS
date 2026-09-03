import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext, requireManager } from '../../lib/supabase.js';

const kinds = new Set(['daily_brief', 'stale_follow_up', 'stock_match', 'email_monitor', 'marketplace_monitor']);

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    const context = await organisationContext(await requireOrganisationSession(request));
    const orgId = context.organisation.id;
    if (request.method === 'GET') {
      const [{ data: rules, error: rulesError }, { data: runs, error: runsError }] = await Promise.all([
        context.supabase.from('automation_rules').select('*').eq('organisation_id', orgId).order('created_at'),
        context.supabase.from('automation_runs').select('*').eq('organisation_id', orgId).order('started_at', { ascending: false }).limit(50)
      ]);
      if (rulesError) throw rulesError;
      if (runsError) throw runsError;
      return response.status(200).json({ rules, recentRuns: runs });
    }

    requireManager(context.membership);
    if (request.method === 'PATCH') {
      const id = requireText(request.body?.id, 'Automation ID');
      const allowed = ['name', 'enabled', 'cadence_minutes', 'configuration', 'requires_approval', 'next_run_at'];
      const payload = Object.fromEntries(Object.entries(request.body || {}).filter(([key, value]) => allowed.includes(key) && value !== undefined));
      const { data, error } = await context.supabase.from('automation_rules').update(payload).eq('id', id).eq('organisation_id', orgId).select('*').maybeSingle();
      if (error) throw error;
      if (!data) return response.status(404).json({ error: 'Automation not found.' });
      return response.status(200).json({ item: data });
    }
    const name = requireText(request.body?.name, 'Automation name');
    const kind = requireText(request.body?.kind, 'Automation kind');
    if (!kinds.has(kind)) throw new Error('Unsupported automation kind.');
    const cadenceMinutes = Math.max(15, Number(request.body?.cadenceMinutes) || 1440);
    const payload = {
      organisation_id: orgId,
      name,
      kind,
      cadence_minutes: cadenceMinutes,
      configuration: request.body?.configuration || {},
      enabled: request.body?.enabled !== false,
      requires_approval: request.body?.requiresApproval !== false,
      next_run_at: new Date().toISOString()
    };
    const { data, error } = await context.supabase.from('automation_rules').insert(payload).select('*').single();
    if (error) throw error;
    return response.status(201).json({ item: data });
  } catch (error) {
    return handleApiError(response, error);
  }
}
