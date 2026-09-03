import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGmailState,
  gmailRawMessage,
  gmailAuthorizationURL,
  sealGmailCredentials,
  unsealGmailCredentials,
  verifyGmailState
} from '../lib/google-gmail.js';

const original = {
  APP_URL: process.env.APP_URL,
  GOOGLE_GMAIL_CLIENT_ID: process.env.GOOGLE_GMAIL_CLIENT_ID,
  GMAIL_OAUTH_STATE_SECRET: process.env.GMAIL_OAUTH_STATE_SECRET,
  GMAIL_TOKEN_ENCRYPTION_KEY: process.env.GMAIL_TOKEN_ENCRYPTION_KEY
};

test.before(() => {
  process.env.APP_URL = 'https://dealer.example';
  process.env.GOOGLE_GMAIL_CLIENT_ID = 'client-id.apps.googleusercontent.com';
  process.env.GMAIL_OAUTH_STATE_SECRET = 'state-secret-that-is-long-and-independent';
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = 'token-secret-that-is-long-and-independent';
});

test.after(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('Gmail OAuth state is signed and tenant-bound', () => {
  const state = createGmailState({ organisationId: 'org-123', clerkUserId: 'user-456' });
  const decoded = verifyGmailState(state);
  assert.equal(decoded.organisationId, 'org-123');
  assert.equal(decoded.clerkUserId, 'user-456');
  assert.throws(() => verifyGmailState(`${state}tampered`), /invalid or has expired/);
});

test('platform Gmail OAuth state is signed without a dealer tenant', () => {
  const state = createGmailState({ clerkUserId: 'platform-owner', scope: 'platform' });
  const decoded = verifyGmailState(state);
  assert.equal(decoded.clerkUserId, 'platform-owner');
  assert.equal(decoded.scope, 'platform');
  assert.equal(decoded.organisationId, null);
});

test('Gmail authorisation uses the app callback and least-privilege send scope', () => {
  const url = new URL(gmailAuthorizationURL('signed-state'));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://dealer.example/api/integrations/gmail/callback');
  assert.match(url.searchParams.get('scope'), /gmail\.send/);
  assert.doesNotMatch(url.searchParams.get('scope'), /mail\.google\.com/);
  assert.equal(url.searchParams.get('state'), 'signed-state');
});

test('Gmail credentials are sealed before database storage', () => {
  const sealed = sealGmailCredentials({
    access_token: 'access-secret',
    refresh_token: 'refresh-secret',
    expires_in: 3600,
    scope: 'openid email'
  });
  assert.match(sealed, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
  assert.doesNotMatch(sealed, /access-secret|refresh-secret/);
  const unsealed = unsealGmailCredentials(sealed);
  assert.equal(unsealed.accessToken, 'access-secret');
  assert.equal(unsealed.refreshToken, 'refresh-secret');
  assert.equal(unsealed.tokenType, 'Bearer');
  assert.equal(unsealed.scope, 'openid email');
});

test('Gmail messages are encoded as safe plain text RFC 822 content', () => {
  const decoded = Buffer.from(gmailRawMessage({
    to: 'buyer@example.com',
    subject: 'AEGIS test',
    body: 'Hello from AEGIS.'
  }), 'base64url').toString('utf8');
  assert.match(decoded, /^To: buyer@example\.com\r\nSubject: AEGIS test/m);
  assert.match(decoded, /\r\n\r\nHello from AEGIS\.$/);
  assert.throws(() => gmailRawMessage({ to: 'not-an-email', subject: 'Test', body: 'Hello' }), /valid recipient/);
});

test('Gmail calendar invitations are attached as portable iCalendar files', () => {
  const raw = gmailRawMessage({
    to: 'dealer@example.com',
    subject: 'Consultation booked',
    body: 'Your appointment is booked.',
    calendar: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'
  });
  const message = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(message, /Content-Type: multipart\/mixed/);
  assert.match(message, /Content-Type: text\/calendar; method=REQUEST/);
  assert.match(message, /dealerfoundry-website-consultation\.ics/);
  assert.match(message, /QkVHSU46VkNBTEVOREFS/);
});
