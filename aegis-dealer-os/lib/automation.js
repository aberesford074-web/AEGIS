import { matchRequirements } from './os-intelligence.js';

const DAY_MINUTES = 1440;

export function nextRunAt(rule, from = new Date()) {
  const cadence = Number.isFinite(Number(rule.cadence_minutes))
    ? Math.max(15, Number(rule.cadence_minutes))
    : DAY_MINUTES;
  return new Date(from.getTime() + cadence * 60_000).toISOString();
}

async function count(supabase, table, configure = (query) => query) {
  const result = await configure(
    supabase.from(table).select('*', { count: 'exact', head: true })
  );
  if (result.error) throw result.error;
  return result.count || 0;
}

async function dailyBrief(supabase, rule) {
  const orgId = rule.organisation_id;
  const [openOpportunities, pendingApprovals, machines] = await Promise.all([
    count(supabase, 'opportunities', (query) =>
      query.eq('organisation_id', orgId).not('stage', 'in', '(won,lost)')
    ),
    count(supabase, 'approval_queue', (query) =>
      query.eq('organisation_id', orgId).eq('status', 'pending')
    ),
    count(supabase, 'machines', (query) => query.eq('organisation_id', orgId))
  ]);
  const summary = `${openOpportunities} open opportunities, ${pendingApprovals} approvals and ${machines} machines.`;
  const { error } = await supabase.from('notifications').insert({
    organisation_id: orgId,
    notification_type: 'daily_brief',
    title: 'Your AEGIS daily briefing is ready',
    body: summary,
    severity: pendingApprovals ? 'warning' : 'info'
  });
  if (error) throw error;
  return { summary, result: { openOpportunities, pendingApprovals, machines } };
}

async function staleFollowUp(supabase, rule, now) {
  const orgId = rule.organisation_id;
  const inactivityDays = Math.max(1, Number(rule.configuration?.inactivityDays) || 5);
  const cutoff = new Date(now.getTime() - inactivityDays * 86_400_000).toISOString();
  const { data: opportunities, error } = await supabase
    .from('opportunities')
    .select('id, title, stage, next_action, updated_at')
    .eq('organisation_id', orgId)
    .not('stage', 'in', '(won,lost)')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(50);
  if (error) throw error;

  let created = 0;
  for (const opportunity of opportunities || []) {
    const { count: existing, error: existingError } = await supabase
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('action_type', 'draft_follow_up')
      .eq('status', 'pending')
      .contains('payload', { opportunityId: opportunity.id });
    if (existingError) throw existingError;
    if (existing) continue;

    const { error: insertError } = await supabase.from('approval_queue').insert({
      organisation_id: orgId,
      action_type: 'draft_follow_up',
      payload: {
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        reason: `No activity for at least ${inactivityDays} days`,
        proposedAction: opportunity.next_action || 'Prepare a customer follow-up'
      }
    });
    if (insertError) throw insertError;
    created += 1;
  }

  if (created) {
    const { error: notificationError } = await supabase.from('notifications').insert({
      organisation_id: orgId,
      notification_type: 'stale_follow_up',
      title: `${created} follow-up${created === 1 ? '' : 's'} need review`,
      body: 'AEGIS prepared these actions but has not contacted any customer.',
      severity: 'warning'
    });
    if (notificationError) throw notificationError;
  }
  return {
    summary: created ? `${created} follow-up approvals prepared.` : 'No stale opportunities found.',
    result: { reviewed: opportunities?.length || 0, approvalsCreated: created }
  };
}

async function integrationBackedRule(supabase, rule) {
  const provider = rule.kind === 'email_monitor' ? 'email' : 'marketplace';
  const { count: connected, error } = await supabase
    .from('integration_connections')
    .select('*', { count: 'exact', head: true })
    .eq('organisation_id', rule.organisation_id)
    .eq('provider_config_key', provider)
    .eq('status', 'active');
  if (error) throw error;
  if (!connected) {
    return {
      status: 'skipped',
      summary: `${provider === 'email' ? 'Email' : 'Marketplace'} connection is not configured.`,
      result: { configurationRequired: true }
    };
  }
  return {
    status: 'skipped',
    summary: `${provider === 'email' ? 'Email' : 'Marketplace'} connector is ready for its Nango action handler.`,
    result: { handlerRequired: true }
  };
}

async function stockMatch(supabase, rule) {
  const orgId = rule.organisation_id;
  const [requirements, machines] = await Promise.all([
    supabase.from('business_records').select('*').eq('organisation_id', orgId).eq('record_type', 'buyer_requirement').eq('status', 'active').limit(250),
    supabase.from('machines').select('*').eq('organisation_id', orgId).in('status', ['in-stock', 'available-to-source']).limit(1000)
  ]);
  if (requirements.error) throw requirements.error;
  if (machines.error) throw machines.error;
  const minimumScore = Math.max(45, Number(rule.configuration?.minimumScore) || 70);
  const matches = matchRequirements(requirements.data || [], machines.data || []).filter((item) => item.score >= minimumScore).slice(0, 25);
  let created = 0;
  for (const match of matches) {
    const { count, error: existingError } = await supabase.from('approval_queue').select('*', { count: 'exact', head: true })
      .eq('organisation_id', orgId).eq('action_type', 'buyer_stock_match').eq('status', 'pending')
      .contains('payload', { requirementId: match.requirement_id, machineId: match.machine_id });
    if (existingError) throw existingError;
    if (count) continue;
    const { error } = await supabase.from('approval_queue').insert({
      organisation_id: orgId,
      action_type: 'buyer_stock_match',
      payload: { requirementId: match.requirement_id, requirementTitle: match.requirement_title, machineId: match.machine_id, machineLabel: match.machine_label, score: match.score, reasons: match.reasons, proposedAction: 'Review match and prepare a buyer introduction' }
    });
    if (error) throw error;
    created += 1;
  }
  return { summary: created ? `${created} buyer-to-stock matches prepared for approval.` : 'No new strong stock matches found.', result: { reviewed: matches.length, approvalsCreated: created, minimumScore } };
}

export async function executeAutomationRule(supabase, rule, now = new Date()) {
  if (rule.kind === 'daily_brief') return dailyBrief(supabase, rule);
  if (rule.kind === 'stale_follow_up') return staleFollowUp(supabase, rule, now);
  if (rule.kind === 'stock_match') return stockMatch(supabase, rule);
  if (rule.kind === 'email_monitor' || rule.kind === 'marketplace_monitor') {
    return integrationBackedRule(supabase, rule);
  }
  return {
    status: 'skipped',
    summary: `${rule.kind} requires additional matching configuration.`,
    result: { configurationRequired: true }
  };
}
