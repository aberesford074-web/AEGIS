import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  createWhatsAppState,
  normaliseWhatsAppWebhook,
  sealWhatsAppToken,
  unsealWhatsAppToken,
  verifyWhatsAppState,
  verifyWhatsAppWebhookSignature,
  whatsappPlatformReadiness
} from '../lib/meta-whatsapp.js';

const keys = [
  'APP_URL', 'META_WHATSAPP_APP_ID', 'META_WHATSAPP_APP_SECRET',
  'META_WHATSAPP_CONFIG_ID', 'META_WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_OAUTH_STATE_SECRET', 'WHATSAPP_TOKEN_ENCRYPTION_KEY'
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

test.before(() => {
  process.env.APP_URL = 'https://dealer.example';
  process.env.META_WHATSAPP_APP_ID = '123456789';
  process.env.META_WHATSAPP_APP_SECRET = 'meta-app-secret';
  process.env.META_WHATSAPP_CONFIG_ID = '987654321';
  process.env.META_WHATSAPP_VERIFY_TOKEN = 'verify-token';
  process.env.WHATSAPP_OAUTH_STATE_SECRET = 'state-secret-that-is-independent';
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = 'token-key-that-is-independent';
});

test.after(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('WhatsApp platform readiness exposes only safe setup information', () => {
  const result = whatsappPlatformReadiness();
  assert.equal(result.ready, true);
  assert.equal(result.webhookUrl, 'https://dealer.example/api/integrations/whatsapp/webhook');
  assert.deepEqual(result.missing, []);
});

test('WhatsApp state is signed, expiring and tenant-bound', () => {
  const state = createWhatsAppState({ organisationId: 'org-123', clerkUserId: 'user-456' });
  assert.equal(verifyWhatsAppState(state).organisationId, 'org-123');
  assert.throws(() => verifyWhatsAppState(`${state}x`), /invalid or has expired/);
});

test('WhatsApp webhook signatures are checked against the exact raw body', () => {
  const raw = Buffer.from('{"object":"whatsapp_business_account"}');
  const signature = crypto.createHmac('sha256', process.env.META_WHATSAPP_APP_SECRET).update(raw).digest('hex');
  assert.equal(verifyWhatsAppWebhookSignature(raw, `sha256=${signature}`), true);
  assert.equal(verifyWhatsAppWebhookSignature(Buffer.from('{}'), `sha256=${signature}`), false);
});

test('WhatsApp webhook messages and delivery statuses are normalised', () => {
  const events = normaliseWhatsAppWebhook({
    entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '100', display_phone_number: '441234' },
      contacts: [{ wa_id: '447700', profile: { name: 'Dealer Owner' } }],
      messages: [{ id: 'wamid.1', from: '447700', type: 'text', text: { body: 'What is in stock?' }, timestamp: '1720000000' }],
      statuses: [{ id: 'wamid.2', status: 'delivered', timestamp: '1720000001' }]
    } }] }]
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].body, 'What is in stock?');
  assert.equal(events[0].displayName, 'Dealer Owner');
  assert.equal(events[1].status, 'delivered');
});

test('WhatsApp access tokens are encrypted before storage', () => {
  const sealed = sealWhatsAppToken('secret-access-token');
  assert.match(sealed, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
  assert.doesNotMatch(sealed, /secret-access-token/);
  assert.equal(unsealWhatsAppToken(sealed), 'secret-access-token');
});
