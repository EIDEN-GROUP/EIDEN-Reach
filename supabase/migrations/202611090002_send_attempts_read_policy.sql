-- Let workspace members read send_attempts for their org.
create policy "members read send_attempts"
on public.send_attempts
for select
to authenticated
using (is_org_member(organization_id));
