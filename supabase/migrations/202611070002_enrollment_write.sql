-- Enable authenticated enrollment write paths (frontend modal + per-enrollment controls).
grant insert, update, delete on public.sequence_enrollments to authenticated;
grant insert, update on public.enrollment_step_states to authenticated;

drop policy if exists "members insert enrollments" on public.sequence_enrollments;
drop policy if exists "owners and managers update enrollments" on public.sequence_enrollments;
drop policy if exists "members read enrollments" on public.sequence_enrollments;

create policy "members read enrollments" on public.sequence_enrollments for select to authenticated using (public.is_org_member(organization_id));
create policy "members insert enrollments" on public.sequence_enrollments for insert to authenticated with check (
  public.is_org_member(organization_id)
  and (owner_id is null or owner_id = (select auth.uid()))
);
create policy "owners and managers update enrollments" on public.sequence_enrollments for update to authenticated using (
  public.is_org_member(organization_id)
  and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin','sales_manager']::public.member_role[]))
) with check (
  public.is_org_member(organization_id)
  and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin','sales_manager']::public.member_role[]))
);
