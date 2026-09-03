-- A paid public signup is stored before any dealer workspace is created.
-- Stripe Checkout metadata carries the opaque intent id; the signed webhook is
-- the only path allowed to turn an intent into an organisation and invitation.

create table if not exists public_signup_intents (
  id uuid primary key,
  plan_key text not null check (plan_key in ('website_stock', 'dealer_operations')),
  business_name text not null,
  owner_email text not null,
  stock_size text,
  status text not null default 'checkout_created'
    check (status in ('checkout_created', 'provisioning', 'provisioned', 'failed', 'expired')),
  stripe_customer_id text unique,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  organisation_id uuid references organisations(id) on delete set null,
  failure_reason text,
  provisioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_signup_intents_status_idx
  on public_signup_intents(status, updated_at desc);

drop trigger if exists public_signup_intents_set_updated_at on public_signup_intents;
create trigger public_signup_intents_set_updated_at before update on public_signup_intents
for each row execute function set_updated_at();

alter table public_signup_intents enable row level security;
