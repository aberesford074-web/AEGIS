-- AEGIS client onboarding control plane. These fields describe what has
-- actually been completed; a portal is not marked live merely because its
-- organisation row exists.

alter table organisations
  add column if not exists invitation_id text,
  add column if not exists invitation_status text not null default 'not_sent'
    check (invitation_status in ('not_sent', 'pending', 'accepted', 'revoked', 'failed')),
  add column if not exists invitation_sent_at timestamptz,
  add column if not exists invitation_accepted_at timestamptz,
  add column if not exists invitation_last_error text,
  add column if not exists website_connection_type text not null default 'none'
    check (website_connection_type in ('aegis_built', 'wordpress', 'custom', 'stock_feed', 'none')),
  add column if not exists website_connection_status text not null default 'not_started'
    check (website_connection_status in ('not_started', 'awaiting_access', 'connected', 'failed')),
  add column if not exists website_last_checked_at timestamptz,
  add column if not exists website_last_error text,
  add column if not exists portal_activated_at timestamptz;

create index if not exists organisations_invitation_status_idx
  on organisations(invitation_status, updated_at desc);

create index if not exists organisations_website_connection_status_idx
  on organisations(website_connection_status, updated_at desc);

