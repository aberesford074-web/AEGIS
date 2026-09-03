import { auditProspectWebsite, createSalesCallBrief } from './sales-agent.js';

const DEFAULT_BATCH_LIMIT = 5;
const MAX_ATTEMPTS = 3;

function retryAt(attempts) {
  return new Date(Date.now() + Math.min(30, 2 ** attempts) * 60_000).toISOString();
}

export async function runSalesAgentAuditJobs({ supabase, limit = DEFAULT_BATCH_LIMIT } = {}) {
  const now = new Date().toISOString();
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_BATCH_LIMIT, 1), 10);
  const { data: jobs, error } = await supabase.from('sales_agent_runs').select('*')
    .eq('job_type', 'audit_prep').in('status', ['queued', 'failed'])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('created_at').limit(safeLimit);
  if (error) throw error;

  const results = [];
  for (const job of jobs || []) {
    const attempts = Number(job.attempts || 0) + 1;
    const { data: claimed, error: claimError } = await supabase.from('sales_agent_runs')
      .update({ status: 'in_progress', attempts, started_at: new Date().toISOString(), last_error: null })
      .eq('id', job.id).eq('status', job.status).select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    try {
      const { data: prospect, error: prospectError } = await supabase.from('prospect_companies')
        .select('id,company,contact_name,phone,email,website,notes,status,outreach_status')
        .eq('organisation_id', job.organisation_id).eq('id', job.prospect_id).maybeSingle();
      if (prospectError) throw prospectError;
      if (!prospect) throw new Error('The prospect no longer exists.');
      if (!prospect.phone) throw new Error('The prospect has no phone number.');
      if (prospect.outreach_status === 'opted_out') throw new Error('The prospect has opted out of outreach.');

      const websiteAudit = await auditProspectWebsite(prospect.website);
      const callBrief = await createSalesCallBrief({ prospect, websiteAudit });
      const { error: updateError } = await supabase.from('sales_agent_runs').update({
        status: 'ready', website_url: websiteAudit.url, website_audit: websiteAudit,
        call_brief: callBrief, next_attempt_at: null, ended_at: new Date().toISOString(), last_error: null
      }).eq('id', job.id).eq('status', 'in_progress');
      if (updateError) throw updateError;
      results.push({ id: job.id, prospectId: prospect.id, status: 'ready' });
    } catch (runError) {
      const message = String(runError?.message || runError);
      const exhausted = attempts >= MAX_ATTEMPTS;
      await supabase.from('sales_agent_runs').update({
        status: 'failed', last_error: message, next_attempt_at: exhausted ? null : retryAt(attempts), ended_at: new Date().toISOString()
      }).eq('id', job.id).eq('status', 'in_progress');
      results.push({ id: job.id, status: 'failed', error: message, retryable: !exhausted });
    }
  }
  return { processed: results.length, results };
}
