-- Durable email, sequence and worker foundation. Application workers must use
-- authenticated server credentials; queue messages are never the job database.
create type public.mailbox_connection_state as enum ('pending', 'connected', 'degraded', 'reauth_required', 'disconnected');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.sequence_status as enum ('draft', 'active', 'paused', 'archived');
create type public.sequence_step_kind as enum ('email', 'wait', 'task', 'condition');
create type public.enrollment_state as enum ('pending', 'active', 'waiting', 'sending', 'paused', 'replied', 'completed', 'unsubscribed', 'bounced', 'cancelled', 'failed');
create type public.durable_job_status as enum ('pending', 'running', 'retry', 'succeeded', 'failed', 'cancelled');
create type public.send_attempt_status as enum ('created', 'queued', 'attempted', 'accepted', 'failed', 'unknown');
create type public.email_event_kind as enum ('smtp_accepted', 'provider_delivered', 'temporary_bounce', 'hard_bounce', 'complaint', 'unsubscribe', 'reply', 'link_click', 'open');

create table public.mailbox_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  provider_key text not null,
  email_address text not null,
  display_name text,
  imap_host text not null,
  imap_port integer not null check (imap_port between 1 and 65535),
  imap_tls_mode text not null check (imap_tls_mode in ('implicit_tls', 'starttls')),
  smtp_host text not null,
  smtp_port integer not null check (smtp_port between 1 and 65535),
  smtp_tls_mode text not null check (smtp_tls_mode in ('implicit_tls', 'starttls')),
  auth_method text not null check (auth_method in ('password', 'oauth2')),
  connection_state public.mailbox_connection_state not null default 'pending',
  last_sync_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz
);
create unique index mailbox_address_owner_unique on public.mailbox_accounts (organization_id, owner_id, lower(email_address)) where disconnected_at is null;
create index mailbox_org_owner_idx on public.mailbox_accounts (organization_id, owner_id) where disconnected_at is null;

create table public.mailbox_access_grants (
  id uuid primary key default gen_random_uuid(),
  mailbox_account_id uuid not null references public.mailbox_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_read boolean not null default false,
  can_send boolean not null default false,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  unique (mailbox_account_id, user_id),
  check (can_read or can_send)
);
create index mailbox_access_user_idx on public.mailbox_access_grants (user_id, mailbox_account_id) where revoked_at is null;

create or replace function public.can_access_mailbox(target_mailbox uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.mailbox_accounts a where a.id = target_mailbox and a.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.mailbox_access_grants g
    where g.mailbox_account_id = target_mailbox and g.user_id = (select auth.uid()) and g.can_read
      and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
  )
$$;
revoke all on function public.can_access_mailbox(uuid) from public;
grant execute on function public.can_access_mailbox(uuid) to authenticated;

-- This stores a reference to a server-side secret manager, never a password/token.
create table public.mailbox_credential_refs (
  mailbox_account_id uuid primary key references public.mailbox_accounts(id) on delete cascade,
  secret_reference text not null,
  key_version text not null,
  updated_at timestamptz not null default now()
);

create table public.mailbox_folders (
  id uuid primary key default gen_random_uuid(),
  mailbox_account_id uuid not null references public.mailbox_accounts(id) on delete cascade,
  provider_folder_id text not null,
  display_name text not null,
  special_use text,
  uid_validity bigint,
  highest_synced_uid bigint not null default 0,
  last_synced_at timestamptz,
  sync_state text not null default 'pending' check (sync_state in ('pending', 'syncing', 'healthy', 'error')),
  last_error_code text,
  unique (mailbox_account_id, provider_folder_id)
);
create index mailbox_folders_account_idx on public.mailbox_folders (mailbox_account_id, display_name);

