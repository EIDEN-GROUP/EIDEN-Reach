-- Campaigns: allow organization members to create/manage campaigns (sending remains disabled).

create policy "members insert campaigns" on public.campaigns
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

create policy "owners and managers update campaigns" on public.campaigns
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  )
  with check (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

create policy "owners and managers delete campaigns" on public.campaigns
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

grant insert, update, delete on public.campaigns to authenticated;
