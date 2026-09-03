import { executeAutomationRule, nextRunAt } from '../../lib/automation.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { runPublishingJobs } from '../../lib/publishing.js';
import { expireReservations } from '../../lib/reservations.js';

export default async function handler(request, response) {
  const authorization = request.headers.authorization || '';
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return response.status(401).json({ error: 'Unauthorised cron request.' });
  }

  const supabase = supabaseAdmin();
  const now = new Date();
  const { data: rules, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at')
    .limit(100);
  if (error) return response.status(500).json({ error: 'Unable to load due automation rules.' });

  const results = [];
  for (const rule of rules || []) {
    const { data: run, error: runError } = await supabase
      .from('automation_runs')
      .insert({ organisation_id: rule.organisation_id, automation_rule_id: rule.id })
      .select('id')
      .single();
    if (runError) {
      results.push({ ruleId: rule.id, status: 'failed-to-start' });
      continue;
    }

    try {
      const outcome = await executeAutomationRule(supabase, rule, now);
      const status = outcome.status || 'succeeded';
      await supabase.from('automation_runs').update({
        status,
        summary: outcome.summary,
        result: outcome.result,
        finished_at: new Date().toISOString()
      }).eq('id', run.id);
      await supabase.from('automation_rules').update({
        last_run_at: now.toISOString(),
        next_run_at: nextRunAt(rule, now)
      }).eq('id', rule.id);
      results.push({ ruleId: rule.id, status });
    } catch (runFailure) {
      await supabase.from('automation_runs').update({
        status: 'failed',
        summary: runFailure instanceof Error ? runFailure.message : 'Automation failed.',
        finished_at: new Date().toISOString()
      }).eq('id', run.id);
      results.push({ ruleId: rule.id, status: 'failed' });
    }
  }

  const [publishing, expiredReservations] = await Promise.all([
    runPublishingJobs({ supabase, limit: 100 }),
    expireReservations(supabase)
  ]);
  return response.status(200).json({ processed: results.length, results, publishing, expiredReservations });
}
