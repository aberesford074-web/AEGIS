import test from 'node:test';
import assert from 'node:assert/strict';

import { approvalRequiresExecution } from '../api/approvals/[id].js';
import { publicConnection } from '../api/integrations/index.js';

test('Gmail approvals execute without a generic endpoint field', () => {
  assert.equal(approvalRequiresExecution({ action_type: 'send_email', payload: { to: 'dealer@example.com' } }), true);
});

test('record approvals execute when an endpoint is present', () => {
  assert.equal(approvalRequiresExecution({ action_type: 'publish_machine', payload: { endpoint: 'api/machines' } }), true);
  assert.equal(approvalRequiresExecution({ action_type: 'unknown', payload: {} }), false);
});

test('Gmail without the send scope is reported as requiring authorisation', () => {
  const item = publicConnection({
    provider_config_key: 'gmail',
    status: 'active',
    configuration: { account_email: 'dealer@example.com', granted_scopes: ['openid'] }
  });
  assert.equal(item.status, 'reauthorisation_required');
  assert.equal(item.gmail_can_send, false);
  assert.equal(item.account_email, 'dealer@example.com');
});

test('Gmail with the send scope is ready', () => {
  const item = publicConnection({
    provider_config_key: 'gmail',
    status: 'active',
    configuration: { granted_scopes: ['https://www.googleapis.com/auth/gmail.send'] }
  });
  assert.equal(item.status, 'active');
  assert.equal(item.gmail_can_send, true);
});
