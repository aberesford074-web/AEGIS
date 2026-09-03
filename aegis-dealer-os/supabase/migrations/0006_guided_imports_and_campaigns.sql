-- AEGIS Dealer OS: professional campaign operations and contact permissions.

alter table contacts
  add column if not exists email_marketing_status text not null default 'unknown'
    check (email_marketing_status in ('unknown', 'subscribed', 'unsubscribed')),
  add column if not exists email_marketing_updated_at timestamptz;

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed')),
  audience_filter jsonb not null default '{"marketingStatus":"subscribed"}'::jsonb,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  email text not null,
  name text,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'suppressed')),
  gmail_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create index if not exists email_campaigns_due_idx
  on email_campaigns(status, scheduled_at)
  where status in ('scheduled', 'sending');
create index if not exists email_campaigns_org_updated_idx
  on email_campaigns(organisation_id, updated_at desc);
create index if not exists email_campaign_recipients_queue_idx
  on email_campaign_recipients(campaign_id, status, created_at);
create index if not exists contacts_marketing_status_idx
  on contacts(organisation_id, email_marketing_status)
  where email is not null;

drop trigger if exists email_campaigns_set_updated_at on email_campaigns;
create trigger email_campaigns_set_updated_at before update on email_campaigns
for each row execute function set_updated_at();
drop trigger if exists email_campaign_recipients_set_updated_at on email_campaign_recipients;
create trigger email_campaign_recipients_set_updated_at before update on email_campaign_recipients
for each row execute function set_updated_at();

alter table email_campaigns enable row level security;
alter table email_campaign_recipients enable row level security;