create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailbox_account_id uuid not null references public.mailbox_accounts(id) on delete cascade,
  provider_thread_id text,
  normalized_subject text not null default '',
  latest_message_at timestamptz,
  participant_summary jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint thread_participants_array check (jsonb_typeof(participant_summary) = 'array')
);
create unique index email_threads_provider_id_unique on public.email_threads (mailbox_account_id, provider_thread_id) where provider_thread_id is not null;
create index email_threads_org_latest_idx on public.email_threads (organization_id, mailbox_account_id, latest_message_at desc);

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailbox_account_id uuid not null references public.mailbox_accounts(id) on delete cascade,
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  direction public.message_direction not null,
  provider_message_key text,
  rfc_message_id text,
  in_reply_to text,
  references_header text[] not null default '{}',
  subject text not null default '',
  snippet text not null default '',
  text_body text,
  html_body text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  raw_headers jsonb not null default '{}',
  constraint message_headers_object check (jsonb_typeof(raw_headers) = 'object')
);
create unique index email_messages_provider_key_unique on public.email_messages (mailbox_account_id, provider_message_key) where provider_message_key is not null;
create unique index email_messages_rfc_id_unique on public.email_messages (mailbox_account_id, rfc_message_id) where rfc_message_id is not null;
create index email_messages_thread_time_idx on public.email_messages (thread_id, coalesce(received_at, sent_at, created_at));
create index email_messages_org_time_idx on public.email_messages (organization_id, mailbox_account_id, received_at desc);

create table public.email_message_participants (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.email_messages(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  participant_type text not null check (participant_type in ('from', 'to', 'cc', 'bcc', 'reply_to')),
  email_address text not null,
  display_name text,
  ordinal integer not null default 0 check (ordinal >= 0),
  unique (message_id, participant_type, email_address, ordinal)
);
create index email_participants_email_idx on public.email_message_participants (lower(email_address));

create table public.email_message_locations (
  message_id uuid not null references public.email_messages(id) on delete cascade,
  folder_id uuid not null references public.mailbox_folders(id) on delete cascade,
  provider_uid bigint not null,
  is_read boolean not null default false,
  is_flagged boolean not null default false,
  is_deleted boolean not null default false,
  labels text[] not null default '{}',
  primary key (folder_id, provider_uid),
  unique (message_id, folder_id)
);
create index email_locations_folder_read_idx on public.email_message_locations (folder_id, is_read, provider_uid desc);

create table public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.email_messages(id) on delete cascade,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text,
  private_object_key text,
  inline_content_id text,
  created_at timestamptz not null default now()
);

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  subject text not null default '',
  html_body text not null default '',
  text_body text not null default '',
  category text not null default 'sales' check (category in ('sales', 'marketing', 'transactional')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index email_templates_org_name_idx on public.email_templates (organization_id, lower(name)) where archived_at is null;

create table public.sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  sender_mailbox_id uuid references public.mailbox_accounts(id) on delete set null,
  name text not null,
  description text,
  status public.sequence_status not null default 'draft',
  category text not null default 'sales' check (category in ('sales', 'marketing')),
  current_version integer not null default 1 check (current_version > 0),
  daily_limit integer check (daily_limit is null or daily_limit > 0),
  send_window jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, name)
);
create index sequences_org_status_idx on public.sequences (organization_id, status) where archived_at is null;

create table public.sequence_versions (
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  version integer not null check (version > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  change_note text,
  primary key (sequence_id, version)
);

create table public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  version integer not null,
  position integer not null check (position >= 0),
  kind public.sequence_step_kind not null,
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  business_days_only boolean not null default false,
  time_zone_policy text not null default 'contact' check (time_zone_policy in ('contact', 'workspace', 'utc')),
  template_id uuid references public.email_templates(id) on delete set null,
  configuration jsonb not null default '{}',
  unique (sequence_id, version, position),
  foreign key (sequence_id, version) references public.sequence_versions(sequence_id, version) on delete cascade,
  constraint sequence_step_config_object check (jsonb_typeof(configuration) = 'object')
);
create index sequence_steps_order_idx on public.sequence_steps (sequence_id, version, position);

create table public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  sequence_version integer not null,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  owner_id uuid references public.profiles(id) on delete set null,
  state public.enrollment_state not null default 'pending',
  enrolled_at timestamptz not null default now(),
  next_step_position integer not null default 0 check (next_step_position >= 0),
  next_run_at timestamptz,
  stopped_at timestamptz,
  stop_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  idempotency_key text,
  foreign key (sequence_id, sequence_version) references public.sequence_versions(sequence_id, version) on delete restrict
);
create unique index enrollment_idempotency_unique on public.sequence_enrollments (organization_id, idempotency_key) where idempotency_key is not null;
create unique index enrollment_one_live_per_contact on public.sequence_enrollments (sequence_id, contact_id) where state in ('pending', 'active', 'waiting', 'sending', 'paused');
create index enrollment_due_idx on public.sequence_enrollments (next_run_at, id) where state in ('pending', 'active', 'waiting');
create index enrollment_org_state_idx on public.sequence_enrollments (organization_id, state, enrolled_at desc);

