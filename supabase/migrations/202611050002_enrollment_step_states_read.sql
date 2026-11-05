create policy "members read enrollment step states" on public.enrollment_step_states for select to authenticated using (enrollment_id in (select id from public.sequence_enrollments where public.is_org_member(organization_id)));
grant select on public.enrollment_step_states to authenticated;
