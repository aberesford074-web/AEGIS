-- One-time staff phone pairing and completed message state.

alter table whatsapp_messages drop constraint if exists whatsapp_messages_status_check;
alter table whatsapp_messages add constraint whatsapp_messages_status_check
  check (status in ('received', 'queued', 'processing', 'drafted', 'approved', 'sent', 'delivered', 'read', 'completed', 'failed', 'blocked'));

create table if not exists whatsapp_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  integration_connection_id uuid not null references integration_connections(id) on delete cascade,
  clerk_user_id text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_pairing_codes_active_hash_idx
  on whatsapp_pairing_codes(integration_connection_id, code_hash)
  where used_at is null;
create index if not exists whatsapp_pairing_codes_expiry_idx
  on whatsapp_pairing_codes(organisation_id, expires_at)
  where used_at is null;

alter table whatsapp_pairing_codes enable row level security;

