import { supabaseAdmin } from '../../lib/supabase.js';
import { handleApiError } from '../../lib/http.js';
import {
  callBriefTwiML,
  closingTwiML,
  readTwilioBody,
  verifyRunSignature,
  verifyTwilioRequest
} from '../../lib/twilio.js';

export const config = { api: { bodyParser: false } };

function value(request, key) {
  const candidate = request.query?.[key];
  return Array.isArray(candidate) ? candidate[0] : String(candidate || '').trim();
}

function speech(body) {
  return String(body?.SpeechResult || '').trim().toLowerCase();
}

function isOptOut(body) {
  const result = speech(body);
  return String(body?.Digits || '').trim() === '2' || /\b(stop|unsubscribe|do not call|don't call|no more calls)\b/i.test(result);
}

function isAppointmentRequest(body) {
  const result = speech(body);
  return String(body?.Digits || '').trim() === '1' || /\b(yes|yeah|sure|book|send|okay|ok)\b/i.test(result);
}

function sendXml(response, body) {
  response.setHeader('Content-Type', 'text/xml; charset=utf-8');
  return response.status(200).send(body);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method not allowed.');
  try {
    const body = await readTwilioBody(request);
    if (!verifyTwilioRequest(request, body)) return response.status(401).send('Invalid Twilio signature.');
    const runId = value(request, 'run');
    const signature = value(request, 'sig');
    if (!runId || !verifyRunSignature(runId, signature)) return response.status(401).send('Invalid call reference.');

    const supabase = supabaseAdmin();
    const { data: run, error: runError } = await supabase.from('sales_agent_runs')
      .select('id,organisation_id,prospect_id,status,call_brief,provider_call_id')
      .eq('id', runId).maybeSingle();
    if (runError) throw runError;
    if (!run || !['approved', 'queued', 'in_progress'].includes(run.status)) return response.status(409).send('This call is no longer active.');
    const { data: prospect, error: prospectError } = await supabase.from('prospect_companies')
      .select('id,company,outreach_status').eq('organisation_id', run.organisation_id).eq('id', run.prospect_id).maybeSingle();
    if (prospectError) throw prospectError;
    if (!prospect || prospect.outreach_status === 'opted_out') return sendXml(response, closingTwiML('We cannot continue this call. Goodbye.'));

    const step = value(request, 'step');
    if (step === 'reply') {
      if (isOptOut(body)) {
        const now = new Date().toISOString();
        await supabase.from('prospect_companies').update({ outreach_status: 'opted_out', opted_out_at: now, opt_out_reason: 'Opt-out requested during DealerFoundry call', status: 'not_interested' }).eq('id', prospect.id).eq('organisation_id', run.organisation_id);
        await supabase.from('sales_agent_runs').update({ status: 'completed', outcome: 'opted_out', ended_at: now }).eq('id', run.id);
        return sendXml(response, closingTwiML('Understood. We will not contact you again. Goodbye.'));
      }
      if (isAppointmentRequest(body)) {
        await supabase.from('sales_agent_runs').update({ status: 'completed', outcome: 'appointment_requested', ended_at: new Date().toISOString() }).eq('id', run.id);
        return sendXml(response, closingTwiML('Thank you. Aaron will send a booking link for a short website review. Goodbye.'));
      }
      await supabase.from('sales_agent_runs').update({ status: 'completed', outcome: 'no_response_or_declined', ended_at: new Date().toISOString() }).eq('id', run.id);
      return sendXml(response, closingTwiML('No problem. We will leave it there. Goodbye.'));
    }

    await supabase.from('sales_agent_runs').update({ status: 'in_progress', started_at: new Date().toISOString(), provider: 'twilio' }).eq('id', run.id);
    return sendXml(response, callBriefTwiML({ runId: run.id, brief: run.call_brief }));
  } catch (error) {
    console.error('Twilio voice webhook failed.', error);
    return handleApiError(response, error);
  }
}
