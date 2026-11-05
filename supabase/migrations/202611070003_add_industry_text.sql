alter table public.campaigns add column if not exists industry text;
create index if not exists campaigns_org_industry_idx on public.campaigns (organization_id, industry) where industry is not null;
