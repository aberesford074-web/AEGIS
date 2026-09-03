import assert from 'node:assert/strict';
import test from 'node:test';

import { normaliseMachineSpecifications } from '../lib/machine-categories.js';
import { proposalPdf } from '../lib/proposal-pdf.js';

test('category specifications retain only approved machine fields', () => {
  assert.deepEqual(normaliseMachineSpecifications('forklift-truck', {
    capacity_kg: 3000,
    lift_height_mm: 4700,
    mast_type: 'triplex',
    hidden_internal_note: 'must not leak'
  }), {
    capacity_kg: 3000,
    lift_height_mm: 4700,
    mast_type: 'triplex'
  });
});

test('quotation PDF is a one-page PDF with the commercial snapshot', () => {
  const buffer = proposalPdf({
    proposal_number: 'DF-TEST-1',
    currency: 'GBP',
    total_price: 25000,
    customer: { name: 'Test Dealer' },
    machine: { make: 'Toyota', model: '8FD30' }
  }, 'DealerFoundry Test');
  const text = buffer.toString('latin1');
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /DF-TEST-1/);
  assert.match(text, /Toyota 8FD30/);
  assert.match(text, /TOTAL: GBP 25,000\.00/);
  assert.match(text, /%%EOF$/);
});
