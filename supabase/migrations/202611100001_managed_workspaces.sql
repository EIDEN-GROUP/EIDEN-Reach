-- Multi-workspace (managed workspaces) support for agency/whitelabel scenarios.
-- Each invited user gets a brand-new child organization; the parent org's
-- super_admin considers this the root and can manage every child via god-mode
-- functions that verify caller membership in the root.
alter table public.organizations
  add column if not exists parent_organization_id uuid null
    references public.organizations(id) on delete set null;

create index if not exists organizations_parent_organization_id_idx
  on public.organizations(parent_organization_id);