create table public.enrollment_step_states (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.sequence_enrollments(id) on delete cascade,
  sequence_step_id uuid not null references public.sequence_steps(id) on delete restrict,
  state text not null check (state in ('pending', 'waiting', 'ready', 'sending', 'completed', 'skipped', 'failed')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  result_code text,
  unique (enrollment_id, sequence_step_id)
);
create index enrollment_steps_scheduled_idx on public.enrollment_step_states (scheduled_at, id) where state in ('pending', 'waiting', 'ready');

create table public.suppression_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email_normalized text not null,
  reason text not null check (reason in ('unsubscribe', 'hard_bounce', 'complaint', 'manual', 'provider_block')),
  source text not null,
  recorded_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  unique (organization_id, email_normalized)
);
create index suppression_email_lookup_idx on public.suppression_records (organization_id, lower(email_normalized));

create table public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null,
  idempotency_key text not null,
  status public.durable_job_status not null default 'pending',
  scheduled_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  claim_token uuid,
  lease_expires_at timestamptz,
  payload jsonb not null default '{}',
  result_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint scheduled_job_payload_object check (jsonb_typeof(payload) = 'object'),
  unique (organization_id, job_type, idempotency_key)
);
create index scheduled_jobs_due_idx on public.scheduled_jobs (scheduled_at, id) where status in ('pending', 'retry');
create index scheduled_jobs_expired_lease_idx on public.scheduled_jobs (lease_expires_at) where status = 'running';

create table public.scheduled_job_attempts (
  id uuid primary key default gen_random_uuid(),
  scheduled_job_id uuid not null references public.scheduled_jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null check (outcome in ('running', 'succeeded', 'retry', 'failed')),
  error_code text,
  retry_after timestamptz,
  unique (scheduled_job_id, attempt_number)
);

create or replace function public.claim_due_jobs(batch_size integer default 25, lease_seconds integer default 90)
returns setof public.scheduled_jobs language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if batch_size < 1 or batch_size > 50 or lease_seconds < 15 or lease_seconds > 900 then
    raise exception 'Invalid claim batch or lease duration' using errcode = '22023';
  end if;
  update public.scheduled_jobs j set status = 'failed', completed_at = now(), updated_at = now(),
    lease_expires_at = null, claim_token = null, result_code = 'lease_expired_max_attempts'
  where j.status = 'running' and j.lease_expires_at < now() and j.attempts >= j.max_attempts;
  update public.scheduled_job_attempts a set outcome = 'failed', error_code = 'lease_expired_max_attempts', finished_at = now()
  where a.outcome = 'running' and exists (
    select 1 from public.scheduled_jobs j where j.id = a.scheduled_job_id
      and j.status = 'failed' and j.result_code = 'lease_expired_max_attempts' and j.attempts = a.attempt_number
  );
  update public.scheduled_job_attempts a set outcome = 'retry', error_code = 'lease_expired', finished_at = now()
  where a.outcome = 'running' and exists (
    select 1 from public.scheduled_jobs j where j.id = a.scheduled_job_id
      and j.status = 'running' and j.lease_expires_at < now() and j.attempts = a.attempt_number
  );
  return query
    with due as (
      select j.id from public.scheduled_jobs j
      where ((j.status in ('pending', 'retry') and j.scheduled_at <= now())
          or (j.status = 'running' and j.lease_expires_at < now()))
        and j.attempts < j.max_attempts
      order by j.scheduled_at, j.id
      for update skip locked
      limit batch_size
    ), claimed as (
      update public.scheduled_jobs j
      set status = 'running', attempts = j.attempts + 1,
          claim_token = gen_random_uuid(),
          lease_expires_at = now() + make_interval(secs => lease_seconds),
          updated_at = now()
      from due where j.id = due.id
      returning j.*
    ), attempt_records as (
      insert into public.scheduled_job_attempts (scheduled_job_id, attempt_number, outcome)
      select c.id, c.attempts, 'running' from claimed c
      returning id
    )
    select c.* from claimed c cross join (select count(*) from attempt_records) recorded;
