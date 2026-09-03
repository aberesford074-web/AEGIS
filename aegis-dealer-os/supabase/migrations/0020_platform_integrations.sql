create table if not exists public.platform_integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider_config_key text not null unique,
  nango_connection_id text,
  display_name text not null,
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'disconnected',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_platform_integration_connections_updated_at on public.platform_integration_connections;
create trigger set_platform_integration_connections_updated_at
before update on public.platform_integration_connections
for each row execute function public.set_updated_at();

alter table public.platform_integration_connections enable row level security;

insert into public.platform_integration_connections (provider_config_key, display_name, status)
values ('gmail', 'DealerFoundry Gmail', 'disconnected')
on conflict (provider_config_key) do nothing;
