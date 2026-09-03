import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext, requireManager } from '../../lib/supabase.js';
import { auditProspectWebsite, createSalesCallBrief, salesAgentProviderReady, salesAgentReadiness } from '../../lib/sales-agent.js';

function id(value, label) { return requireText(value, label); }

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const organisationId = context.organisation.id;

    if (request.method === 'GET') {
      const [prospects, runs] = await Promise.all([
        context.supabase.from('prospect_companies').select('id,company,contact_name,phone,email,website,notes,status,outreach_status,consent_source,consent_obtained_at,opted_out_at,next_action_at,last_contacted_at').eq('organisation_id', organisationId).not('phone', 'is', null).order('updated_at', { ascending: false }).limit(5000),
        context.supabase.from('sales_agent_runs').select('id,prospect_id,status,website_url,website_audit,call_brief,provider,outcome,approved_at,started_at,ended_at,last_error,created_at,updated_at').eq('organisation_id', organisationId).order('updated_at', { ascending: false }).limit(500)
      ]);
      if (prospects.error) throw prospects.error;
      if (runs.error) throw runs.error;
      return response.status(200).json({ readiness: salesAgentReadiness(), prospects: prospects.data || [], runs: runs.data || [] });
    }

    requireManager(context.membership);

    if (request.method === 'POST') {
      const action = requireText(request.body?.action, 'Sales agent action');
      if (action === 'enqueue_batch') {
        const requestedLimit = Number(request.body?.limit || 100);
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const { count: queuedToday, error: countError } = await context.supabase.from('sales_agent_runs')
          .select('id', { count: 'exact', head: true }).eq('organisation_id', organisationId)
          .eq('job_type', 'audit_prep').gte('created_at', startOfDay.toISOString());
        if (countError) throw countError;
        const dailyAllowance = Math.max(0, 100 - Number(queuedToday || 0));
        const batchLimit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 100, 1), dailyAllowance);
        if (!batchLimit) return response.status(200).json({ queued: 0, message: 'The 100-prospect daily audit limit has already been reached.' });
        const { data: prospects, error: prospectsError } = await context.supabase.from('prospect_companies')
          .select('id,company,contact_name,phone,email,website,notes,status,outreach_status')
          .eq('organisation_id', organisationId).not('phone', 'is', null)
          .neq('status', 'not_interested').neq('outreach_status', 'opted_out').order('updated_at').limit(batchLimit * 3);
        if (prospectsError) throw prospectsError;
        const { data: activeRuns, error: activeError } = await context.supabase.from('sales_agent_runs')
          .select('prospect_id').eq('organisation_id', organisationId).eq('job_type', 'audit_prep')
          .in('status', ['queued', 'in_progress', 'ready', 'approved']).limit(10000);
        if (activeError) throw activeError;
        const activeIds = new Set((activeRuns || []).map((run) => run.prospect_id));
        const rows = (prospects || []).filter((prospect) => !activeIds.has(prospect.id)).slice(0, batchLimit).map((prospect) => ({
          organisation_id: organisationId, prospect_id: prospect.id, job_type: 'audit_prep', status: 'queued',
          next_attempt_at: new Date().toISOString(), created_by_clerk_user_id: session.clerkUserId
        }));
        let queued = 0;
        if (rows.length) {
          const { data, error } = await context.supabase.from('sales_agent_runs').insert(rows).select('id');
          if (error) throw error;
          queued = data?.length || 0;
        }
        await context.supabase.from('audit_events').insert({
          organisation_id: organisationId, actor_clerk_user_id: session.clerkUserId,
          event_type: 'sales_agent.batch_queued', record_type: 'sales_agent_run',
          payload: { requested: batchLimit, queued, skipped: Math.max(0, (prospects || []).length - queued) }
        });
        return response.status(201).json({ queued, message: queued ? `${queued} prospect audits queued.` : 'No new prospect audits were queued.' });
      }
      if (action !== 'prepare') return response.status(400).json({ error: 'Use prepare to create an evidence-led call brief.' });
      const prospectId = id(request.body?.prospectId, 'Prospect');
      const { data: prospect, error: prospectError } = await context.supabase.from('prospect_companies')
        .select('id,company,contact_name,phone,email,website,notes,status,outreach_status').eq('organisation_id', organisationId).eq('id', prospectId).maybeSingle();
      if (prospectError) throw prospectError;
      if (!prospect) return response.status(404).json({ error: 'Prospect not found.' });
      if (!prospect.phone) return response.status(400).json({ error: 'Add a phone number before preparing a call.' });
      if (prospect.outreach_status === 'opted_out') return response.status(409).json({ error: 'This prospect has opted out and cannot be prepared for outreach.' });
      const websiteAudit = await auditProspectWebsite(prospect.website);
      // DealerFoundry is the public identity used by the appointment setter.
      // Keep the organisation name for tenant scoping, but do not expose the
      // legacy/internal AEGIS project label in prospect-facing copy.
      const publicBrand = String(process.env.SALES_AGENT_BRAND || 'DealerFoundry').trim() || 'DealerFoundry';
      const callBrief = await createSalesCallBrief({ prospect, websiteAudit, organisationName: publicBrand });
      const { data: run, error: runError } = await context.supabase.from('sales_agent_runs').insert({
        organisation_id: organisationId,
        prospect_id: prospect.id,
        status: 'ready',
        website_url: websiteAudit.url,
        website_audit: websiteAudit,
        call_brief: callBrief,
        created_by_clerk_user_id: session.clerkUserId
      }).select('*').single();
      if (runError) throw runError;
      await context.supabase.from('audit_events').insert({
        organisation_id: organisationId,
        actor_clerk_user_id: session.clerkUserId,
        event_type: 'sales_agent.brief_prepared',
        record_type: 'sales_agent_run',
        record_id: run.id,
        payload: { prospect_id: prospect.id, website_fetched: Boolean(websiteAudit.fetched) }
      });
      return response.status(201).json({ run, message: 'Call brief prepared. Review it before any outreach.' });
    }

    const runId = id(request.body?.id, 'Sales agent run');
    const action = requireText(request.body?.action, 'Sales agent action');
    const { data: current, error: readError } = await context.supabase.from('sales_agent_runs').select('*').eq('organisation_id', organisationId).eq('id', runId).maybeSingle();
    if (readError) throw readError;
    if (!current) return response.status(404).json({ error: 'Sales agent run not found.' });

    if (action === 'approve') {
      if (current.status !== 'ready') return response.status(409).json({ error: 'Only a ready call brief can be approved.' });
      const { data, error } = await context.supabase.from('sales_agent_runs').update({ status: 'approved', approved_by_clerk_user_id: session.clerkUserId, approved_at: new Date().toISOString() }).eq('id', runId).eq('organisation_id', organisationId).select('*').single();
      if (error) throw error;
      return response.status(200).json({ run: data, message: 'Approved for outreach. A compliant phone provider is still required to place the call.' });
    }

    if (action === 'cancel') {
      const { data, error } = await context.supabase.from('sales_agent_runs').update({ status: 'cancelled' }).eq('id', runId).eq('organisation_id', organisationId).in('status', ['draft', 'ready', 'approved']).select('*').single();
      if (error) throw error;
      return response.status(200).json({ run: data });
    }

    if (action === 'queue') {
      if (current.status !== 'approved') return response.status(409).json({ error: 'Approve the call brief before queuing it.' });
      const { data: prospectControl, error: prospectControlError } = await context.supabase.from('prospect_companies').select('outreach_status').eq('organisation_id', organisationId).eq('id', current.prospect_id).maybeSingle();
      if (prospectControlError) throw prospectControlError;
      if (prospectControl?.outreach_status === 'opted_out') return response.status(409).json({ error: 'This prospect has opted out and cannot be queued.' });
      if (prospectControl?.outreach_status !== 'allowed') return response.status(409).json({ error: 'Mark the prospect outreach status as allowed after your compliance review before queuing a call.' });
      if (!salesAgentProviderReady()) return response.status(503).json({ error: 'No compliant phone provider is connected yet. Add SALES_AGENT_CALL_PROVIDER, SALES_AGENT_CALL_FROM and SALES_AGENT_CALL_URL after choosing a provider.' });
      const { data, error } = await context.supabase.from('sales_agent_runs').update({ status: 'queued', provider: process.env.SALES_AGENT_CALL_PROVIDER }).eq('id', runId).eq('organisation_id', organisationId).select('*').single();
      if (error) throw error;
      return response.status(200).json({ run: data, message: 'Queued with the configured phone provider.' });
    }

    return response.status(400).json({ error: 'Unsupported sales agent action.' });
  } catch (error) {
    return handleApiError(response, error);
  }
}
