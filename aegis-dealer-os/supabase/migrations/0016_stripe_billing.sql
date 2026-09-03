-- Stripe billing is an organisation-level control-plane concern. Browser
-- clients have no direct policies; all writes are made by verified webhooks or
-- authenticated platform routes using the Supabase service role.

alter table organisations
  add column if not exists billing_required boolean not null default false;

create table if not exists billing_subscriptions (
  organisation_id uuid primary key references organisations(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  stripe_price_id text,
  status text not null default 'not_started'
    check (status in ('not_started', 'checkout_pending', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')),
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  last_payment_at timestamptz,
  last_payment_failed_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  organisation_id uuid references organisations(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists billing_subscriptions_status_idx
  on billing_subscriptions(status, updated_at desc);

create index if not exists stripe_webhook_events_organisation_idx
  on stripe_webhook_events(organisation_id, received_at desc);

drop trigger if exists billing_subscriptions_set_updated_at on billing_subscriptions;
create trigger billing_subscriptions_set_updated_at before update on billing_subscriptions
for each row execute function set_updated_at();

alter table billing_subscriptions enable row level security;
alter table stripe_webhook_events enable row level security;
