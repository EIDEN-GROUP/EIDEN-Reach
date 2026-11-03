-- Email templates: allow organization members to create/manage templates.

create policy "members insert templates" on public.email_templates
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

create policy "owners and managers update templates" on public.email_templates
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  )
  with check (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

create policy "owners and managers delete templates" on public.email_templates
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

grant insert, update, delete on public.email_templates to authenticated;
