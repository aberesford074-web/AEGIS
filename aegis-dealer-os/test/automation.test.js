import assert from 'node:assert/strict';
import test from 'node:test';
import { nextRunAt } from '../lib/automation.js';

test('nextRunAt advances by the dealer rule cadence', () => {
  const from = new Date('2026-08-21T08:00:00.000Z');
  assert.equal(
    nextRunAt({ cadence_minutes: 60 }, from),
    '2026-08-21T09:00:00.000Z'
  );
});

test('nextRunAt enforces the minimum safe cadence', () => {
  const from = new Date('2026-08-21T08:00:00.000Z');
  assert.equal(
    nextRunAt({ cadence_minutes: 1 }, from),
    '2026-08-21T08:15:00.000Z'
  );
});

test('nextRunAt defaults malformed rules to daily', () => {
  const from = new Date('2026-08-21T08:00:00.000Z');
  assert.equal(
    nextRunAt({ cadence_minutes: 'not-a-number' }, from),
    '2026-08-22T08:00:00.000Z'
  );
});
