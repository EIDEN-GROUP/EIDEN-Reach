alter table public.profiles add column email text;
update public.profiles p set email = u.email
from auth.users u where u.id = p.id and p.email is distinct from u.email;
create unique index profiles_email_unique on public.profiles (lower(email)) where email is not null;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''), new.email)
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    updated_at = now();
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.handle_new_auth_user();

create or replace function public.admin_add_org_member(
  target_organization uuid,
  acting_user uuid,
  target_user uuid,
  target_role public.member_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role public.member_role;
begin
  select m.role into acting_role
  from public.memberships m
  where m.organization_id = target_organization and m.user_id = acting_user;

  if acting_role is null or acting_role not in ('super_admin', 'sales_manager') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if target_role in ('super_admin', 'sales_manager') and acting_role <> 'super_admin' then
    raise exception 'Only a super administrator can assign administrator roles' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (target_organization, target_user, target_role);

  insert into public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, result)
  values (target_organization, acting_user, 'membership.created', 'membership', target_user::text, 'success');
end;
$$;
revoke all on function public.admin_add_org_member(uuid, uuid, uuid, public.member_role) from public, anon, authenticated;
grant execute on function public.admin_add_org_member(uuid, uuid, uuid, public.member_role) to service_role;

create table public.team_invite_rate_limits (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  utc_day date not null,
  attempts integer not null check (attempts between 1 and 20),
  primary key (organization_id, actor_id, utc_day)
);
alter table public.team_invite_rate_limits enable row level security;
revoke all on public.team_invite_rate_limits from public, anon, authenticated;
grant select, insert, update on public.team_invite_rate_limits to service_role;

create or replace function public.admin_reserve_team_invite(target_organization uuid, acting_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  reservation_count integer;
begin
  select m.role into actor_role from public.memberships m
  where m.organization_id = target_organization and m.user_id = acting_user;
  if actor_role is null or actor_role not in ('super_admin', 'sales_manager') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  delete from public.team_invite_rate_limits r
  where r.organization_id = target_organization and r.utc_day < (now() at time zone 'utc')::date - 30;
  insert into public.team_invite_rate_limits (organization_id, actor_id, utc_day, attempts)
  values (target_organization, acting_user, (now() at time zone 'utc')::date, 1)
  on conflict (organization_id, actor_id, utc_day) do update
    set attempts = public.team_invite_rate_limits.attempts + 1
    where public.team_invite_rate_limits.attempts < 20
  returning attempts into reservation_count;
  return reservation_count is not null;
end;
$$;
revoke all on function public.admin_reserve_team_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_reserve_team_invite(uuid, uuid) to service_role;
