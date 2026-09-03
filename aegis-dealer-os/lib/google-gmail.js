import crypto from 'node:crypto';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const DEFAULT_APP_URL = 'https://aegis-dealer-os.vercel.app';

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Gmail operator configuration is missing ${name}.`);
    const error = new Error('Gmail connection setup is temporarily unavailable. Please contact AEGIS support.');
    error.statusCode = 503;
    throw error;
  }
  return value;
}

function signingSecret() {
  return requiredEnvironment('GMAIL_OAUTH_STATE_SECRET');
}

function encryptionKey() {
  return crypto.createHash('sha256').update(requiredEnvironment('GMAIL_TOKEN_ENCRYPTION_KEY')).digest();
}

function signature(value) {
  return crypto.createHmac('sha256', signingSecret()).update(value).digest('base64url');
}

export function gmailRedirectURI() {
  const appURL = (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/$/, '');
  return `${appURL}/api/integrations/gmail/callback`;
}

export function createGmailState({ organisationId = null, clerkUserId, scope = 'organisation' }) {
  const encoded = Buffer.from(JSON.stringify({
    organisationId,
    clerkUserId,
    scope,
    nonce: crypto.randomBytes(18).toString('base64url'),
    expiresAt: Date.now() + 10 * 60 * 1000
  })).toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

export function verifyGmailState(state) {
  const [encoded, suppliedSignature, extra] = String(state || '').split('.');
  if (!encoded || !suppliedSignature || extra) throw invalidState();
  const expected = signature(encoded);
  const left = Buffer.from(suppliedSignature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw invalidState();
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw invalidState();
  }
  const validScope = payload.scope === 'platform' || (payload.scope === 'organisation' && payload.organisationId);
  if (!validScope || !payload.clerkUserId || !payload.expiresAt || payload.expiresAt < Date.now()) {
    throw invalidState();
  }
  return payload;
}

function invalidState() {
  const error = new Error('The Gmail authorisation request is invalid or has expired. Start the connection again in AEGIS.');
  error.statusCode = 400;
  return error;
}

export function gmailAuthorizationURL(state) {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: requiredEnvironment('GOOGLE_GMAIL_CLIENT_ID'),
    redirect_uri: gmailRedirectURI(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.send'
    ].join(' ')
  }).toString();
  return url.toString();
}

export async function exchangeGmailCode(code) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: requiredEnvironment('GOOGLE_GMAIL_CLIENT_ID'),
      client_secret: requiredEnvironment('GOOGLE_GMAIL_CLIENT_SECRET'),
      redirect_uri: gmailRedirectURI(),
      grant_type: 'authorization_code'
    })
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token) {
    const error = new Error(tokens.error_description || 'Google did not return a usable Gmail access token.');
    error.statusCode = 400;
    throw error;
  }
  return tokens;
}

export async function gmailProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const profile = await response.json();
  if (!response.ok || !profile.email || !profile.sub) {
    const error = new Error('AEGIS could not identify the authorised Gmail account.');
    error.statusCode = 400;
    throw error;
  }
  return profile;
}

export function sealGmailCredentials(tokens) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
      tokenType: tokens.token_type || 'Bearer',
      scope: tokens.scope || ''
    }), 'utf8'),
    cipher.final()
  ]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function unsealGmailCredentials(value) {
  const [version, ivValue, tagValue, encryptedValue, extra] = String(value || '').split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue || extra) {
    throw new Error('The stored Gmail credential is invalid. Reconnect Gmail in AEGIS.');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    throw new Error('AEGIS could not unlock the Gmail connection. Reconnect Gmail and try again.');
  }
}

export async function refreshGmailCredentials(credentials) {
  if (!credentials?.refreshToken) throw new Error('The Gmail connection has expired. Reconnect Gmail in AEGIS.');
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: credentials.refreshToken,
      client_id: requiredEnvironment('GOOGLE_GMAIL_CLIENT_ID'),
      client_secret: requiredEnvironment('GOOGLE_GMAIL_CLIENT_SECRET'),
      grant_type: 'refresh_token'
    })
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token) {
    throw new Error(tokens.error_description || 'Google could not refresh the Gmail connection. Reconnect Gmail in AEGIS.');
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: credentials.refreshToken,
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    tokenType: tokens.token_type || credentials.tokenType || 'Bearer',
    scope: tokens.scope || credentials.scope || ''
  };
}

function encodeHeader(value) {
  const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  return /[^\x20-\x7E]/.test(text)
    ? `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
    : text;
}

export function gmailRawMessage({ to, subject, body, calendar = null }) {
  const recipient = String(to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('A valid recipient email address is required.');
  const messageSubject = String(subject || '').trim();
  const messageBody = String(body || '').trim();
  if (!messageSubject) throw new Error('An email subject is required.');
  if (!messageBody) throw new Error('An email body is required.');
  if (messageSubject.length > 998 || messageBody.length > 100_000) throw new Error('The proposed email is too large to send.');
  if (calendar) {
    const boundary = `aegis-${crypto.randomBytes(12).toString('hex')}`;
    const message = [
      `To: ${recipient}`,
      `Subject: ${encodeHeader(messageSubject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      messageBody,
      '',
      `--${boundary}`,
      'Content-Type: text/calendar; method=REQUEST; charset="UTF-8"; name="dealerfoundry-website-consultation.ics"',
      'Content-Disposition: attachment; filename="dealerfoundry-website-consultation.ics"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(String(calendar), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '',
      `--${boundary}--`,
      ''
    ].join('\r\n');
    return Buffer.from(message, 'utf8').toString('base64url');
  }
  const message = [
    `To: ${recipient}`,
    `Subject: ${encodeHeader(messageSubject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    messageBody
  ].join('\r\n');
  return Buffer.from(message, 'utf8').toString('base64url');
}

export async function sendGmailMessage(accessToken, message) {
  const response = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: gmailRawMessage(message) })
  });
  const result = await response.json();
  if (!response.ok || !result.id) {
    const error = new Error(result?.error?.message || 'Google did not send the approved email.');
    error.statusCode = response.status || 502;
    throw error;
  }
  return result;
}

export function gmailCallbackURL(parameters) {
  const url = new URL('aegis-sales-os://gmail/callback');
  for (const [key, value] of Object.entries(parameters)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function platformGmailCallbackURL(parameters) {
  const baseURL = (process.env.COMMAND_CENTER_URL || 'https://aegis-command-center-web.vercel.app').replace(/\/$/, '');
  const url = new URL('/dashboard/connections', baseURL);
  for (const [key, value] of Object.entries(parameters)) {
    if (value) url.searchParams.set(`gmail_${key}`, value);
  }
  return url.toString();
}
