import crypto from 'node:crypto';

const DEFAULT_PUBLIC_URL = 'https://dealer.aegis-allterrain.co.uk';

function text(value) {
  return String(value ?? '').trim();
}

function secret() {
  return text(process.env.SALES_AGENT_WEBHOOK_SECRET || process.env.CRON_SECRET);
}

export function publicURL() {
  return text(process.env.SALES_AGENT_PUBLIC_URL || process.env.APP_URL || DEFAULT_PUBLIC_URL).replace(/\/$/, '');
}

export function providerReady() {
  return Boolean(
    text(process.env.TWILIO_ACCOUNT_SID)
    && text(process.env.TWILIO_AUTH_TOKEN)
    && text(process.env.SALES_AGENT_CALL_FROM)
  );
}

export function liveCallsEnabled() {
  return text(process.env.SALES_AGENT_LIVE_CALLS_ENABLED).toLowerCase() === 'true';
}

export function toE164(value, defaultCountryCode = '+44') {
  const raw = text(value).replace(/[().\s-]/g, '');
  if (!raw) throw new Error('A destination phone number is required.');
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('0')) return `${defaultCountryCode}${raw.slice(1)}`;
  return `${defaultCountryCode}${raw}`;
}

export function signRunId(runId) {
  const key = secret();
  if (!key) throw new Error('SALES_AGENT_WEBHOOK_SECRET or CRON_SECRET is not configured.');
  return crypto.createHmac('sha256', key).update(text(runId)).digest('base64url');
}

export function verifyRunSignature(runId, signature) {
  if (!runId || !signature || !secret()) return false;
  const expected = signRunId(runId);
  const left = Buffer.from(text(signature));
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requestURL(request) {
  const candidate = request.url || '/';
  try { return new URL(candidate, publicURL()).toString(); } catch { return `${publicURL()}${candidate}`; }
}

export function verifyTwilioRequest(request, params = {}) {
  const token = text(process.env.TWILIO_AUTH_TOKEN);
  const provided = text(Array.isArray(request.headers?.['x-twilio-signature'])
    ? request.headers['x-twilio-signature'][0]
    : request.headers?.['x-twilio-signature']);
  if (!token || !provided) return false;
  const payload = `${requestURL(request)}${Object.keys(params).sort().map((key) => `${key}${params[key] ?? ''}`).join('')}`;
  const expected = crypto.createHmac('sha1', token).update(payload).digest('base64');
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function readTwilioBody(request) {
  if (request.body && typeof request.body === 'object') return { ...request.body };
  if (typeof request.body === 'string') return Object.fromEntries(new URLSearchParams(request.body));
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
}

function xml(value) {
  return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function signedWebhook(path, runId) {
  const url = new URL(path, `${publicURL()}/`);
  url.searchParams.set('run', runId);
  url.searchParams.set('sig', signRunId(runId));
  return url.toString();
}

export function voiceWebhookURL(runId, step = null) {
  const url = new URL('/api/twilio/voice', `${publicURL()}/`);
  url.searchParams.set('run', runId);
  url.searchParams.set('sig', signRunId(runId));
  if (step) url.searchParams.set('step', step);
  return url.toString();
}

export function statusWebhookURL(runId) {
  return signedWebhook('/api/twilio/status', runId);
}

export function callBriefTwiML({ runId, brief = {}, step = 'opening' }) {
  const opening = xml(brief.opening || 'Hello, this is DealerFoundry calling on behalf of Aaron. Is now a good time for a brief question about your machinery website?');
  const appointmentAsk = xml(brief.appointmentAsk || 'If it is useful, Aaron can show you a few practical improvements in a short website review.');
  const action = xml(voiceWebhookURL(runId, 'reply'));
  if (step === 'reply') {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy" language="en-GB">Thank you. We will follow up with the next step. If you would rather not receive further calls, say stop or press 2.</Say><Gather input="speech dtmf" numDigits="1" speechTimeout="auto" action="${action}" method="POST"><Say voice="Polly.Amy" language="en-GB">Press 1 or say yes if you would like Aaron to send a booking link. Press 2 or say stop to opt out.</Say></Gather><Say voice="Polly.Amy" language="en-GB">Thanks for your time. Goodbye.</Say><Hangup/></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech dtmf" numDigits="1" speechTimeout="auto" action="${action}" method="POST"><Say voice="Polly.Amy" language="en-GB">${opening}</Say><Say voice="Polly.Amy" language="en-GB">${appointmentAsk} Press 1 or say yes if you would like a booking link. Press 2 or say stop if you do not want further contact.</Say></Gather><Say voice="Polly.Amy" language="en-GB">No problem. We will not continue this call. Goodbye.</Say><Hangup/></Response>`;
}

export function closingTwiML(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy" language="en-GB">${xml(message)}</Say><Hangup/></Response>`;
}

export async function placeTwilioCall({ runId, to }) {
  if (!providerReady()) throw new Error('Twilio is not configured. Add the account SID, Auth Token and SALES_AGENT_CALL_FROM in the server environment.');
  const accountSid = text(process.env.TWILIO_ACCOUNT_SID);
  const authToken = text(process.env.TWILIO_AUTH_TOKEN);
  const body = new URLSearchParams({
    To: toE164(to),
    From: toE164(process.env.SALES_AGENT_CALL_FROM),
    Url: text(process.env.SALES_AGENT_CALL_URL) || voiceWebhookURL(runId),
    Method: 'POST',
    StatusCallback: statusWebhookURL(runId),
    StatusCallbackMethod: 'POST',
    StatusCallbackEvent: 'initiated ringing answered completed'
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || 'Twilio could not start the call.');
  return { callSid: payload.sid, status: payload.status || 'queued' };
}
