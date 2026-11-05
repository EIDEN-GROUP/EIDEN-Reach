-- User-managed industry categories, scoped per organization.
create table if not exists public.industry_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
create index if not exists industry_categories_org_idx on public.industry_categories (organization_id) where archived_at is null;
create unique index if not exists industry_categories_unique_name_idx on public.industry_categories (organization_id, lower(name)) where archived_at is null;

alter table public.industry_categories enable row level security;
drop policy if exists "members read industry categories" on public.industry_categories;
drop policy if exists "managers write industry categories" on public.industry_categories;
create policy "members read industry categories" on public.industry_categories for select to authenticated using (public.is_org_member(organization_id));
create policy "managers write industry categories" on public.industry_categories for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
grant insert, update, delete, select on public.industry_categories to authenticated;

insert into public.industry_categories (organization_id, name, description, created_by)
  select o.id, v.name, v.descr, null
  from public.organizations o
  cross join (values
    ('Technology', 'Software, IT, SaaS'),
    ('Manufacturing', 'Production and physical goods'),
    ('Healthcare', 'Medical, pharma, biotech'),
    ('Finance', 'Banking, fintech, insurance'),
    ('Logistics', 'Trucking, shipping, warehousing'),
    ('Professional Services', 'Consulting, legal, accounting'),
    ('Education', 'Schools, training, e-learning'),
    ('Retail', 'Brick & mortar or e-commerce storefronts'),
    ('Energy', 'Oil, gas, renewables, utilities'),
    ('Real Estate', 'Property management, development'),
    ('Media', 'Publishing, news, entertainment'),
    ('Agriculture', 'Farming, food production')
  ) as v (name, descr)
  where not exists (
    select 1 from public.industry_categories c
    where c.organization_id = o.id and lower(c.name) = lower(v.name)
  );