end;
$$;
revoke all on function public.claim_due_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_jobs(integer, integer) to service_role;

create or replace function public.finish_scheduled_job(target_job uuid, target_claim uuid, result text default null)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare affected integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  update public.scheduled_jobs set status = 'succeeded', result_code = result,
    completed_at = now(), updated_at = now(), lease_expires_at = null, claim_token = null
  where id = target_job and status = 'running' and claim_token = target_claim;
  get diagnostics affected = row_count;
  if affected = 1 then
    update public.scheduled_job_attempts set outcome = 'succeeded', finished_at = now()
    where scheduled_job_id = target_job and attempt_number = (select attempts from public.scheduled_jobs where id = target_job);
  end if;
  return affected = 1;
end;
$$;
revoke all on function public.finish_scheduled_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finish_scheduled_job(uuid, uuid, text) to service_role;

create or replace function public.retry_scheduled_job(target_job uuid, target_claim uuid, failure_code text, retry_at timestamptz)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare affected integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if retry_at is null or retry_at < now() then
    raise exception 'Retry time must be in the future' using errcode = '22023';
  end if;
  update public.scheduled_jobs set
    status = case when attempts >= max_attempts then 'failed'::public.durable_job_status else 'retry'::public.durable_job_status end,
    scheduled_at = case when attempts >= max_attempts then scheduled_at else retry_at end,
    result_code = left(failure_code, 120), updated_at = now(),
    completed_at = case when attempts >= max_attempts then now() else null end,
    lease_expires_at = null, claim_token = null
  where id = target_job and status = 'running' and claim_token = target_claim;
  get diagnostics affected = row_count;
  if affected = 1 then
    update public.scheduled_job_attempts set
      outcome = case when (select status from public.scheduled_jobs where id = target_job) = 'failed' then 'failed' else 'retry' end,
      error_code = left(failure_code, 120), retry_after = retry_at, finished_at = now()
    where scheduled_job_id = target_job and attempt_number = (select attempts from public.scheduled_jobs where id = target_job);
  end if;
  return affected = 1;
end;
$$;
revoke all on function public.retry_scheduled_job(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.retry_scheduled_job(uuid, uuid, text, timestamptz) to service_role;

create table public.send_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailbox_account_id uuid not null references public.mailbox_accounts(id) on delete restrict,
  enrollment_id uuid references public.sequence_enrollments(id) on delete set null,
  sequence_step_id uuid references public.sequence_steps(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  email_message_id uuid references public.email_messages(id) on delete set null,
  idempotency_key text not null,
  status public.send_attempt_status not null default 'created',
  provider_message_id text,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index send_attempts_mailbox_time_idx on public.send_attempts (mailbox_account_id, created_at desc);

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  send_attempt_id uuid references public.send_attempts(id) on delete set null,
  message_id uuid references public.email_messages(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  event_kind public.email_event_kind not null,
  provider_event_id text,
  occurred_at timestamptz not null,
  source text not null,
  metadata jsonb not null default '{}',
  idempotency_key text not null,
  unique (organization_id, idempotency_key),
  constraint email_event_metadata_object check (jsonb_typeof(metadata) = 'object')
);
create index email_events_org_kind_time_idx on public.email_events (organization_id, event_kind, occurred_at desc);
create unique index email_events_provider_id_unique on public.email_events (organization_id, provider_event_id) where provider_event_id is not null;

create table public.mcp_authorization_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_name text not null,
  scopes text[] not null default '{}',
  token_reference text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index mcp_grants_active_idx on public.mcp_authorization_grants (user_id, expires_at) where revoked_at is null;

alter table public.mailbox_accounts enable row level security;
alter table public.mailbox_access_grants enable row level security;
alter table public.mailbox_credential_refs enable row level security;
alter table public.mailbox_folders enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_message_participants enable row level security;
alter table public.email_message_locations enable row level security;
alter table public.email_attachments enable row level security;
alter table public.email_templates enable row level security;
alter table public.sequences enable row level security;
alter table public.sequence_versions enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.sequence_enrollments enable row level security;
alter table public.enrollment_step_states enable row level security;
alter table public.suppression_records enable row level security;
alter table public.scheduled_jobs enable row level security;
alter table public.scheduled_job_attempts enable row level security;
alter table public.send_attempts enable row level security;
alter table public.email_events enable row level security;
alter table public.mcp_authorization_grants enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'mailbox_accounts', 'email_threads', 'email_messages', 'email_templates',
    'sequences', 'sequence_enrollments', 'suppression_records', 'scheduled_jobs',
    'send_attempts', 'email_events', 'mcp_authorization_grants'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.prevent_organization_transfer()', table_name || '_org_immutable', table_name);
  end loop;
end;
$$;

create policy "users read their mailbox metadata" on public.mailbox_accounts for select to authenticated
  using (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));
create policy "users read mailbox grants that involve them" on public.mailbox_access_grants for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.mailbox_accounts a where a.id = mailbox_account_id and a.owner_id = (select auth.uid())));
create policy "mailbox owners read folders" on public.mailbox_folders for select to authenticated
  using (public.can_access_mailbox(mailbox_account_id));
