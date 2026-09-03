-- DealerFoundry: approval-first outbound sales agent preparation.
-- Call briefs are generated from public prospect evidence, but outbound calls
-- remain explicitly queued and human-approved until a compliant telephony
-- provider is connected.

create table if not exists sales_agent_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  prospect_id uuid not null references prospect_companies(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'approved', 'queued', 'in_progress', 'completed', 'cancelled', 'failed')),
  website_url text,
  website_audit jsonb not null default '{}'::jsonb,
  call_brief jsonb not null default '{}'::jsonb,
  provider text,
  provider_call_id text,
  outcome text,
  transcript text,
  appointment_id uuid references website_consultations(id) on delete set null,
  approved_by_clerk_user_id text,
  approved_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  last_error text,
  created_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_agent_runs_org_updated_idx
  on sales_agent_runs(organisation_id, updated_at desc);
create index if not exists sales_agent_runs_prospect_idx
  on sales_agent_runs(organisation_id, prospect_id, created_at desc);

drop trigger if exists sales_agent_runs_set_updated_at on sales_agent_runs;
create trigger sales_agent_runs_set_updated_at before update on sales_agent_runs
for each row execute function set_updated_at();

alter table sales_agent_runs enable row level security;
