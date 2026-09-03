-- AEGIS Dealer OS: organisation-scoped knowledge projection for the business agent.
-- Every current business table is mirrored here, and future modules can either add
-- the same trigger or write flexible records to business_records.

create table if not exists business_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  record_type text not null,
  title text not null,
  summary text,
  status text,
  source text not null default 'manual',
  data jsonb not null default '{}'::jsonb,
  relationships jsonb not null default '{}'::jsonb,
  created_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists business_knowledge (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  entity_type text not null,
  source_table text not null,
  source_record_id text not null,
  title text not null,
  searchable_text text not null default '',
  content jsonb not null default '{}'::jsonb,
  relationships jsonb not null default '{}'::jsonb,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, source_table, source_record_id)
);

create index if not exists business_records_org_type_idx
  on business_records(organisation_id, record_type, updated_at desc);
create index if not exists business_knowledge_org_type_idx
  on business_knowledge(organisation_id, entity_type, updated_at desc);
create index if not exists business_knowledge_search_idx
  on business_knowledge using gin(to_tsvector('simple', searchable_text));
create index if not exists business_knowledge_content_idx
  on business_knowledge using gin(content);

create or replace function upsert_business_knowledge_row(
  entity_name text,
  table_name text,
  row_data jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  record_id text;
  record_title text;
  relation_data jsonb;
  event_time timestamptz;
begin
  -- The knowledge projection must never contain credentials or provider tokens,
  -- even though the server-side source tables may hold encrypted connection data.
  row_data := row_data - array[
    'access_token', 'refresh_token', 'client_secret', 'credentials_ciphertext',
    'oauth_state', 'secret', 'token'
  ];
  if jsonb_typeof(row_data->'configuration') = 'object' then
    row_data := jsonb_set(row_data, '{configuration}', (row_data->'configuration') - array[
      'credential', 'access_token', 'refresh_token', 'client_secret',
      'credentials_ciphertext', 'oauth_state', 'secret', 'token'
    ]);
  end if;
  if jsonb_typeof(row_data->'data') = 'object' then
    row_data := jsonb_set(row_data, '{data}', (row_data->'data') - array[
      'credential', 'access_token', 'refresh_token', 'client_secret',
      'credentials_ciphertext', 'oauth_state', 'secret', 'token'
    ]);
  end if;
  if table_name = 'business_records' then
    entity_name := coalesce(nullif(row_data->>'record_type', ''), entity_name);
  end if;
  org_id := nullif(row_data->>'organisation_id', '')::uuid;
  record_id := row_data->>'id';
  if org_id is null or record_id is null then return; end if;

  record_title := coalesce(
    nullif(row_data->>'title', ''), nullif(row_data->>'name', ''),
    nullif(row_data->>'reference', ''), nullif(row_data->>'subject', ''),
    nullif(concat_ws(' ', row_data->>'first_name', row_data->>'last_name'), ''),
    nullif(concat_ws(' ', row_data->>'make', row_data->>'model'), ''),
    initcap(replace(entity_name, '_', ' '))
  );
  event_time := coalesce(
    nullif(row_data->>'updated_at', '')::timestamptz,
    nullif(row_data->>'created_at', '')::timestamptz,
    now()
  );
  relation_data := jsonb_strip_nulls(jsonb_build_object(
    'customer_id', row_data->'customer_id',
    'contact_id', row_data->'contact_id',
    'machine_id', row_data->'machine_id',
    'deal_id', row_data->'deal_id',
    'opportunity_id', row_data->'opportunity_id',
    'buyer_customer_id', row_data->'buyer_customer_id',
    'seller_customer_id', row_data->'seller_customer_id',
    'campaign_id', row_data->'campaign_id'
  ));

  insert into business_knowledge (
    organisation_id, entity_type, source_table, source_record_id, title,
    searchable_text, content, relationships, occurred_at, updated_at
  ) values (
    org_id, entity_name, table_name, record_id, record_title,
    regexp_replace(row_data::text, '[{}""\[\],:]+', ' ', 'g'),
    row_data, relation_data, event_time, now()
  )
  on conflict (organisation_id, source_table, source_record_id) do update set
    entity_type = excluded.entity_type,
    title = excluded.title,
    searchable_text = excluded.searchable_text,
    content = excluded.content,
    relationships = excluded.relationships,
    occurred_at = excluded.occurred_at,
    updated_at = now();
end;
$$;

create or replace function sync_business_knowledge()
returns trigger language plpgsql security definer set search_path = public as $$
declare row_data jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_op = 'DELETE' then
    delete from business_knowledge
      where organisation_id = nullif(row_data->>'organisation_id', '')::uuid
        and source_table = tg_table_name
        and source_record_id = row_data->>'id';
    return old;
  end if;
  perform upsert_business_knowledge_row(tg_argv[0], tg_table_name, row_data);
  return new;
end;
$$;

do $$
declare item record;
begin
  for item in select * from (values
    ('branches', 'branch'), ('customers', 'company'), ('contacts', 'contact'),
    ('machines', 'machine'),
    ('opportunities', 'opportunity'), ('activities', 'activity'), ('sales', 'sale'),
    ('deals', 'deal'), ('machine_ownership_events', 'machine_ownership'),
    ('approval_queue', 'approval'), ('integration_connections', 'connection'),
    ('automation_rules', 'automation'), ('automation_runs', 'automation_run'),
    ('notifications', 'notification'), ('email_campaigns', 'campaign'),
    ('email_campaign_recipients', 'campaign_recipient'), ('audit_events', 'audit_event'),
    ('business_records', 'business_record')
  ) as configured(table_name, entity_name)
  loop
    if to_regclass('public.' || item.table_name) is not null then
      execute format('drop trigger if exists %I on %I', item.table_name || '_knowledge_sync', item.table_name);
      execute format(
        'create trigger %I after insert or update or delete on %I for each row execute function sync_business_knowledge(%L)',
        item.table_name || '_knowledge_sync', item.table_name, item.entity_name
      );
      execute format(
        'select upsert_business_knowledge_row(%L, %L, to_jsonb(source_row)) from %I source_row',
        item.entity_name, item.table_name, item.table_name
      );
    end if;
  end loop;
end;
$$;

drop trigger if exists business_records_set_updated_at on business_records;
create trigger business_records_set_updated_at before update on business_records
for each row execute function set_updated_at();

alter table business_records enable row level security;
alter table business_knowledge enable row level security;
