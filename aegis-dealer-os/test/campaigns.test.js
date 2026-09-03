import assert from 'node:assert/strict';
import test from 'node:test';
import { campaignCanTransition, campaignProgress, uniqueCampaignRecipients } from '../lib/campaigns.js';

test('campaign recipients are validated, normalised, deduplicated and suppressed', () => {
  const rows = uniqueCampaignRecipients([
    { id: '1', first_name: 'Aaron', email: ' AARON@example.com ', email_marketing_status: 'subscribed' },
    { id: '2', first_name: 'Duplicate', email: 'aaron@example.com', email_marketing_status: 'subscribed' },
    { id: '3', first_name: 'Brett', email: 'brett@example.com', email_marketing_status: 'unsubscribed' },
    { id: '4', email: 'not-an-email' }
  ]);
  assert.deepEqual(rows, [
    { contact_id: '1', email: 'aaron@example.com', name: 'Aaron', status: 'queued' },
    { contact_id: '3', email: 'brett@example.com', name: 'Brett', status: 'suppressed' }
  ]);
});

test('campaign transitions do not allow completed mail to restart', () => {
  assert.equal(campaignCanTransition('draft', 'scheduled'), true);
  assert.equal(campaignCanTransition('scheduled', 'paused'), true);
  assert.equal(campaignCanTransition('paused', 'scheduled'), true);
  assert.equal(campaignCanTransition('completed', 'scheduled'), false);
});

test('campaign progress never reports a negative remaining count', () => {
  assert.deepEqual(campaignProgress({ recipient_count: 3, sent_count: 3, failed_count: 1 }), {
    total: 3, sent: 3, failed: 1, remaining: 0
  });
});
