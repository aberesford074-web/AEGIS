import crypto from 'node:crypto';

const DEFAULT_APP_URL = 'https://aegis-dealer-os.vercel.app';
const DEFAULT_GRAPH_VERSION = 'v24.0';

const REQUIRED_PLATFORM_ENVIRONMENT = [
  'META_WHATSAPP_APP_ID',
  'META_WHATSAPP_APP_SECRET',
  'META_WHATSAPP_CONFIG_ID',
  'META_WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_OAUTH_STATE_SECRET',
  'WHATSAPP_TOKEN_ENCRYPTION_KEY'
];

function value(name) {
  return process.env[name]?.trim() || '';
}

function required(name) {
  const result = value(name);
  if (!result) {
    const error = new Error('WhatsApp connection setup is not active yet. AEGIS support must finish the Meta business configuration.');
    error.statusCode = 503;
    throw error;
  }
  return result;
}

export function whatsappPlatformReadiness() {
  const missing = REQUIRED_PLATFORM_ENVIRONMENT.filter((name) => !value(name));
  return {
    ready: missing.length === 0,
    missing,
    graphVersion: value('META_GRAPH_API_VERSION') || DEFAULT_GRAPH_VERSION,
    webhookUrl: `${(value('APP_URL') || DEFAULT_APP_URL).replace(/\/$/, '')}/api/integrations/whatsapp/webhook`
  };
}

function stateSignature(encoded) {
  return crypto.createHmac('sha256', required('WHATSAPP_OAUTH_STATE_SECRET')).update(encoded).digest('base64url');
}

export function createWhatsAppState({ organisationId, clerkUserId }) {
  const encoded = Buffer.from(JSON.stringify({
    organisationId,
    clerkUserId,
    nonce: crypto.randomBytes(18).toString('base64url'),
    expiresAt: Date.now() + 10 * 60 * 1000
  })).toString('base64url');
  return `${encoded}.${stateSignature(encoded)}`;
}

export function verifyWhatsAppState(state) {
  const [encoded, supplied, extra] = String(state || '').split('.');
  if (!encoded || !supplied || extra) throw invalidState();
  const expected = stateSignature(encoded);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw invalidState();
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.organisationId || !payload.clerkUserId || Number(payload.expiresAt) < Date.now()) throw invalidState();
    return payload;
  } catch {
    throw invalidState();
  }
}

function invalidState() {
  const error = new Error('The WhatsApp connection request is invalid or has expired. Start again in AEGIS.');
  error.statusCode = 400;
  return error;
}

export function whatsappPublicConfiguration(state) {
  const readiness = whatsappPlatformReadiness();
  if (!readiness.ready) required(readiness.missing[0]);
  return {
    appId: required('META_WHATSAPP_APP_ID'),
    configId: required('META_WHATSAPP_CONFIG_ID'),
    graphVersion: readiness.graphVersion,
    state
  };
}

export function whatsappConnectURL(state) {
  const base = (value('APP_URL') || DEFAULT_APP_URL).replace(/\/$/, '');
  return `${base}/whatsapp-connect.html?state=${encodeURIComponent(state)}`;
}

export async function exchangeWhatsAppCode(code) {
  const readiness = whatsappPlatformReadiness();
  const url = new URL(`https://graph.facebook.com/${readiness.graphVersion}/oauth/access_token`);
  url.search = new URLSearchParams({
    client_id: required('META_WHATSAPP_APP_ID'),
    client_secret: required('META_WHATSAPP_APP_SECRET'),
    code: String(code || '')
  }).toString();
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload?.error?.message || 'Meta did not return a usable WhatsApp access token.');
    error.statusCode = 400;
    throw error;
  }
  return payload.access_token;
}

export async function subscribeWhatsAppWebhook(accessToken, wabaId) {
  const version = whatsappPlatformReadiness().graphVersion;
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json();
  if (!response.ok || payload.success !== true) {
    const error = new Error(payload?.error?.message || 'AEGIS could not subscribe this WhatsApp account to message updates.');
    error.statusCode = 400;
    throw error;
  }
  return payload;
}

export async function whatsappPhoneProfile(accessToken, phoneNumberId) {
  const version = whatsappPlatformReadiness().graphVersion;
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}`);
  url.searchParams.set('fields', 'display_phone_number,verified_name,quality_rating');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'AEGIS could not read the connected WhatsApp number.');
    error.statusCode = 400;
    throw error;
  }
  return payload;
}

function encryptionKey() {
  return crypto.createHash('sha256').update(required('WHATSAPP_TOKEN_ENCRYPTION_KEY')).digest();
}

export function sealWhatsAppToken(accessToken) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(accessToken), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function unsealWhatsAppToken(valueToOpen) {
  const [version, ivValue, tagValue, encryptedValue, extra] = String(valueToOpen || '').split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue || extra) {
    throw new Error('The stored WhatsApp credential is invalid. Reconnect WhatsApp in AEGIS.');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw new Error('AEGIS could not unlock the WhatsApp connection. Reconnect WhatsApp and try again.');
  }
}

export async function sendWhatsAppText(accessToken, phoneNumberId, recipient, body) {
  if (!phoneNumberId || !recipient || !String(body || '').trim()) throw new Error('The WhatsApp message is incomplete.');
  const version = whatsappPlatformReadiness().graphVersion;
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: false, body: String(body).slice(0, 4096) }
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.messages?.[0]?.id) throw new Error(payload?.error?.message || 'Meta did not send the WhatsApp reply.');
  return payload;
}

export function verifyWhatsAppWebhookSignature(rawBody, suppliedHeader) {
  const supplied = String(suppliedHeader || '').replace(/^sha256=/, '');
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = crypto.createHmac('sha256', required('META_WHATSAPP_APP_SECRET')).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
}

export function whatsappVerifyTokenMatches(token) {
  const supplied = Buffer.from(String(token || ''));
  const expected = Buffer.from(required('META_WHATSAPP_VERIFY_TOKEN'));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function normaliseWhatsAppWebhook(payload) {
  const events = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field !== 'messages') continue;
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      const displayPhoneNumber = value.metadata?.display_phone_number;
      const contacts = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact.profile?.name || null]));
      for (const message of value.messages || []) {
        events.push({
          kind: 'message',
          phoneNumberId,
          displayPhoneNumber,
          providerMessageId: message.id,
          from: message.from,
          displayName: contacts.get(message.from) || null,
          messageType: message.type || 'unknown',
          body: message.text?.body || message.button?.text || message.interactive?.button_reply?.title || '',
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
          raw: message
        });
      }
      for (const status of value.statuses || []) {
        events.push({
          kind: 'status',
          phoneNumberId,
          providerMessageId: status.id,
          status: status.status,
          timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString(),
          raw: status
        });
      }
    }
  }
  return events;
}
