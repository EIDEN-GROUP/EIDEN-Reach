create type public.campaign_status as enum ('draft', 'preflight', 'approved', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed');
create type public.audience_member_status as enum ('eligible', 'excluded', 'queued', 'accepted', 'failed', 'suppressed');

create table public.contact_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  list_kind text not null default 'manual' check (list_kind in ('manual', 'saved_filter')),
  filter_definition jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, name),
  unique (organization_id, id),
  check (jsonb_typeof(filter_definition) = 'object')
);
create table public.contact_list_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  list_id uuid not null references public.contact_lists(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (list_id, contact_id),
  foreign key (organization_id, list_id) references public.contact_lists(organization_id, id),
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id),
  foreign key (organization_id, added_by) references public.memberships(organization_id, user_id)
);
create index contact_lists_org_name_idx on public.contact_lists (organization_id, lower(name)) where archived_at is null;
create index contact_list_members_contact_idx on public.contact_list_members (organization_id, contact_id);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  sender_mailbox_id uuid references public.mailbox_accounts(id) on delete restrict,
  sequence_id uuid references public.sequences(id) on delete set null,
  name text not null,
  category text not null check (category in ('sales', 'marketing', 'transactional')),
  status public.campaign_status not null default 'draft',
  scheduled_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  launched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create index campaigns_org_status_idx on public.campaigns (organization_id, status, scheduled_at);

create table public.campaign_audience_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  status public.audience_member_status not null default 'eligible',
  exclusion_reason text,
  variant_key text,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (campaign_id, contact_id),
  foreign key (organization_id, campaign_id) references public.campaigns(organization_id, id),
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id)
);
create index campaign_audience_status_idx on public.campaign_audience_members (organization_id, campaign_id, status);

create table public.sequence_variants (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  sequence_version integer not null,
  variant_key text not null,
  template_id uuid not null references public.email_templates(id) on delete restrict,
  allocation_percent numeric(5,2) not null check (allocation_percent > 0 and allocation_percent <= 100),
  created_at timestamptz not null default now(),
  unique (sequence_id, sequence_version, variant_key),
  foreign key (sequence_id, sequence_version) references public.sequence_versions(sequence_id, version) on delete cascade
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(contact_id, company_id, deal_id) = 1)
);
create index notes_org_created_idx on public.notes (organization_id, created_at desc);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  trigger_type text not null,
  conditions jsonb not null default '{}',
  actions jsonb not null default '[]',
  enabled boolean not null default false,
  test_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(conditions) = 'object'),
  check (jsonb_typeof(actions) = 'array'),
  unique (organization_id, id)
);
create table public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  trigger_event_id uuid references public.activity_events(id) on delete set null,
  idempotency_key text not null,
  state text not null check (state in ('started', 'succeeded', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  result_summary text,
  unique (organization_id, idempotency_key)
);
create index automation_executions_org_time_idx on public.automation_executions (organization_id, started_at desc);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_key text not null,
  display_name text not null,
  connection_state text not null default 'not_connected' check (connection_state in ('not_connected', 'connected', 'degraded', 'reauth_required', 'disconnected')),
  capabilities jsonb not null default '{}',
  last_checked_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_key),
  check (jsonb_typeof(capabilities) = 'object')
);

create table public.integration_credential_refs (
  integration_connection_id uuid primary key references public.integration_connections(id) on delete cascade,
  secret_reference text not null,
  key_version text not null,
  updated_at timestamptz not null default now()
);
alter table public.integration_credential_refs enable row level security;

create table public.domain_auth_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null,
  record_kind text not null check (record_kind in ('spf', 'dkim', 'dmarc')),
  selector text,
  check_state text not null check (check_state in ('pass', 'missing', 'conflict', 'error', 'unknown')),
  checked_at timestamptz not null default now(),
  details_redacted text,
  unique (organization_id, domain, record_kind, selector)
);
create index domain_auth_latest_idx on public.domain_auth_checks (organization_id, domain, checked_at desc);

create table public.approval_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  action_type text not null,
  resource_type text not null,
  resource_id uuid,
  state text not null default 'pending' check (state in ('pending', 'approved', 'rejected', 'expired', 'executed')),
  preview jsonb not null default '{}',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reviewed_at timestamptz,
  executed_at timestamptz,
  unique (organization_id, idempotency_key),
  check (jsonb_typeof(preview) = 'object')
);

create table public.ai_action_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  client_name text not null,
  tool_name text not null,
  resource_type text,
  resource_id text,
  result text not null check (result in ('success', 'failure', 'denied', 'approval_required')),
  request_id text,
  created_at timestamptz not null default now(),
  input_summary_redacted jsonb not null default '{}',
  check (jsonb_typeof(input_summary_redacted) = 'object')
);
create index ai_action_logs_org_time_idx on public.ai_action_logs (organization_id, created_at desc);

