import assert from 'node:assert/strict';
import test from 'node:test';
import { planGuidedImport } from '../lib/guided-import.js';

test('guided import updates empty fields without overwriting dealer data', () => {
  const plan = planGuidedImport({
    incoming: [{ name: 'Acme', website: 'acme.test', notes: 'from file' }],
    existing: [{ id: 'one', name: 'Acme', website: '', notes: 'dealer note' }],
    fields: ['name', 'website', 'notes'], required: ['name'], uniqueField: 'name'
  });
  assert.deepEqual(plan.updates, [{ id: 'one', changes: { website: 'acme.test' } }]);
});

test('guided import reports invalid and duplicate rows', () => {
  const plan = planGuidedImport({
    incoming: [{ email: '' }, { first_name: 'A', email: 'a@example.com' }, { first_name: 'Again', email: 'A@example.com' }],
    existing: [], fields: ['first_name', 'email'], required: ['first_name'], uniqueField: 'email'
  });
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.errors.length, 2);
  assert.equal(plan.skipped, 1);
});
