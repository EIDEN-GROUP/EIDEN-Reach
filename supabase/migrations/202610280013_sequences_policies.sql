-- Sequences: allow organization members to create/manage sequences, versions and steps.

create policy "members insert sequences" on public.sequences
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

create policy "owners and managers update sequences" on public.sequences
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  )
  with check (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

create policy "owners and managers delete sequences" on public.sequences
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))
  );

create policy "members insert sequence versions" on public.sequence_versions
  for insert to authenticated
  with check (
    exists (select 1 from public.sequences s where s.id = sequence_id and public.is_org_member(s.organization_id))
    and (created_by is null or created_by = (select auth.uid()))
  );

create policy "members insert sequence steps" on public.sequence_steps
  for insert to authenticated
  with check (
    exists (select 1 from public.sequences s where s.id = sequence_id and public.is_org_member(s.organization_id))
  );

create policy "members update sequence steps" on public.sequence_steps
  for update to authenticated
  using (
    exists (select 1 from public.sequences s where s.id = sequence_id and public.is_org_member(s.organization_id))
  )
  with check (
    exists (select 1 from public.sequences s where s.id = sequence_id and public.is_org_member(s.organization_id))
  );

create policy "members delete sequence steps" on public.sequence_steps
  for delete to authenticated
  using (
    exists (select 1 from public.sequences s where s.id = sequence_id and public.is_org_member(s.organization_id))
  );

grant insert, update, delete on public.sequences to authenticated;
grant insert on public.sequence_versions to authenticated;
grant insert, update, delete on public.sequence_steps to authenticated;
