const stopWords = new Set([
  'a', 'about', 'all', 'and', 'are', 'can', 'do', 'for', 'from', 'give', 'have',
  'how', 'i', 'in', 'is', 'it', 'know', 'me', 'my', 'of', 'on', 'our', 'show', 'tell',
  'the', 'to', 'we', 'what', 'when', 'where', 'which', 'who', 'with', 'you'
]);

export function knowledgeTerms(value, maximum = 8) {
  return [...new Set(String(value || '').toLowerCase().match(/[a-z0-9@.+-]{2,}/g) || [])]
    .filter((term) => !stopWords.has(term))
    .sort((left, right) => right.length - left.length)
    .slice(0, maximum);
}

export function knowledgeCatalog(items = []) {
  const catalog = new Map();
  for (const item of items) {
    const type = String(item.entity_type || 'business_record');
    const current = catalog.get(type) || { type, count: 0, lastUpdated: null };
    current.count += 1;
    const updated = item.updated_at || item.occurred_at || null;
    if (updated && (!current.lastUpdated || updated > current.lastUpdated)) current.lastUpdated = updated;
    catalog.set(type, current);
  }
  return [...catalog.values()].sort((left, right) => left.type.localeCompare(right.type));
}

export function compactKnowledgeItem(item = {}) {
  return {
    id: item.source_record_id,
    type: item.entity_type,
    title: item.title,
    relationships: item.relationships || {},
    content: item.content || {},
    updatedAt: item.occurred_at || item.updated_at || null
  };
}
