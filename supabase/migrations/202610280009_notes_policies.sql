-- Contextual notes: allow organization members to create notes and manage their own
-- (or, for managers, any note in the workspace). RLS remains the authority.

create policy "members insert notes" on public.notes
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and (author_id is null or author_id = (select auth.uid()))
  );

create policy "authors and managers update notes" on public.notes
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (author_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  )
  with check (
    public.is_org_member(organization_id)
    and (author_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

create policy "authors and managers delete notes" on public.notes
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and (author_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

grant insert, update, delete on public.notes to authenticated;
