import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { organisationContext } from '../../lib/supabase.js';
import { planGuidedImport } from '../../lib/guided-import.js';
import { normaliseWebsiteCategory } from '../../lib/machine-categories.js';

const customerFields = new Set(['branch_id', 'name', 'website', 'lifecycle_stage', 'relationship_roles', 'primary_contact_name', 'primary_contact_email', 'primary_contact_phone', 'address', 'notes']);
const contactFields = new Set(['customer_id', 'first_name', 'last_name', 'job_title', 'email', 'phone', 'notes', 'source', 'email_marketing_status', 'email_marketing_updated_at']);

const asText = (value) => String(value ?? '').trim();
const firstValue = (...values) => values.map(asText).find(Boolean) || '';
const keyText = (value) => asText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const asNumber = (...values) => {
  const value = values.map(asText).find(Boolean);
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const sourceRows = (body, key) => Array.isArray(body?.[key]) ? body[key] : [];

function legacyCompany(row, source = 'legacy-aegis') {
  return {
    source_system: source,
    external_id: firstValue(row.id, row.supplierId, row.rowId, row.sourceRow) || null,
    name: firstValue(row.company, row.companyName, row.business, row.businessName, row.name, row.dealer, row.supplier),
    website: firstValue(row.website, row.websiteUrl, row.url) || null,
    primary_contact_name: firstValue(row.contact, row.contactName, row.customer, row.primaryContact) || null,
    primary_contact_email: firstValue(row.email, row.contactEmail) || null,
    primary_contact_phone: firstValue(row.phone, row.contactPhone, row.mobile) || null,
    address: firstValue(row.address, row.location, row.postcode) || null,
    lifecycle_stage: source === 'legacy-supplier' ? 'supplier' : 'prospect',
    notes: firstValue(row.notes, row.ownerNotes, row.applicationDetails, row.note) || null,
  };
}

function legacyMachine(row) {
  const validStatus = new Set(['draft', 'in-stock', 'reserved', 'sold', 'available-to-source']);
  return {
    source_system: 'legacy-aegis',
    external_id: firstValue(row.id, row.stockId, row.supplierStockId) || null,
    serial_number: firstValue(row.serialNumber, row.serial, row.stockId) || null,
    make: firstValue(row.make, row.brand, row.manufacturer),
    model: firstValue(row.model, row.machineModel),
    machine_type: firstValue(row.machineType, row.type, row.category) || null,
    website_category: normaliseWebsiteCategory(firstValue(row.websiteCategory, row.website_category, row.category, row.type)),
    year: asNumber(row.year), hours: asNumber(row.hours, row.engineHours),
    ownership_status: row.status === 'available-to-source' ? 'sourcing' : 'stock',
    // Imported records never go live automatically, but their operational
    // status is retained so dealers can distinguish stock from sourcing work.
    status: validStatus.has(row.status) ? row.status : 'draft',
    condition: firstValue(row.condition) || null, location: firstValue(row.location, row.town, row.county) || null,
    price: asNumber(row.price, row.askingPrice), description: firstValue(row.description, row.notes) || null,
    image_urls: [row.imageMain, row.image, row.imageUrl, row.photo, ...(Array.isArray(row.galleryImages) ? row.galleryImages : [])]
      .flatMap((value) => asText(value).split(/\s*[|;]\s*/)).filter(Boolean),
  };
}

async function legacyAegisMigration(request, response, context, session) {
  const body = request.body || {};
  const companies = [
    ...sourceRows(body, 'companies').map((row) => legacyCompany(row)),
    ...sourceRows(body, 'leads').map((row) => legacyCompany(row)),
    ...sourceRows(body, 'suppliers').map((row) => legacyCompany(row, 'legacy-supplier')),
    ...sourceRows(body, 'enquiries').map((row) => legacyCompany(row)),
  ].filter((row) => row.name);
  const machines = sourceRows(body, 'stock').map(legacyMachine).filter((row) => row.make && row.model);
  const activities = [...sourceRows(body, 'activities'), ...sourceRows(body, 'emailActivity'), ...sourceRows(body, 'eventLog')];
  const counts = { machines: machines.length, companies: companies.length, opportunities: sourceRows(body, 'opportunities').length + sourceRows(body, 'enquiries').length, activities: activities.length, sales: sourceRows(body, 'sales').length };
  if (body.mode === 'preview') return response.status(200).json({ ok: true, preview: { counts, warnings: [sourceRows(body, 'automations').length ? 'Automations need to be recreated and reviewed; they are not started automatically.' : null].filter(Boolean), samples: { machines: machines.slice(0, 5), companies: companies.slice(0, 5) } } });

  const orgId = context.organisation.id;
  const imported = { machines: 0, companies: 0, contacts: 0, opportunities: 0, activities: 0, sales: 0 };
  const customerByKey = new Map();
  const { data: existing } = await context.supabase.from('customers').select('id,name,primary_contact_email').eq('organisation_id', orgId).limit(2000);
  for (const row of existing || []) { customerByKey.set(`name:${keyText(row.name)}`, row.id); if (row.primary_contact_email) customerByKey.set(`email:${keyText(row.primary_contact_email)}`, row.id); }
  if (machines.length) {
    const { data, error } = await context.supabase.from('machines').upsert(machines.map((row) => ({ organisation_id: orgId, ...row })), { onConflict: 'organisation_id,source_system,external_id' }).select('id');
    if (error) throw error; imported.machines = data?.length || 0;
  }
  for (const row of companies) {
    const match = customerByKey.get(`email:${keyText(row.primary_contact_email)}`) || customerByKey.get(`name:${keyText(row.name)}`);
    let id = match;
    if (!id) {
      const { data, error } = await context.supabase.from('customers').insert({ organisation_id: orgId, ...row }).select('id').single();
      if (error) throw error; id = data.id; imported.companies += 1;
      customerByKey.set(`name:${keyText(row.name)}`, id);
      if (row.primary_contact_email) customerByKey.set(`email:${keyText(row.primary_contact_email)}`, id);
      if (row.primary_contact_name) {
        const parts = row.primary_contact_name.split(/\s+/);
        const { error: contactError } = await context.supabase.from('contacts').insert({ organisation_id: orgId, customer_id: id, first_name: parts.shift() || row.primary_contact_name, last_name: parts.join(' ') || null, email: row.primary_contact_email, phone: row.primary_contact_phone, source: 'legacy-aegis' });
        if (!contactError) imported.contacts += 1;
      }
    }
  }
  for (const row of [...sourceRows(body, 'opportunities'), ...sourceRows(body, 'enquiries')]) {
    const customerId = customerByKey.get(`name:${keyText(firstValue(row.company, row.business, row.supplier))}`) || customerByKey.get(`email:${keyText(row.email)}`) || null;
    const { error } = await context.supabase.from('opportunities').insert({ organisation_id: orgId, customer_id: customerId, title: firstValue(row.title, row.company, row.contact, row.interestedTruck, row.interestedMachine) || 'Imported opportunity', stage: firstValue(row.stage, row.pipelineStage, row.classification) || 'new', value: asNumber(row.value, row.saleValue, row.budget), next_action: firstValue(row.nextAction, row.action, row.ownerNotes) || null, source: 'legacy-aegis' });
    if (!error) imported.opportunities += 1;
  }
  if (activities.length) {
    const { data, error } = await context.supabase.from('activities').insert(activities.map((row) => ({ organisation_id: orgId, customer_id: customerByKey.get(`name:${keyText(firstValue(row.company, row.business))}`) || null, activity_type: firstValue(row.activityType, row.eventType, row.direction, row.status) || 'legacy_import', body: firstValue(row.body, row.summary, row.notes, row.subject) || null, metadata: { source: 'legacy-aegis', original: row } }))).select('id');
    if (error) throw error; imported.activities = data?.length || 0;
  }
  const sales = sourceRows(body, 'sales');
  if (sales.length) {
    const { data, error } = await context.supabase.from('sales').insert(sales.map((row) => ({
      organisation_id: orgId,
      customer_id: customerByKey.get(`name:${keyText(firstValue(row.company, row.customer))}`) || customerByKey.get(`email:${keyText(row.email)}`) || null,
      reference: firstValue(row.reference, row.id) || 'legacy-sale',
      sale_price: asNumber(row.salePrice, row.value),
      sale_date: asText(row.saleDate) || undefined,
      status: firstValue(row.status) || 'completed',
      notes: firstValue(row.notes, row.ownerNotes) || null,
    }))).select('id');
    if (error) throw error; imported.sales = data?.length || 0;
  }
  await context.supabase.from('audit_events').insert({ organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, event_type: 'legacy_aegis.imported', payload: imported });
  return response.status(201).json({ ok: true, imported, sourceSummary: counts });
}

function pick(body, fields) {
  return Object.fromEntries(Object.entries(body || {}).filter(([key, value]) => fields.has(key) && value !== undefined).map(([key, value]) => [key, value === '' ? null : value]));
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;
    if (request.method === 'POST' && request.query?.resource === 'legacy-aegis') return await legacyAegisMigration(request, response, context, session);
    if (request.method === 'GET' && request.query?.resource === 'relationships') {
      const [companies, contacts] = await Promise.all([
        context.supabase.from('customers').select('*').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(500),
        context.supabase.from('contacts').select('*,customer:customers(id,name)').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(500)
      ]);
      if (companies.error) throw companies.error;
      if (contacts.error) throw contacts.error;
      return response.status(200).json({ items: [
        ...(companies.data || []).map((item) => ({ ...item, record_type: 'company' })),
        ...(contacts.data || []).map((item) => ({ ...item, record_type: 'contact', name: [item.first_name, item.last_name].filter(Boolean).join(' '), company_name: item.customer?.name || null }))
      ] });
    }
    const resource = request.query?.resource === 'contacts' || request.body?.resource === 'contact' ? 'contacts' : 'customers';
    const fields = resource === 'contacts' ? contactFields : customerFields;
    if (request.method === 'GET') {
      let query = context.supabase.from(resource).select('*').eq('organisation_id', orgId);
      if (request.query?.search) {
        const search = String(request.query.search).replace(/[%_,]/g, ' ');
        query = resource === 'contacts'
          ? query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
          : query.or(`name.ilike.%${search}%,primary_contact_name.ilike.%${search}%,primary_contact_email.ilike.%${search}%`);
      }
      const { data, error } = await query.order('updated_at', { ascending: false }).limit(500);
      if (error) throw error;
      return response.status(200).json({ items: data });
    }
    if (request.method === 'POST' && request.query?.resource === 'import') {
      const items = Array.isArray(request.body?.items) ? request.body.items : [];
      const importingContacts = request.body?.entity === 'contacts';
      const table = importingContacts ? 'contacts' : 'customers';
      const importFields = importingContacts ? contactFields : customerFields;
      const required = importingContacts ? ['first_name'] : ['name'];
      const fallbackUnique = importingContacts ? 'email' : 'name';
      const uniqueField = importFields.has(request.body?.uniqueField) ? request.body.uniqueField : fallbackUnique;
      if (!items.length) return response.status(400).json({ error: `Import contains no ${importingContacts ? 'contact' : 'company'} rows.` });
      const { data: existing, error: existingError } = await context.supabase.from(table).select('*').eq('organisation_id', orgId).limit(5000);
      if (existingError) throw existingError;
      const plan = planGuidedImport({
        incoming: items, existing: existing || [], fields: [...importFields], required, uniqueField,
        mode: request.body?.mode, overwrite: request.body?.overwrite === true
      });
      let created = [];
      if (plan.creates.length) {
        const result = await context.supabase.from(table).insert(plan.creates.map((item) => ({ organisation_id: orgId, ...item }))).select('*');
        if (result.error) throw result.error;
        created = result.data || [];
      }
      const updated = [];
      for (const update of plan.updates) {
        const result = await context.supabase.from(table).update(update.changes).eq('id', update.id).eq('organisation_id', orgId).select('*').single();
        if (result.error) throw result.error;
        updated.push(result.data);
      }
      await context.supabase.from('audit_events').insert({
        organisation_id: orgId,
        actor_clerk_user_id: session.clerkUserId,
        event_type: `${importingContacts ? 'contact' : 'customer'}.imported`,
        record_type: importingContacts ? 'contact' : 'customer',
        payload: { created: created.length, updated: updated.length, skipped: plan.skipped, errors: plan.errors.length }
      });
      return response.status(201).json({ imported: created.length + updated.length, created: created.length, updated: updated.length, skipped: plan.skipped, errors: plan.errors.slice(0, 100), items: [...created, ...updated] });
    }
    const payload = { organisation_id: orgId, ...pick(request.body, fields) };
    if (resource === 'contacts') payload.first_name = requireText(payload.first_name, 'Contact first name');
    else payload.name = requireText(payload.name, 'Company name');

    if (request.method === 'POST') {
      const { data, error } = await context.supabase.from(resource).insert(payload).select('*').single();
      if (error) throw error;
      await context.supabase.from('audit_events').insert({ organisation_id: orgId, actor_clerk_user_id: session.clerkUserId, event_type: `${resource === 'contacts' ? 'contact' : 'customer'}.created`, record_type: resource === 'contacts' ? 'contact' : 'customer', record_id: data.id });
      return response.status(201).json({ item: data });
    }
    const id = requireText(request.body?.id, resource === 'contacts' ? 'Contact ID' : 'Company ID');
    delete payload.organisation_id;
    const { data, error } = await context.supabase.from(resource).update(payload).eq('id', id).eq('organisation_id', orgId).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ error: 'Record not found.' });
    return response.status(200).json({ item: data });
  } catch (error) {
    return handleApiError(response, error);
  }
}
