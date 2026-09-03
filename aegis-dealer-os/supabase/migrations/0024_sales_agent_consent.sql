-- DealerFoundry: explicit outreach controls for prospect preparation and calls.
-- Unknown prospects may be researched and prepared, but an opted-out prospect
-- must never be queued for outreach. The allowed state is a human decision,
-- not an automatic inference from a phone number.

alter table prospect_companies
  add column if not exists outreach_status text not null default 'unknown',
  add column if not exists consent_source text,
  add column if not exists consent_obtained_at timestamptz,
  add column if not exists opted_out_at timestamptz,
  add column if not exists opt_out_reason text;

alter table prospect_companies drop constraint if exists prospect_companies_outreach_status_check;
alter table prospect_companies add constraint prospect_companies_outreach_status_check
  check (outreach_status in ('unknown', 'allowed', 'opted_out'));

create index if not exists prospect_companies_org_outreach_status_idx
  on prospect_companies(organisation_id, outreach_status, updated_at desc);
