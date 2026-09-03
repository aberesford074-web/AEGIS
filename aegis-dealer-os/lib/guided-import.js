export function importKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';

export function planGuidedImport({ incoming, existing, fields, required, uniqueField, mode = 'update_matching', overwrite = false }) {
  const allowed = new Set(fields);
  const existingByKey = new Map((existing || []).flatMap((row) => {
    const key = importKey(row?.[uniqueField]);
    return key ? [[key, row]] : [];
  }));
  const seen = new Set();
  const creates = [];
  const updates = [];
  const errors = [];
  let skipped = 0;

  for (const [index, raw] of (incoming || []).entries()) {
    const item = Object.fromEntries(Object.entries(raw || {}).filter(([key, value]) => allowed.has(key) && hasValue(value)));
    const missing = required.filter((field) => !hasValue(item[field]));
    if (missing.length) {
      errors.push({ row: index + 2, message: `Missing ${missing.join(', ')}` });
      continue;
    }
    const key = importKey(item[uniqueField]);
    if (key && seen.has(key)) {
      skipped += 1;
      errors.push({ row: index + 2, message: `Duplicate ${uniqueField} in this file` });
      continue;
    }
    if (key) seen.add(key);
    const match = key ? existingByKey.get(key) : null;
    if (!match || mode === 'create_new') {
      creates.push(item);
      continue;
    }
    const changes = {};
    for (const [field, value] of Object.entries(item)) {
      if (field === uniqueField) continue;
      if (overwrite || !hasValue(match[field])) changes[field] = value;
    }
    if (Object.keys(changes).length) updates.push({ id: match.id, changes });
    else skipped += 1;
  }
  return { creates, updates, errors, skipped };
}
