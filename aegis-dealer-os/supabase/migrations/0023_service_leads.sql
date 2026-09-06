create table if not exists service_leads (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  source_id text not null,
  customer_name text not null,
  phone text,
  email text,
  postcode text,
  service text,
  summary text not null,
  description text,
  priority text not null default 'routine',
  status text not null default 'new',
  booking_status text not null default 'requested',
  appointment_date date,
  appointment_window text,
  portal_url text,
  photos jsonb not null default '[]'::jsonb,
  source text not null default 'website-form',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, source_id)
);

create index if not exists service_leads_organisation_created_idx on service_leads(organisation_id, created_at desc);
create index if not exists service_leads_organisation_appointment_idx on service_leads(organisation_id, appointment_date);
alter table service_leads enable row level security;

drop trigger if exists service_leads_set_updated_at on service_leads;
create trigger service_leads_set_updated_at before update on service_leads for each row execute function set_updated_at();
