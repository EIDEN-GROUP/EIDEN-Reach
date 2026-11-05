alter table public.contacts add column if not exists industry text;
alter table public.companies add column if not exists language text; -- already added earlier via 202611050003, just guarded