alter table public.contact_lists enable row level security;
alter table public.contact_list_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_audience_members enable row level security;
alter table public.sequence_variants enable row level security;
alter table public.notes enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_executions enable row level security;
alter table public.integration_connections enable row level security;
alter table public.domain_auth_checks enable row level security;
alter table public.approval_records enable row level security;
alter table public.ai_action_logs enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'contact_lists', 'campaigns', 'campaign_audience_members', 'notes',
    'automation_rules', 'automation_executions', 'integration_connections',
    'domain_auth_checks', 'approval_records', 'ai_action_logs'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.prevent_organization_transfer()', table_name || '_org_immutable', table_name);
  end loop;
end;
$$;

create policy "members read contact lists" on public.contact_lists for select to authenticated using (public.is_org_member(organization_id));
create policy "members read list memberships" on public.contact_list_members for select to authenticated using (public.is_org_member(organization_id));
create policy "members read campaigns" on public.campaigns for select to authenticated using (public.is_org_member(organization_id));
create policy "members read campaign audiences" on public.campaign_audience_members for select to authenticated using (public.is_org_member(organization_id));
create policy "members read sequence variants" on public.sequence_variants for select to authenticated
  using (exists (select 1 from public.sequences s where s.id = sequence_id and public.is_org_member(s.organization_id)));
create policy "members read notes" on public.notes for select to authenticated using (public.is_org_member(organization_id));
create policy "managers read automation rules" on public.automation_rules for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));
create policy "managers read automation executions" on public.automation_executions for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));
create policy "managers read integrations" on public.integration_connections for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));
create policy "managers read domain checks" on public.domain_auth_checks for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));
create policy "managers read approvals" on public.approval_records for select to authenticated
  using (requested_by = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));
create policy "managers read AI action logs" on public.ai_action_logs for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));

revoke all on public.contact_lists, public.contact_list_members, public.campaigns,
  public.campaign_audience_members, public.sequence_variants, public.notes,
  public.automation_rules, public.automation_executions, public.integration_connections,
  public.integration_credential_refs, public.domain_auth_checks, public.approval_records,
  public.ai_action_logs from anon, authenticated;
grant select on public.contact_lists, public.contact_list_members, public.campaigns,
  public.campaign_audience_members, public.sequence_variants, public.notes,
  public.automation_rules, public.automation_executions, public.integration_connections,
  public.domain_auth_checks, public.approval_records, public.ai_action_logs to authenticated;

alter table public.campaign_audience_members add constraint campaign_audience_org_contact_fk
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id);
alter table public.campaigns add constraint campaigns_sender_same_org_fk
  foreign key (organization_id, sender_mailbox_id) references public.mailbox_accounts(organization_id, id);
alter table public.campaigns add constraint campaigns_sequence_same_org_fk
  foreign key (organization_id, sequence_id) references public.sequences(organization_id, id);
alter table public.notes add constraint notes_contact_same_org_fk
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id);
alter table public.notes add constraint notes_company_same_org_fk
  foreign key (organization_id, company_id) references public.companies(organization_id, id);
alter table public.notes add constraint notes_deal_same_org_fk
  foreign key (organization_id, deal_id) references public.deals(organization_id, id);
alter table public.automation_rules add constraint automation_created_by_membership_fk
  foreign key (organization_id, created_by) references public.memberships(organization_id, user_id);
alter table public.automation_executions add constraint automation_execution_rule_org_fk
  foreign key (organization_id, rule_id) references public.automation_rules(organization_id, id);
alter table public.contact_lists add constraint contact_list_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships(organization_id, user_id);
alter table public.campaigns add constraint campaigns_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships(organization_id, user_id);
alter table public.campaigns add constraint campaigns_approver_membership_fk
  foreign key (organization_id, approved_by) references public.memberships(organization_id, user_id);
alter table public.notes add constraint notes_author_membership_fk
  foreign key (organization_id, author_id) references public.memberships(organization_id, user_id);

alter table public.send_attempts add column campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.send_attempts add constraint send_attempt_campaign_same_org_fk
  foreign key (organization_id, campaign_id) references public.campaigns(organization_id, id);
create index send_attempts_campaign_idx on public.send_attempts (organization_id, campaign_id, created_at desc) where campaign_id is not null;
alter table public.approval_records add constraint approval_requester_membership_fk
  foreign key (organization_id, requested_by) references public.memberships(organization_id, user_id);
alter table public.approval_records add constraint approval_reviewer_membership_fk
  foreign key (organization_id, reviewed_by) references public.memberships(organization_id, user_id);
alter table public.ai_action_logs add constraint ai_action_user_membership_fk
  foreign key (organization_id, user_id) references public.memberships(organization_id, user_id);
