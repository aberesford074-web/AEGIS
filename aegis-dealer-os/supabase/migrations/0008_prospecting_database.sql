-- AEGIS Dealer OS: spreadsheet-style prospecting lists for companies to call.

create table if not exists prospect_lists (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  created_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table if not exists prospect_companies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  list_id uuid not null references prospect_lists(id) on delete cascade,
  company text not null,
  title text generated always as (company) stored,
  company_key text not null,
  phone text,
  postcode text,
  address text,
  email text,
  spoke_to text,
  contact_name text,
  notes text,
  website text,
  linkedin_url text,
  source_url text,
  confidence text,
  status text not null default 'not_contacted'
    check (status in ('not_contacted', 'attempted', 'contacted', 'follow_up', 'qualified', 'not_interested')),
  next_action_at timestamptz,
  last_contacted_at timestamptz,
  owner_clerk_user_id text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, list_id, company_key)
);

create index if not exists prospect_lists_org_position_idx
  on prospect_lists(organisation_id, position, created_at);
create index if not exists prospect_companies_org_list_idx
  on prospect_companies(organisation_id, list_id, updated_at desc);
create index if not exists prospect_companies_org_status_idx
  on prospect_companies(organisation_id, status, next_action_at);
create index if not exists prospect_companies_search_idx
  on prospect_companies using gin(to_tsvector('simple',
    coalesce(company, '') || ' ' || coalesce(phone, '') || ' ' ||
    coalesce(postcode, '') || ' ' || coalesce(email, '') || ' ' ||
    coalesce(contact_name, '') || ' ' || coalesce(notes, '')
  ));

drop trigger if exists prospect_lists_set_updated_at on prospect_lists;
create trigger prospect_lists_set_updated_at before update on prospect_lists
for each row execute function set_updated_at();

drop trigger if exists prospect_companies_set_updated_at on prospect_companies;
create trigger prospect_companies_set_updated_at before update on prospect_companies
for each row execute function set_updated_at();

drop trigger if exists prospect_lists_knowledge_sync on prospect_lists;
create trigger prospect_lists_knowledge_sync after insert or update or delete on prospect_lists
for each row execute function sync_business_knowledge('prospect_list');

drop trigger if exists prospect_companies_knowledge_sync on prospect_companies;
create trigger prospect_companies_knowledge_sync after insert or update or delete on prospect_companies
for each row execute function sync_business_knowledge('prospect_company');

alter table prospect_lists enable row level security;
alter table prospect_companies enable row level security;
