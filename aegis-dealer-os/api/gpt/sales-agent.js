import crypto from 'node:crypto';
import { auditProspectWebsite, createSalesCallBrief } from '../../lib/sales-agent.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { handleApiError, requireText } from '../../lib/http.js';
import { liveCallsEnabled, placeTwilioCall, providerReady } from '../../lib/twilio.js';

const ACTOR = 'custom-gpt';

function text(value) { return String(value ?? '').trim(); }

function bearer(request) {
  const value = text(request.headers?.authorization);
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : value;
}

function authorised(request) {
  const supplied = Buffer.from(bearer(request));
  const expected = Buffer.from(text(process.env.DEALERFOUNDRY_GPT_ACTION_TOKEN));
  return supplied.length > 0 && supplied.length === expected.length && expected.length > 0 && crypto.timingSafeEqual(supplied, expected);
}

async function organisation(supabase) {
  const configured = text(process.env.SALES_AGENT_GPT_ORGANISATION_ID);
  if (configured) {
    const { data, error } = await supabase.from('organisations').select('id,name').eq('id', configured).maybeSingle();
    if (error) throw error;
    if (!data) { const issue = new Error('The configured GPT organisation was not found.'); issue.statusCode = 503; throw issue; }
    return data;
  }
  const { data, error } = await supabase.from('organisations').select('id,name').order('created_at').limit(2);
  if (error) throw error;
  if (data?.length !== 1) {
    const issue = new Error('Set SALES_AGENT_GPT_ORGANISATION_ID before using the Custom GPT with multiple dealer organisations.');
    issue.statusCode = 503;
    throw issue;
  }
  return data[0];
}

async function prospect(supabase, organisationId, prospectId) {
  const { data, error } = await supabase.from('prospect_companies')
    .select('id,company,contact_name,phone,email,website,notes,status,outreach_status')
    .eq('organisation_id', organisationId).eq('id', prospectId).maybeSingle();
  if (error) throw error;
  if (!data) { const issue = new Error('Prospect not found.'); issue.statusCode = 404; throw issue; }
  return data;
}

async function run(supabase, organisationId, runId) {
  const { data, error } = await supabase.from('sales_agent_runs')
    .select('*').eq('organisation_id', organisationId).eq('id', runId).maybeSingle();
  if (error) throw error;
  if (!data) { const issue = new Error('Sales-agent run not found.'); issue.statusCode = 404; throw issue; }
  return data;
}

function requireConfirmed(body) {
  if (body.confirmed !== true) {
    const issue = new Error('This action requires confirmed=true after the user explicitly approves the exact change.');
    issue.statusCode = 409;
    throw issue;
  }
}

async function callCountToday(supabase, organisationId) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase.from('sales_agent_runs')
    .select('id', { count: 'exact', head: true }).eq('organisation_id', organisationId)
    .eq('provider', 'twilio').gte('created_at', start.toISOString());
  if (error) throw error;
  return Number(count || 0);
}

