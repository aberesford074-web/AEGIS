-- AEGIS Dealer OS: tenant-safe core record model.
-- Clerk user and organisation identifiers are stored as text; Clerk remains the
-- identity authority, while Supabase remains the operational system of record.

create extension if not exists pgcrypto;

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  clerk_organisation_id text unique not null,
  name text not null,
  public_slug text unique,
  created_at timestamptz not null default now()
);

create table if not exists organisation_memberships (
  organisation_id uuid not null references organisations(id) on delete cascade,
  clerk_user_id text not null,
  role text not null check (role in ('owner', 'manager', 'sales', 'operations', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organisation_id, clerk_user_id)
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  territory text,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  name text not null,
  website text,
  lifecycle_stage text not null default 'prospect',
  source_system text,
  external_id text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (organisation_id, source_system, external_id)
);

create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  branch_id uuid references branches(id) on delete set null,
  serial_number text,
  make text,
  model text,
  machine_type text,
  year integer,
  hours numeric,
  ownership_status text not null default 'stock',
  source_system text,
  external_id text,
  last_signal_at timestamptz,
  created_at timestamptz not null default now(),
  unique nulls not distinct (organisation_id, source_system, external_id)
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  machine_id uuid references machines(id) on delete set null,
  owner_clerk_user_id text,
  title text not null,
  stage text not null default 'new',
  value numeric,
  next_action text,
  next_action_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  machine_id uuid references machines(id) on delete cascade,
  actor_clerk_user_id text,
  activity_type text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists approval_queue (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  requested_by_clerk_user_id text,
  approved_by_clerk_user_id text,
  action_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz
);

create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  provider_config_key text not null,
  nango_connection_id text not null,
  status text not null default 'active',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id, provider_config_key)
);

create index if not exists customers_organisation_idx on customers(organisation_id);
create index if not exists machines_organisation_idx on machines(organisation_id);
create index if not exists opportunities_organisation_stage_idx on opportunities(organisation_id, stage);
create index if not exists activities_organisation_created_idx on activities(organisation_id, created_at desc);
create index if not exists approvals_organisation_status_idx on approval_queue(organisation_id, status);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists opportunities_set_updated_at on opportunities;
create trigger opportunities_set_updated_at
before update on opportunities
for each row execute function set_updated_at();

-- Supabase Storage stores machine imagery and import files. Files are private by
-- default and should only be served by short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('dealer-media', 'dealer-media', false)
on conflict (id) do nothing;

alter table organisations enable row level security;
alter table organisation_memberships enable row level security;
alter table branches enable row level security;
alter table customers enable row level security;
alter table machines enable row level security;
alter table opportunities enable row level security;
alter table activities enable row level security;
alter table approval_queue enable row level security;
alter table integration_connections enable row level security;

-- API routes use the Supabase service role only after verifying a Clerk JWT and
-- matching its organisation claim. Direct browser access has no permissive RLS
-- policy, so cross-tenant reads are denied by default.
