import { refreshGmailCredentials, sealGmailCredentials, sendGmailMessage, unsealGmailCredentials } from './google-gmail.js';

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_OWNER_EMAIL = 'aarondrummer70@gmail.com';

function escapeICal(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function calendarTimestamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function foldLine(line) {
  const chunks = [];
  let remaining = line;
  while (Buffer.byteLength(remaining, 'utf8') > 73) {
    let length = Math.min(remaining.length, 73);
    while (Buffer.byteLength(remaining.slice(0, length), 'utf8') > 73) length -= 1;
    chunks.push(remaining.slice(0, length));
    remaining = remaining.slice(length);
  }
  chunks.push(remaining);
  return chunks.join('\r\n ');
}

export function bookingCalendar(booking) {
  const ownerEmail = process.env.BOOKING_OWNER_EMAIL?.trim() || DEFAULT_OWNER_EMAIL;
  const description = [
    `Website consultation for ${booking.business_name}.`,
    booking.current_website_url ? `Current website: ${booking.current_website_url}` : null,
    booking.contact_phone ? `Phone: ${booking.contact_phone}` : null,
    booking.notes ? `Notes: ${booking.notes}` : null
  ].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DealerFoundry//Website Consultation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${escapeICal(booking.id)}@dealerfoundry`,
    `DTSTAMP:${calendarTimestamp(new Date())}`,
    `DTSTART:${calendarTimestamp(booking.starts_at)}`,
    `DTEND:${calendarTimestamp(booking.ends_at)}`,
    'SUMMARY:DealerFoundry website consultation',
    `DESCRIPTION:${escapeICal(description)}`,
    'LOCATION:Video or phone call',
    `ORGANIZER;CN=DealerFoundry:mailto:${escapeICal(ownerEmail)}`,
    `ATTENDEE;CN=${escapeICal(booking.contact_name)};RSVP=TRUE:mailto:${escapeICal(booking.contact_email)}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

function ukDateTime(value) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date(value));
}

function htmlEscape(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

async function sendEmail({ to, subject, html, calendar, idempotencyKey }) {
  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      from: process.env.BOOKING_FROM_EMAIL,
      to: [to],
      subject,
      html,
      attachments: [{
        filename: 'dealerfoundry-website-consultation.ics',
        content: Buffer.from(calendar, 'utf8').toString('base64')
      }]
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) throw new Error(result.message || `Email provider returned ${response.status}.`);
  return result;
}

export async function sendBookingNotifications(supabase, booking) {
  const ownerEmail = process.env.BOOKING_OWNER_EMAIL?.trim() || DEFAULT_OWNER_EMAIL;
  const calendar = bookingCalendar(booking);
  const when = ukDateTime(booking.starts_at);
  const safeName = htmlEscape(booking.contact_name);
  const safeBusiness = htmlEscape(booking.business_name);
  const customerHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717"><h1 style="font-size:24px">Your DealerFoundry consultation is booked</h1><p>Hi ${safeName},</p><p>Your website consultation is confirmed for <strong>${htmlEscape(when)} (UK time)</strong>.</p><p>A calendar invitation is attached. Aaron will use the information you supplied to prepare for the call.</p><p>If you need to change the appointment, reply to this email.</p><p>DealerFoundry</p></div>`;
  const ownerHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717"><h1 style="font-size:24px">New website consultation</h1><p><strong>${safeBusiness}</strong> booked ${htmlEscape(when)} (UK time).</p><p>Contact: ${safeName} · <a href="mailto:${htmlEscape(booking.contact_email)}">${htmlEscape(booking.contact_email)}</a>${booking.contact_phone ? ` · ${htmlEscape(booking.contact_phone)}` : ''}</p>${booking.current_website_url ? `<p>Website: ${htmlEscape(booking.current_website_url)}</p>` : ''}${booking.notes ? `<p>Notes: ${htmlEscape(booking.notes)}</p>` : ''}</div>`;
  let outcomes;
  if (process.env.RESEND_API_KEY?.trim() && process.env.BOOKING_FROM_EMAIL?.trim()) {
    outcomes = await Promise.allSettled([
      sendEmail({
        to: booking.contact_email,
        subject: 'Your DealerFoundry website consultation is booked',
        html: customerHtml,
        calendar,
        idempotencyKey: `booking-${booking.id}-customer`
      }),
      sendEmail({
        to: ownerEmail,
        subject: `New consultation: ${booking.business_name}`,
        html: ownerHtml,
        calendar,
        idempotencyKey: `booking-${booking.id}-owner`
      })
    ]);
  } else {
    const { data: connection, error: connectionError } = await supabase
      .from('platform_integration_connections')
      .select('id,configuration,status')
      .eq('provider_config_key', 'gmail')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (connectionError || !connection?.configuration?.credential) {
      return { configured: false, customerSent: false, ownerSent: false, error: connectionError?.message || null };
    }
    try {
      let credentials = unsealGmailCredentials(connection.configuration.credential);
      if (!credentials.accessToken || credentials.expiresAt < Date.now() + 60_000) {
        credentials = await refreshGmailCredentials(credentials);
        const configuration = { ...connection.configuration, credential: sealGmailCredentials(credentials) };
        const { error: updateError } = await supabase.from('platform_integration_connections').update({ configuration }).eq('id', connection.id);
        if (updateError) throw updateError;
      }
      const customerBody = `Hi ${booking.contact_name},\n\nYour DealerFoundry website consultation is confirmed for ${when} (UK time).\n\nA calendar invitation is attached. Aaron will use the information you supplied to prepare for the call.\n\nIf you need to change the appointment, reply to this email.\n\nDealerFoundry`;
      const ownerBody = `New DealerFoundry website consultation\n\n${booking.business_name} booked ${when} (UK time).\n\nContact: ${booking.contact_name}\nEmail: ${booking.contact_email}${booking.contact_phone ? `\nPhone: ${booking.contact_phone}` : ''}${booking.current_website_url ? `\nWebsite: ${booking.current_website_url}` : ''}${booking.notes ? `\nNotes: ${booking.notes}` : ''}`;
      outcomes = await Promise.allSettled([
        sendGmailMessage(credentials.accessToken, {
          to: booking.contact_email,
          subject: 'Your DealerFoundry website consultation is booked',
          body: customerBody,
          calendar
        }),
        sendGmailMessage(credentials.accessToken, {
          to: ownerEmail,
          subject: `New consultation: ${booking.business_name}`,
          body: ownerBody,
          calendar
        })
      ]);
    } catch (error) {
      const message = error.message || 'Gmail delivery failed.';
      if (error.statusCode === 401 || /expired|revoked|invalid_grant/i.test(message)) {
        const { error: statusError } = await supabase
          .from('platform_integration_connections')
          .update({ status: 'reauthorisation_required' })
          .eq('id', connection.id);
        if (statusError) console.error('Gmail reconnection status could not be stored.', statusError.message);
        return { configured: true, customerSent: false, ownerSent: false, error: 'The booking Gmail account must be reconnected.' };
      }
      return { configured: true, customerSent: false, ownerSent: false, error: message };
    }
  }
  const errors = outcomes.filter((item) => item.status === 'rejected').map((item) => item.reason?.message || 'Email delivery failed.');
  return {
    configured: true,
    customerSent: outcomes[0].status === 'fulfilled',
    ownerSent: outcomes[1].status === 'fulfilled',
    error: errors.length ? errors.join(' ') : null
  };
}
