-- AEGIS owner control plane. Platform administrators are deliberately separate
-- from dealer memberships so an operator can manage all portals without
-- appearing inside each dealer's workspace picker.

create table if not exists platform_admins (
  clerk_user_id text primary key,
  role text not null default 'admin'
    check (role in ('owner', 'admin', 'support', 'read_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_admins_set_updated_at on platform_admins;
create trigger platform_admins_set_updated_at before update on platform_admins
for each row execute function set_updated_at();

alter table platform_admins enable row level security;

-- There are intentionally no browser policies. Access is only through the
-- server-side service role after a Clerk session has been verified.
