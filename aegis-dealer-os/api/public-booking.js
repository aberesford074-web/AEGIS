import { handleApiError, methodNotAllowed } from '../lib/http.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { bookingCalendar, sendBookingNotifications } from '../lib/booking-notifications.js';
import { enforceRateLimit, requestFingerprint } from '../lib/rate-limit.js';

const BOOKING_TIMEZONE = 'Europe/London';
const SLOT_MINUTES = 30;
const ALLOWED_TIMES = new Set(['10:00', '11:30', '14:00', '15:30']);

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanText(value, name, { min = 2, max = 160, optional = false } = {}) {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  if (!cleaned && optional) return null;
  if (cleaned.length < min || cleaned.length > max) {
    throw httpError(`${name} must be between ${min} and ${max} characters.`);
  }
  return cleaned;
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw httpError('Enter a valid work email address.');
  }
  return email;
}

function slotParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BOOKING_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function validateSlot(value) {
  const startsAt = new Date(String(value || ''));
  if (Number.isNaN(startsAt.getTime())) throw httpError('Choose a valid appointment time.');
  const now = Date.now();
  if (startsAt.getTime() < now + 60 * 60 * 1000) throw httpError('Choose a future appointment time.');
  if (startsAt.getTime() > now + 120 * 24 * 60 * 60 * 1000) throw httpError('Appointments can be booked up to 120 days ahead.');
  const parts = slotParts(startsAt);
  if (['Sat', 'Sun'].includes(parts.weekday) || !ALLOWED_TIMES.has(`${parts.hour}:${parts.minute}`)) {
    throw httpError('Choose one of the available weekday appointment times.');
  }
  return startsAt;
}

async function availability(supabase) {
  const from = new Date();
  const to = new Date(from.getTime() + 120 * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from('website_consultations')
    .select('starts_at')
    .gte('starts_at', from.toISOString())
    .lte('starts_at', to.toISOString())
    .neq('status', 'cancelled');
  if (error) throw error;
  return { timezone: BOOKING_TIMEZONE, durationMinutes: SLOT_MINUTES, unavailable: (data || []).map((item) => item.starts_at) };
}

async function calendarDownload(supabase, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''))) {
    throw httpError('Calendar invitation not found.', 404);
  }
  const { data, error } = await supabase
    .from('website_consultations')
    .select('id,business_name,contact_name,contact_email,contact_phone,current_website_url,notes,starts_at,ends_at,status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status === 'cancelled') throw httpError('Calendar invitation not found.', 404);
  return bookingCalendar(data);
}

async function createBooking(supabase, body) {
  if (String(body?.website || '').trim()) return { accepted: true };
  const startsAt = validateSlot(body?.startsAt);
  const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
  const { data: clashes, error: clashError } = await supabase
    .from('website_consultations')
    .select('id')
    .lt('starts_at', endsAt.toISOString())
    .gt('ends_at', startsAt.toISOString())
    .neq('status', 'cancelled')
    .limit(1);
  if (clashError) throw clashError;
  if (clashes?.length) throw httpError('That time has just been booked. Please choose another slot.', 409);

  const item = {
    business_name: cleanText(body?.businessName, 'Business name', { max: 120 }),
    contact_name: cleanText(body?.contactName, 'Your name', { max: 120 }),
    contact_email: cleanEmail(body?.email),
    contact_phone: cleanText(body?.phone, 'Phone number', { min: 6, max: 40, optional: true }),
    current_website_url: cleanText(body?.currentWebsite, 'Current website', { min: 4, max: 240, optional: true }),
    notes: cleanText(body?.notes, 'Notes', { min: 1, max: 1200, optional: true }),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    timezone: BOOKING_TIMEZONE,
    status: 'confirmed',
    source: 'dealerfoundry_website'
  };
  const { data, error } = await supabase.from('website_consultations').insert(item).select('*').single();
  if (error) throw error;
  const notifications = await sendBookingNotifications(supabase, data);
  const notificationUpdate = {
    customer_confirmation_sent_at: notifications.customerSent ? new Date().toISOString() : null,
    owner_notification_sent_at: notifications.ownerSent ? new Date().toISOString() : null,
    notification_error: notifications.error
  };
  const { error: notificationUpdateError } = await supabase.from('website_consultations').update(notificationUpdate).eq('id', data.id);
  if (notificationUpdateError) console.error('Booking notification status could not be stored.', notificationUpdateError.message);
  return {
    booking: { id: data.id, starts_at: data.starts_at, ends_at: data.ends_at, status: data.status },
    confirmationEmailSent: notifications.customerSent
  };
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
  try {
    const fingerprint = requestFingerprint(request, 'public-booking');
    await enforceRateLimit({
      key: `rate:booking:${request.method}:${fingerprint}`,
      limit: request.method === 'POST' ? 8 : 120,
      windowSeconds: request.method === 'POST' ? 3600 : 900,
      message: 'Too many booking requests. Please wait before trying again.'
    });
    const supabase = supabaseAdmin();
    if (request.method === 'GET' && request.query?.calendar) {
      const calendar = await calendarDownload(supabase, request.query.calendar);
      response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      response.setHeader('Content-Disposition', 'attachment; filename="dealerfoundry-website-consultation.ics"');
      response.setHeader('Cache-Control', 'private, no-store');
      return response.status(200).send(calendar);
    }
    if (request.method === 'GET') return response.status(200).json(await availability(supabase));
    return response.status(201).json(await createBooking(supabase, request.body));
  } catch (error) {
    return handleApiError(response, error);
  }
}
