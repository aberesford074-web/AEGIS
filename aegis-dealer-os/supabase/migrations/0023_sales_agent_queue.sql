-- Batch website-audit queue for the DealerFoundry sales agent.
-- Queue preparation is separate from outbound calling so every call still
-- requires a human approval decision.

alter table sales_agent_runs
  add column if not exists job_type text not null default 'call_prep',
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz;

alter table sales_agent_runs
  add constraint sales_agent_runs_job_type_check
  check (job_type in ('call_prep', 'audit_prep'));

create index if not exists sales_agent_audit_queue_idx
  on sales_agent_runs(status, next_attempt_at, created_at)
  where job_type = 'audit_prep' and status in ('queued', 'failed');

create unique index if not exists sales_agent_active_audit_prospect_idx
  on sales_agent_runs(organisation_id, prospect_id)
  where job_type = 'audit_prep' and status in ('queued', 'in_progress', 'ready', 'approved');
