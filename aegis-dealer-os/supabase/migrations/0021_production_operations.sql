-- DealerFoundry production operations: structured specifications, durable
-- publishing, reservations, notification preferences and marketplace state.

alter table public.machines
  add column if not exists specifications jsonb not null default '{}'::jsonb,
  add column if not exists specification_template_version integer not null default 1,
  add column if not exists publishing_status text not null default 'not_published'
    check (publishing_status in ('not_published', 'queued', 'publishing', 'published', 'failed')),
  add column if not exists publishing_last_error text,
  add column if not exists publishing_last_succeeded_at timestamptz;

create index if not exists machines_specifications_gin_idx on public.machines using gin(specifications);
create index if not exists machines_publishing_status_idx on public.machines(organisation_id, publishing_status, updated_at desc);

create table if not exists public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  channel text not null default 'website',
  operation text not null check (operation in ('publish', 'update', 'unpublish')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead_letter')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists publishing_jobs_due_idx on public.publishing_jobs(status, next_attempt_at);
create index if not exists publishing_jobs_org_machine_idx on public.publishing_jobs(organisation_id, machine_id, created_at desc);
drop trigger if exists publishing_jobs_set_updated_at on public.publishing_jobs;
create trigger publishing_jobs_set_updated_at before update on public.publishing_jobs
for each row execute function public.set_updated_at();

create table if not exists public.machine_reservations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null,
  notes text,
  deposit_amount numeric not null default 0 check (deposit_amount >= 0),
  currency text not null default 'GBP',
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'expired')),
  expires_at timestamptz,
  created_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists machine_one_active_reservation_idx
  on public.machine_reservations(machine_id) where status = 'active';
create index if not exists machine_reservations_expiry_idx
  on public.machine_reservations(status, expires_at) where status = 'active';
drop trigger if exists machine_reservations_set_updated_at on public.machine_reservations;
create trigger machine_reservations_set_updated_at before update on public.machine_reservations
for each row execute function public.set_updated_at();

create table if not exists public.marketplace_publications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  provider_config_key text not null,
  external_listing_id text,
  status text not null default 'not_connected' check (status in ('not_connected', 'queued', 'live', 'paused', 'failed')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, machine_id, provider_config_key)
);

drop trigger if exists marketplace_publications_set_updated_at on public.marketplace_publications;
create trigger marketplace_publications_set_updated_at before update on public.marketplace_publications
for each row execute function public.set_updated_at();

create table if not exists public.notification_preferences (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  publishing_failures boolean not null default true,
  reservation_expiry boolean not null default true,
  stock_matches boolean not null default true,
  task_reminders boolean not null default true,
  recipient_emails jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.organisations
  add column if not exists onboarding_state jsonb not null default '{"business":false,"branding":false,"website":false,"stock":false,"team":false,"launch":false}'::jsonb,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.sales_proposals
  add column if not exists pdf_generated_at timestamptz,
  add column if not exists pdf_snapshot jsonb;

alter table public.publishing_jobs enable row level security;
alter table public.machine_reservations enable row level security;
alter table public.marketplace_publications enable row level security;
alter table public.notification_preferences enable row level security;
