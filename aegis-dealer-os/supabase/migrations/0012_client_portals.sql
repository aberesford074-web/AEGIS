-- AEGIS control plane: modular client portals managed from the owner's Mac app.

alter table organisations
  add column if not exists portal_status text not null default 'setup'
    check (portal_status in ('setup', 'live', 'paused')),
  add column if not exists portal_tier text not null default 'website_stock'
    check (portal_tier in ('website_stock', 'sales', 'full')),
  add column if not exists enabled_modules jsonb not null
    default '["website", "stock"]'::jsonb,
  add column if not exists client_contact_name text,
  add column if not exists client_contact_email text;

create index if not exists organisations_portal_status_idx
  on organisations(portal_status, updated_at desc);

