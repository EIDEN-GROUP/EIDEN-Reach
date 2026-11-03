-- Bootstrap the first organization and administrator.
-- 1. Invite your first user in Supabase Dashboard -> Authentication -> Users (or via Auth API).
-- 2. Replace USER_UUID below with that user's auth.users.id.
-- 3. Run this in the Supabase SQL Editor (service role) once.

-- Insert profile display name (optional).
-- update public.profiles set display_name = 'Workspace Admin' where id = 'USER_UUID';

insert into public.organizations (id, name)
values ('11111111-1111-4111-8111-111111111111', 'EIDEN Reach Workspace')
on conflict (id) do nothing;

insert into public.memberships (organization_id, user_id, role)
values ('11111111-1111-4111-8111-111111111111', 'USER_UUID', 'super_admin')
on conflict (organization_id, user_id) do update set role = 'super_admin';
