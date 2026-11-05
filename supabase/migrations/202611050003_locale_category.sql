-- Configurable locale + category metadata on person, organization,
-- and sequence records. All fields are optional (nullable).
alter table public.contacts
  add column if not exists language text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists category text;

alter table public.companies
  add column if not exists language text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists category text;

alter table public.sequences
  add column if not exists language text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists category text;

alter table public.sequence_templates
  add column if not exists language text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists category text;

create index if not exists contacts_org_language_idx on public.contacts (organization_id, lower(coalesce(language, '')));
create index if not exists sequences_org_category_idx on public.sequences (organization_id, category) where category is not null;
