-- AEGIS Dealer OS: machine proposals that bridge an enquiry to a linked deal.

create table if not exists sales_proposals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  machine_id uuid references machines(id) on delete set null,
  proposal_number text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'sent', 'accepted', 'rejected', 'expired')),
  asking_price numeric,
  discount numeric not null default 0,
  transport_price numeric not null default 0,
  preparation_price numeric not null default 0,
  total_price numeric,
  currency text not null default 'GBP',
  valid_until date,
  summary text,
  terms text,
  created_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, proposal_number)
);

create index if not exists sales_proposals_org_updated_idx
  on sales_proposals(organisation_id, updated_at desc);
create index if not exists sales_proposals_opportunity_idx
  on sales_proposals(opportunity_id);

drop trigger if exists sales_proposals_set_updated_at on sales_proposals;
create trigger sales_proposals_set_updated_at before update on sales_proposals
for each row execute function set_updated_at();

drop trigger if exists sales_proposals_knowledge_sync on sales_proposals;
create trigger sales_proposals_knowledge_sync after insert or update or delete on sales_proposals
for each row execute function sync_business_knowledge('proposal');

alter table sales_proposals enable row level security;
