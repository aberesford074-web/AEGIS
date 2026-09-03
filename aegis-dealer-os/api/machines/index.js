import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext, requireManager, supabaseAdmin } from '../../lib/supabase.js';
import { planGuidedImport } from '../../lib/guided-import.js';
import { normaliseMachineSpecifications, normaliseWebsiteCategory } from '../../lib/machine-categories.js';
import { enqueuePublishingJob, runPublishingJobs } from '../../lib/publishing.js';

const editableFields = new Set([
  'customer_id', 'branch_id', 'serial_number', 'make', 'model', 'machine_type',
  'website_category',
  'year', 'hours', 'ownership_status', 'status', 'condition', 'location', 'price',
  'currency', 'description', 'image_urls', 'website_slug', 'is_published', 'specifications'
]);

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function machinePayload(body, organisationId) {
  const payload = { organisation_id: organisationId };
  for (const [key, value] of Object.entries(body || {})) {
    if (editableFields.has(key) && value !== undefined) payload[key] = value === '' ? null : value;
  }
  if (payload.website_category !== undefined) payload.website_category = normaliseWebsiteCategory(payload.website_category);
  if (payload.specifications !== undefined) {
    payload.specifications = normaliseMachineSpecifications(payload.website_category || body?.website_category || body?.machine_type, payload.specifications);
    payload.specification_template_version = 1;
  }
  if (!payload.website_slug) payload.website_slug = slugify([payload.make, payload.model, payload.serial_number].filter(Boolean).join('-')) || null;
  if (payload.is_published) payload.published_at = new Date().toISOString();
  return payload;
}

async function publicInventory(request, response) {
  const publicSlug = String(request.query?.publicOrg || '').trim();
  const supabase = supabaseAdmin();
  const { data: organisation, error: orgError } = await supabase.from('organisations').select('id, name, public_slug').eq('public_slug', publicSlug).maybeSingle();
  if (orgError) throw orgError;
  if (!organisation) return response.status(404).json({ error: 'Dealer website feed not found.' });
  const { data, error } = await supabase.from('machines')
    .select('id,make,model,machine_type,website_category,specifications,specification_template_version,year,hours,status,condition,location,price,currency,description,image_urls,website_slug,publishing_last_succeeded_at,updated_at')
    .eq('organisation_id', organisation.id).eq('is_published', true)
    .in('status', ['in-stock', 'reserved', 'available-to-source']).order('updated_at', { ascending: false }).limit(500);
  if (error) throw error;
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  return response.status(200).json({ dealer: organisation.name, updatedAt: new Date().toISOString(), items: data || [] });
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    if (request.method === 'GET' && request.query?.publicOrg) return await publicInventory(request, response);
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;
    if (request.method === 'GET') {
      let query = context.supabase.from('machines').select('*').eq('organisation_id', orgId);
      if (request.query?.status) query = query.eq('status', request.query.status);
      if (request.query?.published === 'true') query = query.eq('is_published', true);
      if (request.query?.search) {
        const search = String(request.query.search).replace(/[%_,]/g, ' ');
        query = query.or(`make.ilike.%${search}%,model.ilike.%${search}%,serial_number.ilike.%${search}%,machine_type.ilike.%${search}%`);
      }
      const { data, error } = await query.order('updated_at', { ascending: false }).limit(500);
      if (error) throw error;
      return response.status(200).json({ items: data });
    }

    if (request.body?.is_published === true) requireManager(context.membership);
    if (request.method === 'POST' && request.query?.resource === 'import') {
      const items = Array.isArray(request.body?.items) ? request.body.items : [];
      if (!items.length) return response.status(400).json({ error: 'Import contains no machine rows.' });
      const payloads = items.map((item) => machinePayload(item, orgId));
      payloads.forEach((payload) => {
        payload.make = requireText(payload.make, 'Machine make');
        payload.model = requireText(payload.model, 'Machine model');
        payload.ownership_status = payload.ownership_status || 'stock';
        payload.status = payload.status || 'draft';
        payload.is_published = false;
      });
      const uniqueField = editableFields.has(request.body?.uniqueField) ? request.body.uniqueField : 'serial_number';
      const { data: existing, error: existingError } = await context.supabase.from('machines').select('*').eq('organisation_id', orgId).limit(5000);
      if (existingError) throw existingError;
      const plan = planGuidedImport({
        incoming: payloads, existing: existing || [], fields: [...editableFields], required: ['make', 'model'], uniqueField,
        mode: request.body?.mode, overwrite: request.body?.overwrite === true
      });
      let created = [];
      if (plan.creates.length) {
        const result = await context.supabase.from('machines').insert(plan.creates.map((item) => ({ organisation_id: orgId, ...item, is_published: false }))).select('*');
        if (result.error) throw result.error;
        created = result.data || [];
      }
      const updated = [];
      for (const update of plan.updates) {
        const result = await context.supabase.from('machines').update({ ...update.changes, is_published: false }).eq('id', update.id).eq('organisation_id', orgId).select('*').single();
        if (result.error) throw result.error;
        updated.push(result.data);
      }
      await context.supabase.from('audit_events').insert({
        organisation_id: orgId,
        actor_clerk_user_id: session.clerkUserId,
        event_type: 'machine.imported',
        record_type: 'machine',
        payload: { created: created.length, updated: updated.length, skipped: plan.skipped, errors: plan.errors.length }
      });
      return response.status(201).json({ imported: created.length + updated.length, created: created.length, updated: updated.length, skipped: plan.skipped, errors: plan.errors.slice(0, 100), items: [...created, ...updated] });
    }
    if (request.method === 'POST') {
      const payload = machinePayload(request.body, orgId);
      payload.make = requireText(payload.make, 'Machine make');
      payload.model = requireText(payload.model, 'Machine model');
      const { data, error } = await context.supabase.from('machines').insert(payload).select('*').single();
      if (error) throw error;
      await context.supabase.from('audit_events').insert({ organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, event_type: 'machine.created', record_type: 'machine', record_id: data.id, payload: { make: data.make, model: data.model } });
      return response.status(201).json({ item: data });
    }

    const id = requireText(request.body?.id, 'Machine ID');
    const publishingRequested = Object.prototype.hasOwnProperty.call(request.body || {}, 'is_published');
    const payload = machinePayload(request.body, orgId);
    delete payload.organisation_id;
    const { data, error } = await context.supabase.from('machines').update(payload).eq('id', id).eq('organisation_id', orgId).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ error: 'Machine not found.' });
    let publishingJob = null;
    if (publishingRequested) {
      publishingJob = await enqueuePublishingJob({
        supabase: context.supabase,
        organisationId: orgId,
        machine: data,
        operation: data.is_published ? (data.published_at ? 'update' : 'publish') : 'unpublish'
      });
      await runPublishingJobs({ supabase: context.supabase, organisationId: orgId, jobId: publishingJob.id, limit: 1 });
    }
    await context.supabase.from('audit_events').insert({ organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, event_type: data.is_published ? 'machine.published' : 'machine.updated', record_type: 'machine', record_id: data.id });
    const refreshed = await context.supabase.from('machines').select('*').eq('organisation_id', orgId).eq('id', id).single();
    if (refreshed.error) throw refreshed.error;
    return response.status(200).json({ item: refreshed.data, publishingJob });
  } catch (error) {
    return handleApiError(response, error);
  }
}
