-- AEGIS Dealer OS: tenant-scoped automation engine and operator notifications.

create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('daily_brief', 'stale_follow_up', 'stock_match', 'email_monitor', 'marketplace_monitor')),
  enabled boolean not null default true,
  cadence_minutes integer not null default 1440 check (cadence_minutes >= 15),
  configuration jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, kind, name)
);

create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  automation_rule_id uuid not null references automation_rules(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped')),
  summary text,
  result jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'urgent')),
  related_record_type text,
  related_record_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists automation_rules_due_idx
  on automation_rules(enabled, next_run_at);
create index if not exists automation_runs_organisation_started_idx
  on automation_runs(organisation_id, started_at desc);
create index if not exists notifications_organisation_created_idx
  on notifications(organisation_id, created_at desc);

drop trigger if exists automation_rules_set_updated_at on automation_rules;
create trigger automation_rules_set_updated_at
before update on automation_rules
for each row execute function set_updated_at();

alter table automation_rules enable row level security;
alter table automation_runs enable row level security;
alter table notifications enable row level security;

