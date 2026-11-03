-- Contact lists: allow organization members to create/manage lists and memberships.

create policy "members insert contact lists" on public.contact_lists
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

create policy "owners and managers update contact lists" on public.contact_lists
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  )
  with check (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

create policy "owners and managers delete contact lists" on public.contact_lists
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

create policy "members insert list memberships" on public.contact_list_members
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy "members delete list memberships" on public.contact_list_members
  for delete to authenticated
  using (public.is_org_member(organization_id));

grant insert, update, delete on public.contact_lists to authenticated;
grant insert, delete on public.contact_list_members to authenticated;
