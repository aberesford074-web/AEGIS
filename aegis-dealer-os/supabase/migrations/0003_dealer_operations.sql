-- AEGIS Dealer OS: day-to-day dealer records, website publishing and audit history.

alter table organisations
  add column if not exists public_slug text,
  add column if not exists website_url text,
  add column if not exists updated_at timestamptz not null default now();

update organisations
set public_slug = case
  when lower(name) like '%beresford%' then 'beresford-machinery'
  else trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
end
where public_slug is null;

create unique index if not exists organisations_public_slug_unique
  on organisations(public_slug) where public_slug is not null;

alter table customers
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_email text,
  add column if not exists primary_contact_phone text,
  add column if not exists address text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  first_name text not null,
  last_name text,
  job_title text,
  email text,
  phone text,
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table machines
  add column if not exists status text not null default 'draft',
  add column if not exists condition text,
  add column if not exists location text,
  add column if not exists price numeric,
  add column if not exists currency text not null default 'GBP',
  add column if not exists description text,
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists website_slug text,
  add column if not exists is_published boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  machine_id uuid references machines(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  owner_clerk_user_id text,
  reference text,
  sale_price numeric,
  currency text not null default 'GBP',
  status text not null default 'completed',
  sale_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table integration_connections
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists display_name text;

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  actor_clerk_user_id text,
  event_type text not null,
  record_type text,
  record_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contacts_organisation_idx on contacts(organisation_id);
create index if not exists contacts_customer_idx on contacts(customer_id);
create index if not exists machines_publication_idx on machines(organisation_id, is_published, status);
create index if not exists sales_organisation_date_idx on sales(organisation_id, sale_date desc);
create index if not exists audit_events_organisation_created_idx on audit_events(organisation_id, created_at desc);

drop trigger if exists organisations_set_updated_at on organisations;
create trigger organisations_set_updated_at before update on organisations
for each row execute function set_updated_at();
drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at before update on customers
for each row execute function set_updated_at();
drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at before update on contacts
for each row execute function set_updated_at();
drop trigger if exists machines_set_updated_at on machines;
create trigger machines_set_updated_at before update on machines
for each row execute function set_updated_at();
drop trigger if exists sales_set_updated_at on sales;
create trigger sales_set_updated_at before update on sales
for each row execute function set_updated_at();

alter table contacts enable row level security;
alter table sales enable row level security;
alter table audit_events enable row level security;
