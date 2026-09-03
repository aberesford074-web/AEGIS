-- Public website consultation bookings shown in the platform Command Centre.

create table if not exists website_consultations (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  current_website_url text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Europe/London',
  status text not null default 'confirmed'
    check (status in ('confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null default 'dealerfoundry_website',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists website_consultations_starts_at_idx
  on website_consultations(starts_at asc);

create index if not exists website_consultations_status_idx
  on website_consultations(status, starts_at asc);

drop trigger if exists website_consultations_set_updated_at on website_consultations;
create trigger website_consultations_set_updated_at before update on website_consultations
for each row execute function set_updated_at();

alter table website_consultations enable row level security;