function dailyLimit() {
  const parsed = Number(process.env.SALES_AGENT_GPT_DAILY_CALL_LIMIT || 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? Math.floor(parsed) : 10, 1), 100);
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST for DealerFoundry Custom GPT actions.' });
  if (!authorised(request)) return response.status(401).json({ error: 'DealerFoundry Custom GPT authentication required.' });

  try {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const action = text(request.query?.action || body.action || 'status');
    const supabase = supabaseAdmin();
    const org = await organisation(supabase);

    if (action === 'status') {
      return response.status(200).json({
        ok: true,
        brand: 'DealerFoundry',
        organisation: org.name,
        actions: ['list_prospects', 'prepare_script', 'approve_script', 'request_call'],
        telephony: { provider: providerReady() ? 'twilio' : 'not_configured', liveCallsEnabled: liveCallsEnabled(), dailyLimit: dailyLimit() },
        safety: 'Scripts may be prepared automatically; calls require outreach_status=allowed, confirmed=true and an approved run.'
      });
    }

    if (action === 'list_prospects') {
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
      const { data, error } = await supabase.from('prospect_companies')
        .select('id,company,contact_name,phone,email,website,status,outreach_status,updated_at')
        .eq('organisation_id', org.id).not('phone', 'is', null).neq('outreach_status', 'opted_out')
        .order('updated_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return response.status(200).json({ ok: true, organisation: org.name, prospects: data || [] });
    }

    if (action === 'prepare_script' || action === 'create_script') {
      const prospectId = requireText(body.prospectId, 'Prospect ID');
      const target = await prospect(supabase, org.id, prospectId);
      if (!target.phone) { const issue = new Error('Add a phone number before preparing a script.'); issue.statusCode = 400; throw issue; }
      if (target.outreach_status === 'opted_out') { const issue = new Error('This prospect has opted out and cannot be prepared for outreach.'); issue.statusCode = 409; throw issue; }
      const websiteAudit = await auditProspectWebsite(target.website);
      const callBrief = await createSalesCallBrief({ prospect: target, websiteAudit, organisationName: 'DealerFoundry' });
      const { data: created, error } = await supabase.from('sales_agent_runs').insert({
        organisation_id: org.id, prospect_id: target.id, status: 'ready', job_type: 'call_prep',
        website_url: websiteAudit.url, website_audit: websiteAudit, call_brief: callBrief,
        created_by_clerk_user_id: ACTOR
      }).select('id,prospect_id,status,call_brief,website_audit,created_at').single();
      if (error) throw error;
      return response.status(201).json({ ok: true, run: created, message: 'DealerFoundry script prepared. Ask the user to review it before approval.' });
    }

    if (action === 'approve_script') {
      requireConfirmed(body);
      const runId = requireText(body.runId, 'Sales-agent run ID');
      const current = await run(supabase, org.id, runId);
      if (current.status !== 'ready') { const issue = new Error('Only a ready script can be approved.'); issue.statusCode = 409; throw issue; }
      const { data: updated, error } = await supabase.from('sales_agent_runs').update({ status: 'approved', approved_by_clerk_user_id: ACTOR, approved_at: new Date().toISOString() }).eq('id', runId).eq('organisation_id', org.id).select('id,prospect_id,status,approved_at').single();
      if (error) throw error;
      return response.status(200).json({ ok: true, run: updated, message: 'Script approved. A separate confirmed request is required to place the call.' });
    }

    if (action === 'request_call') {
      requireConfirmed(body);
      const runId = requireText(body.runId, 'Sales-agent run ID');
      const current = await run(supabase, org.id, runId);
      if (current.status !== 'approved') { const issue = new Error('Approve the exact script before requesting a call.'); issue.statusCode = 409; throw issue; }
      const target = await prospect(supabase, org.id, current.prospect_id);
      if (target.outreach_status !== 'allowed') { const issue = new Error('Mark this prospect outreach status as allowed after your compliance review before calling.'); issue.statusCode = 409; throw issue; }
      if (!liveCallsEnabled()) { const issue = new Error('Live calls are disabled. Set SALES_AGENT_LIVE_CALLS_ENABLED=true only after your legal, consent and caller-ID review.'); issue.statusCode = 409; throw issue; }
      if (!providerReady()) { const issue = new Error('Twilio is not configured. Add its credentials and the DealerFoundry caller number in Vercel.'); issue.statusCode = 503; throw issue; }
      const count = await callCountToday(supabase, org.id);
      if (count >= dailyLimit()) { const issue = new Error('The Custom GPT daily call limit has been reached.'); issue.statusCode = 429; throw issue; }
      const call = await placeTwilioCall({ runId: current.id, to: target.phone });
      const { data: updated, error } = await supabase.from('sales_agent_runs').update({ status: 'in_progress', provider: 'twilio', provider_call_id: call.callSid, started_at: new Date().toISOString() }).eq('id', current.id).eq('organisation_id', org.id).select('id,prospect_id,status,provider,provider_call_id,started_at').single();
      if (error) throw error;
      return response.status(200).json({ ok: true, run: updated, message: 'The approved DealerFoundry call was handed to Twilio.', twilioStatus: call.status });
    }

    return response.status(400).json({ error: 'Unknown sales-agent action.' });
  } catch (error) {
    return handleApiError(response, error);
  }
}
