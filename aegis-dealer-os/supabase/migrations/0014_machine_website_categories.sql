-- Category chosen by the dealer for the public website catalogue.
alter table machines
  add column if not exists website_category text;

create index if not exists machines_website_category_idx
  on machines(organisation_id, website_category, is_published);
