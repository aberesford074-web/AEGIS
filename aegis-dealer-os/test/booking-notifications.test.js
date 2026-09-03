import assert from 'node:assert/strict';
import test from 'node:test';

import { bookingCalendar } from '../lib/booking-notifications.js';

test('bookingCalendar produces a portable UTC invitation', () => {
  const calendar = bookingCalendar({
    id: '26eec3e2-bdef-4b2d-a63a-640651db5781',
    business_name: 'Example, Machinery',
    contact_name: 'Alex Example',
    contact_email: 'alex@example.com',
    contact_phone: '01234 567890',
    current_website_url: 'https://example.com',
    notes: 'Discuss stock; then website.',
    starts_at: '2026-09-01T09:00:00.000Z',
    ends_at: '2026-09-01T09:30:00.000Z'
  });
  const unfolded = calendar.replace(/\r\n /g, '');
  assert.match(unfolded, /BEGIN:VCALENDAR/);
  assert.match(unfolded, /DTSTART:20260901T090000Z/);
  assert.match(unfolded, /DTEND:20260901T093000Z/);
  assert.match(unfolded, /Example\\, Machinery/);
  assert.match(unfolded, /Discuss stock\\; then website\./);
  assert.match(unfolded, /ATTENDEE;CN=Alex Example;RSVP=TRUE:mailto:alex@example\.com/);
});
