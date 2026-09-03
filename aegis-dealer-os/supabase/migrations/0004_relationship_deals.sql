-- AEGIS Dealer OS: unified relationships, permanent machine history and two-sided deals.

alter table customers
  add column if not exists relationship_roles text[] not null default array['prospect']::text[];

alter table activities
  add column if not exists contact_id uuid references contacts(id) on delete set null,
  add column if not exists due_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists assigned_to_clerk_user_id text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  reference text,
  deal_type text not null default 'owned_stock'
    check (deal_type in ('owned_stock', 'brokerage', 'consignment', 'sourcing')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  machine_id uuid references machines(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  buyer_customer_id uuid references customers(id) on delete set null,
  buyer_contact_id uuid references contacts(id) on delete set null,
  seller_customer_id uuid references customers(id) on delete set null,
  seller_contact_id uuid references contacts(id) on delete set null,
  salesperson_clerk_user_id text,
  purchase_price numeric,
  sale_price numeric,
  transport_cost numeric not null default 0,
  preparation_cost numeric not null default 0,
  other_costs numeric not null default 0,
  commission numeric not null default 0,
  currency text not null default 'GBP',
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists machine_ownership_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  role text not null check (role in ('seller', 'buyer', 'owner', 'consignor', 'end_user')),
  effective_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

insert into deals (
  organisation_id, reference, deal_type, status, machine_id, opportunity_id,
  buyer_customer_id, buyer_contact_id, salesperson_clerk_user_id, sale_price,
  currency, completed_at, notes, created_at, updated_at
)
select
  organisation_id, reference, 'owned_stock', 'completed', machine_id, opportunity_id,
  customer_id, contact_id, owner_clerk_user_id, sale_price,
  currency, sale_date::timestamptz, notes, created_at, updated_at
from sales
where not exists (
  select 1 from deals
  where deals.organisation_id = sales.organisation_id
    and deals.reference is not distinct from sales.reference
    and deals.machine_id is not distinct from sales.machine_id
);

alter table activities add column if not exists deal_id uuid references deals(id) on delete cascade;

create index if not exists customers_relationship_roles_idx on customers using gin(relationship_roles);
create index if not exists deals_organisation_updated_idx on deals(organisation_id, updated_at desc);
create index if not exists deals_machine_idx on deals(machine_id);
create index if not exists deals_buyer_idx on deals(buyer_customer_id);
create index if not exists deals_seller_idx on deals(seller_customer_id);
create index if not exists ownership_machine_date_idx on machine_ownership_events(machine_id, effective_at desc);
create index if not exists activities_due_idx on activities(organisation_id, due_at) where completed_at is null;

drop trigger if exists deals_set_updated_at on deals;
create trigger deals_set_updated_at before update on deals
for each row execute function set_updated_at();
drop trigger if exists activities_set_updated_at on activities;
create trigger activities_set_updated_at before update on activities
for each row execute function set_updated_at();

alter table deals enable row level security;
alter table machine_ownership_events enable row level security;
