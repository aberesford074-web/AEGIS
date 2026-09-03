import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext } from '../../lib/supabase.js';

const rowFields = new Set([
  'company', 'phone', 'postcode', 'address', 'email', 'spoke_to', 'contact_name',
  'notes', 'website', 'linkedin_url', 'source_url', 'confidence', 'status',
  'next_action_at', 'last_contacted_at', 'owner_clerk_user_id'
]);
const validStatuses = new Set(['not_contacted', 'attempted', 'contacted', 'follow_up', 'qualified', 'not_interested']);
const text = (value) => String(value ?? '').trim();
const companyKey = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const chunks = (items, size = 500) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

function cleanRow(value = {}, partial = false) {
  const row = Object.fromEntries(Object.entries(value).filter(([key]) => rowFields.has(key)));
  for (const [key, item] of Object.entries(row)) row[key] = typeof item === 'string' ? item.trim() || null : item;
  if (!partial || Object.prototype.hasOwnProperty.call(value, 'company')) {
    row.company = text(row.company);
    row.company_key = companyKey(row.company);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(value, 'status')) {
    row.status = validStatuses.has(row.status) ? row.status : 'not_contacted';
  }
  return row;
}

async function requireList(context, orgId, id) {
  const { data, error } = await context.supabase.from('prospect_lists').select('*').eq('id', id).eq('organisation_id', orgId).maybeSingle();
  if (error) throw error;
  if (!data) { const issue = new Error('Prospect list not found.'); issue.statusCode = 404; throw issue; }
  return data;
}

async function findOrCreateList(context, session, orgId, listId, listName) {
  if (listId) return requireList(context, orgId, listId);
  const name = requireText(listName || 'Prospects', 'List name');
  const { data: existing, error: readError } = await context.supabase.from('prospect_lists').select('*').eq('organisation_id', orgId).eq('name', name).maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;
  const { data, error } = await context.supabase.from('prospect_lists').insert({ organisation_id: orgId, name, created_by_clerk_user_id: session.clerkUserId }).select('*').single();
  if (error) throw error;
  return data;
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;

    if (request.method === 'GET') {
      const [listsResult, rowsResult] = await Promise.all([
        context.supabase.from('prospect_lists').select('*').eq('organisation_id', orgId).order('position').order('created_at'),
        context.supabase.from('prospect_companies').select('*').eq('organisation_id', orgId).order('created_at').limit(10000)
      ]);
      if (listsResult.error) throw listsResult.error;
      if (rowsResult.error) throw rowsResult.error;
      return response.status(200).json({ lists: listsResult.data || [], items: rowsResult.data || [] });
    }

    if (request.method === 'POST' && request.body?.action === 'create_list') {
      const list = await findOrCreateList(context, session, orgId, null, request.body?.name);
      return response.status(201).json({ item: list });
    }

    if (request.method === 'POST' && request.body?.action === 'import') {
      const list = await findOrCreateList(context, session, orgId, request.body?.listId, request.body?.listName);
      const incoming = (Array.isArray(request.body?.items) ? request.body.items : []).map(cleanRow).filter((row) => row.company);
      if (!incoming.length) return response.status(400).json({ error: 'The spreadsheet contains no company rows.' });
      const { data: existing, error: existingError } = await context.supabase.from('prospect_companies').select('*').eq('organisation_id', orgId).eq('list_id', list.id).limit(10000);
      if (existingError) throw existingError;
      const byKey = new Map((existing || []).map((row) => [row.company_key, row]));
      const creates = [];
      const updates = [];
      let skipped = 0;
      for (const row of incoming) {
        const current = byKey.get(row.company_key);
        if (!current) {
          creates.push({ organisation_id: orgId, list_id: list.id, source: 'spreadsheet', ...row });
          byKey.set(row.company_key, row);
          continue;
        }
        const changes = Object.fromEntries(Object.entries(row).filter(([key, value]) => key !== 'company_key' && value && !current[key]));
        if (Object.keys(changes).length) updates.push({ id: current.id, changes });
        else skipped += 1;
      }
      let created = 0;
      for (const batch of chunks(creates)) {
        const { data, error } = await context.supabase.from('prospect_companies').insert(batch).select('id');
        if (error) throw error;
        created += data?.length || 0;
      }
      for (const batch of chunks(updates, 50)) {
        const results = await Promise.all(batch.map((update) => context.supabase.from('prospect_companies').update(update.changes).eq('id', update.id).eq('organisation_id', orgId)));
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
      }
      await context.supabase.from('audit_events').insert({ organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, event_type: 'prospects.imported', record_type: 'prospect_list', record_id: list.id, payload: { created, updated: updates.length, skipped } });
      return response.status(201).json({ list, imported: created + updates.length, created, updated: updates.length, skipped });
    }

    if (request.method === 'POST') {
      const list = await findOrCreateList(context, session, orgId, request.body?.listId, request.body?.listName);
      const row = cleanRow(request.body);
      if (!row.company) return response.status(400).json({ error: 'Company name is required.' });
      const { data, error } = await context.supabase.from('prospect_companies').insert({ organisation_id: orgId, list_id: list.id, source: 'manual', ...row }).select('*').single();
      if (error) throw error;
      return response.status(201).json({ item: data });
    }

    const id = requireText(request.body?.id, 'Prospect ID');
    const changes = cleanRow(request.body?.changes || request.body, true);
    if (Object.prototype.hasOwnProperty.call(request.body?.changes || request.body, 'company')) {
      changes.company = requireText((request.body?.changes || request.body).company, 'Company name');
      changes.company_key = companyKey(changes.company);
    } else {
      delete changes.company;
    }
    const { data, error } = await context.supabase.from('prospect_companies').update(changes).eq('id', id).eq('organisation_id', orgId).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ error: 'Prospect not found.' });
    return response.status(200).json({ item: data });
  } catch (error) {
    return handleApiError(response, error);
  }
}