create policy "mailbox owners read threads" on public.email_threads for select to authenticated
  using (public.can_access_mailbox(mailbox_account_id));
create policy "mailbox owners read messages" on public.email_messages for select to authenticated
  using (public.can_access_mailbox(mailbox_account_id));
create policy "mailbox owners read participants" on public.email_message_participants for select to authenticated
  using (exists (select 1 from public.email_messages e where e.id = message_id and public.can_access_mailbox(e.mailbox_account_id)));
create policy "mailbox owners read locations" on public.email_message_locations for select to authenticated
  using (exists (select 1 from public.mailbox_folders f where f.id = folder_id and public.can_access_mailbox(f.mailbox_account_id)));
create policy "mailbox owners read attachments" on public.email_attachments for select to authenticated
  using (exists (select 1 from public.email_messages e where e.id = message_id and public.can_access_mailbox(e.mailbox_account_id)));

create policy "members read templates" on public.email_templates for select to authenticated using (public.is_org_member(organization_id));
create policy "members read sequences" on public.sequences for select to authenticated using (public.is_org_member(organization_id));
create policy "members read sequence versions" on public.sequence_versions for select to authenticated
  using (exists (select 1 from public.sequences s where s.id = sequence_id and public.is_org_member(s.organization_id)));
create policy "members read sequence steps" on public.sequence_steps for select to authenticated
  using (exists (select 1 from public.sequences s where s.id = sequence_id and public.is_org_member(s.organization_id)));
create policy "members read enrollments" on public.sequence_enrollments for select to authenticated using (public.is_org_member(organization_id));
create policy "managers read suppressions" on public.suppression_records for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));
create policy "members read email events" on public.email_events for select to authenticated using (public.is_org_member(organization_id));
create policy "users read own MCP grants" on public.mcp_authorization_grants for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.mailbox_accounts, public.mailbox_access_grants, public.mailbox_credential_refs,
  public.mailbox_folders, public.email_threads, public.email_messages,
  public.email_message_participants, public.email_message_locations, public.email_attachments,
  public.email_templates, public.sequences, public.sequence_versions, public.sequence_steps,
  public.sequence_enrollments, public.enrollment_step_states, public.suppression_records,
  public.scheduled_jobs, public.scheduled_job_attempts, public.send_attempts,
  public.email_events, public.mcp_authorization_grants from anon, authenticated;
grant select on public.mailbox_accounts, public.mailbox_folders, public.email_threads,
  public.email_messages, public.email_message_participants, public.email_message_locations,
  public.email_attachments, public.email_templates, public.sequences, public.sequence_versions,
  public.sequence_steps, public.sequence_enrollments, public.suppression_records, public.email_events,
  public.mailbox_access_grants, public.mcp_authorization_grants to authenticated;

-- No browser write policies exist for mailbox sync, credentials, sends, enrollments,
-- suppression, scheduled jobs, or MCP grants. Those operations need audited server services.
