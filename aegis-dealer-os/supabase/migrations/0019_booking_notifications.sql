alter table public.website_consultations
  add column if not exists customer_confirmation_sent_at timestamptz,
  add column if not exists owner_notification_sent_at timestamptz,
  add column if not exists notification_error text;
