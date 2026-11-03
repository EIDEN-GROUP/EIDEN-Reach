-- Mailbox credentials are encrypted by the trusted mailbox Worker before
-- persistence. The browser receives mailbox metadata only.
alter table public.mailbox_credential_refs
  add column nonce text not null,
  add column credential_ciphertext text not null,
  add constraint mailbox_credential_nonce_shape check (length(nonce) = 16),
  add constraint mailbox_credential_ciphertext_size check (length(credential_ciphertext) between 24 and 8192);

create table public.mailbox_connection_rate_limits (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  hour_start timestamptz not null,
  attempts integer not null check (attempts between 1 and 10),
  primary key (organization_id, actor_id, hour_start)
);
alter table public.mailbox_connection_rate_limits enable row level security;
revoke all on public.mailbox_connection_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.mailbox_connection_rate_limits to service_role;

create or replace function public.reserve_mailbox_connection_test(target_organization uuid, acting_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  hour_bucket timestamptz := date_trunc('hour', now());
  reserved_attempt integer;
begin
  select m.role into actor_role from public.memberships m
  where m.organization_id = target_organization and m.user_id = acting_user;
  if actor_role is null or actor_role not in ('super_admin', 'sales_manager', 'sales_representative') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  delete from public.mailbox_connection_rate_limits r
  where r.organization_id = target_organization and r.hour_start < hour_bucket - interval '24 hours';
  insert into public.mailbox_connection_rate_limits (organization_id, actor_id, hour_start, attempts)
  values (target_organization, acting_user, hour_bucket, 1)
  on conflict (organization_id, actor_id, hour_start) do update
    set attempts = public.mailbox_connection_rate_limits.attempts + 1
    where public.mailbox_connection_rate_limits.attempts < 10
  returning attempts into reserved_attempt;
  return reserved_attempt is not null;
end;
$$;
revoke all on function public.reserve_mailbox_connection_test(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_mailbox_connection_test(uuid, uuid) to service_role;

create or replace function public.create_mailbox_account(
  target_organization uuid,
  acting_user uuid,
  target_email text,
  target_display_name text,
  target_smtp_port integer,
  target_smtp_tls_mode text,
  target_key_version text,
  target_nonce text,
  target_ciphertext text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid;
  actor_role public.member_role;
begin
  select m.role into actor_role from public.memberships m
  where m.organization_id = target_organization and m.user_id = acting_user;
  if actor_role is null or actor_role not in ('super_admin', 'sales_manager', 'sales_representative') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if target_key_version is null or length(target_key_version) > 64
     or length(target_nonce) <> 16 or length(target_ciphertext) not between 24 and 8192
     or not ((target_smtp_port = 465 and target_smtp_tls_mode = 'implicit_tls')
       or (target_smtp_port = 587 and target_smtp_tls_mode = 'starttls')) then
    raise exception 'Invalid mailbox credential envelope' using errcode = '22023';
  end if;

  insert into public.mailbox_accounts (
    organization_id, owner_id, provider_key, email_address, display_name,
    imap_host, imap_port, imap_tls_mode, smtp_host, smtp_port, smtp_tls_mode,
    auth_method, connection_state
  ) values (
    target_organization, acting_user, 'hostinger_imap_smtp', lower(trim(target_email)),
    nullif(trim(target_display_name), ''), 'imap.hostinger.com', 993, 'implicit_tls',
    'smtp.hostinger.com', target_smtp_port, target_smtp_tls_mode, 'password', 'connected'
  ) returning id into account_id;

  insert into public.mailbox_credential_refs (
    mailbox_account_id, secret_reference, key_version, nonce, credential_ciphertext
  ) values (
    account_id, 'encrypted-db:' || account_id::text, target_key_version, target_nonce, target_ciphertext
  );

  insert into public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, result)
  values (target_organization, acting_user, 'mailbox.connected', 'mailbox', account_id::text, 'success');
  return account_id;
end;
$$;
revoke all on function public.create_mailbox_account(uuid, uuid, text, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_mailbox_account(uuid, uuid, text, text, integer, text, text, text, text) to service_role;
