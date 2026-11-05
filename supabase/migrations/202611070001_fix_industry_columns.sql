-- add missing industry/locale columns on sequences
alter table public.sequences add column if not exists language text;
alter table public.sequences add column if not exists city text;
alter table public.sequences add column if not exists country text;
alter table public.sequences add column if not exists industry text;
alter table public.sequence_templates add column if not exists language text;
alter table public.sequence_templates add column if not exists city text;
alter table public.sequence_templates add column if not exists country text;
alter table public.sequence_templates add column if not exists industry text;
