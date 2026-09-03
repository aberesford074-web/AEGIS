-- Imported machines are idempotent when their source supplies an external ID.
-- Manual records have neither value and must not collide with each other.
alter table machines
  drop constraint if exists machines_organisation_id_source_system_external_id_key;

create unique index if not exists machines_import_identity_unique
  on machines (organisation_id, source_system, external_id)
  where source_system is not null and external_id is not null;
