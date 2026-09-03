import assert from 'node:assert/strict';
import test from 'node:test';
import { proposalNumber, proposalTotal } from '../lib/proposals.js';

test('proposal total includes discount, transport and preparation', () => {
  assert.equal(proposalTotal({
    askingPrice: 18_500,
    discount: 500,
    transportPrice: 350,
    preparationPrice: 150
  }), 18_500);
});

test('proposal number is readable and sortable', () => {
  assert.equal(
    proposalNumber(new Date('2026-08-26T14:05:09.000Z'), 'A1B2'),
    'AEGIS-20260826-140509-A1B2'
  );
});
