-- AEGIS Dealer OS: tenant-safe WhatsApp inbox and agent channel.
-- Credentials remain encrypted inside integration_connections.configuration;
-- these tables contain only routing, conversation and delivery records.

create table if not exists whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  integration_connection_id uuid not null references integration_connections(id) on delete cascade,
  whatsapp_user_id text not null,
  phone_number text,
  display_name text,
  participant_type text not null default 'unpaired'
    check (participant_type in ('unpaired', 'staff', 'customer')),
  linked_clerk_user_id text,
  customer_id uuid references customers(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'waiting', 'closed', 'blocked')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id, whatsapp_user_id)
);

create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  integration_connection_id uuid not null references integration_connections(id) on delete cascade,
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  provider_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender text,
  recipient text,
  message_type text not null default 'text',
  body text,
  status text not null default 'received'
    check (status in ('received', 'queued', 'processing', 'drafted', 'approved', 'sent', 'delivered', 'read', 'failed', 'blocked')),
  raw_payload jsonb not null default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (integration_connection_id, provider_message_id)
);

create index if not exists whatsapp_conversations_org_last_idx
  on whatsapp_conversations(organisation_id, last_message_at desc nulls last);
create index if not exists whatsapp_conversations_participant_idx
  on whatsapp_conversations(organisation_id, participant_type, status);
create index if not exists whatsapp_messages_conversation_idx
  on whatsapp_messages(conversation_id, created_at desc);
create index if not exists whatsapp_messages_queue_idx
  on whatsapp_messages(organisation_id, status, created_at)
  where status in ('received', 'queued', 'processing', 'approved');

drop trigger if exists whatsapp_conversations_set_updated_at on whatsapp_conversations;
create trigger whatsapp_conversations_set_updated_at before update on whatsapp_conversations
for each row execute function set_updated_at();

drop trigger if exists whatsapp_messages_set_updated_at on whatsapp_messages;
create trigger whatsapp_messages_set_updated_at before update on whatsapp_messages
for each row execute function set_updated_at();

alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;

