import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../lib/http.js';
import { organisationContext, supabaseAdmin } from '../../lib/supabase.js';

const clean = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const asPhotos = (value) => Array.isArray(value) ? value.slice(0, 20).map((item) => ({ name: clean(item.name, 180), url: clean(item.url, 800), type: clean(item.type, 80) })).filter((item) => item.url) : [];

export default async function handler(request, response) {
  if (!['GET', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'PATCH']);
  try {
    const context = await organisationContext(await requireOrganisationSession(request));
    const orgId = context.organisation.id;
    if (request.method === 'GET') {
      const { data, error } = await context.supabase.from('service_leads').select('*').eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return response.status(200).json({ items: data || [] });
    }
    const id = clean(request.body?.id, 80);
    const allowed = ['status', 'booking_status', 'appointment_date', 'appointment_window'];
    const payload = Object.fromEntries(Object.entries(request.body || {}).filter(([key, value]) => allowed.includes(key) && value !== undefined).map(([key, value]) => [key, clean(value, 120) || null]));
    const { data, error } = await context.supabase.from('service_leads').update(payload).eq('organisation_id', orgId).eq('id', id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ error: 'Lead not found.' });
    return response.status(200).json({ item: data });
  } catch (error) { return handleApiError(response, error); }
}

export async function ingestServiceLead(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  const expected = process.env.PLUMBER_LEADS_WEBHOOK_TOKEN;
  if (!expected || request.headers.authorization !== `Bearer ${expected}`) return response.status(401).json({ error: 'Invalid integration token.' });
  try {
    const body = request.body || {};
    const organisationId = clean(body.organisationId, 80);
    const sourceId = clean(body.sourceId, 120);
    if (!organisationId || !sourceId || !clean(body.customerName) || !clean(body.summary)) return response.status(422).json({ error: 'organisationId, sourceId, customerName and summary are required.' });
    const supabase = supabaseAdmin();
    const payload = {
      organisation_id: organisationId,
      source_id: sourceId,
      customer_name: clean(body.customerName, 160), phone: clean(body.phone, 50) || null, email: clean(body.email, 180) || null,
      postcode: clean(body.postcode, 20) || null, service: clean(body.service, 100) || null, summary: clean(body.summary, 300), description: clean(body.description, 2000) || null,
      priority: clean(body.priority, 30) || 'routine', status: clean(body.status, 30) || 'new', booking_status: clean(body.bookingStatus, 40) || 'requested',
      appointment_date: /^\d{4}-\d{2}-\d{2}$/.test(body.appointmentDate || '') ? body.appointmentDate : null, appointment_window: clean(body.appointmentWindow, 80) || null,
      portal_url: clean(body.portalUrl, 1000) || null, photos: asPhotos(body.photos), source: clean(body.source, 60) || 'website-form'
    };
    const { data, error } = await supabase.from('service_leads').upsert(payload, { onConflict: 'organisation_id,source_id' }).select('*').single();
    if (error) throw error;
    return response.status(200).json({ item: data });
  } catch (error) { return handleApiError(response, error); }
}
