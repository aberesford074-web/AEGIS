import { supabaseAdmin } from '../../lib/supabase.js';
import { handleApiError } from '../../lib/http.js';
import { readTwilioBody, verifyRunSignature, verifyTwilioRequest } from '../../lib/twilio.js';

export const config = { api: { bodyParser: false } };

function value(request, key) {
  const candidate = request.query?.[key];
  return Array.isArray(candidate) ? candidate[0] : String(candidate || '').trim();
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method not allowed.');
  try {
    const body = await readTwilioBody(request);
    if (!verifyTwilioRequest(request, body)) return response.status(401).send('Invalid Twilio signature.');
    const runId = value(request, 'run');
    if (!runId || !verifyRunSignature(runId, value(request, 'sig'))) return response.status(401).send('Invalid call reference.');
    const callStatus = String(body.CallStatus || '').trim().toLowerCase();
    const status = ['completed'].includes(callStatus)
      ? 'completed'
      : ['busy', 'failed', 'no-answer', 'canceled'].includes(callStatus) ? 'failed' : 'in_progress';
    const fields = { status, provider: 'twilio', provider_call_id: String(body.CallSid || '').trim() || null };
    if (status === 'in_progress') fields.started_at = new Date().toISOString();
    if (status === 'completed' || status === 'failed') {
      fields.ended_at = new Date().toISOString();
      fields.outcome = callStatus || status;
    }
    const { error } = await supabaseAdmin().from('sales_agent_runs').update(fields).eq('id', runId);
    if (error) throw error;
    return response.status(204).end();
  } catch (error) {
    console.error('Twilio status webhook failed.', error);
    return handleApiError(response, error);
  }
}
