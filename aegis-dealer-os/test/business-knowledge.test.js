import test from 'node:test';
import assert from 'node:assert/strict';
import { compactKnowledgeItem, knowledgeCatalog, knowledgeTerms } from '../lib/business-knowledge.js';

test('knowledge terms remove conversational filler and preserve business identifiers', () => {
  assert.deepEqual(knowledgeTerms('What do we know about Chicken Fried Egg and truck QA-001?'), [
    'chicken', 'qa-001', 'fried', 'truck', 'egg'
  ]);
});

test('knowledge catalog discovers entity types without a hard-coded list', () => {
  assert.deepEqual(knowledgeCatalog([
    { entity_type: 'company', updated_at: '2026-08-20' },
    { entity_type: 'company', updated_at: '2026-08-22' },
    { entity_type: 'warranty_claim', updated_at: '2026-08-23' }
  ]), [
    { type: 'company', count: 2, lastUpdated: '2026-08-22' },
    { type: 'warranty_claim', count: 1, lastUpdated: '2026-08-23' }
  ]);
});

test('knowledge results retain data and relationships for agent reasoning', () => {
  assert.deepEqual(compactKnowledgeItem({
    source_record_id: 'm1', entity_type: 'machine', title: 'Toyota 8FBE20U',
    relationships: { customer_id: 'c1' }, content: { status: 'in-stock' }, occurred_at: '2026-08-24'
  }), {
    id: 'm1', type: 'machine', title: 'Toyota 8FBE20U',
    relationships: { customer_id: 'c1' }, content: { status: 'in-stock' }, updatedAt: '2026-08-24'
  });
});
