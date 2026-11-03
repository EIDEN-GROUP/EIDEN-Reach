-- EIDEN Reach foundation. Apply only to a new development Supabase project.
create extension if not exists pgcrypto;

create type public.member_role as enum ('super_admin', 'sales_manager', 'sales_representative', 'analyst');
create type public.contact_lifecycle as enum ('new', 'working', 'qualified', 'customer', 'disqualified', 'archived');
create type public.task_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type public.deal_status as enum ('open', 'won', 'lost');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'sales_representative',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  domain text,
  industry text,
  location text,
  employee_count integer check (employee_count is null or employee_count >= 0),
  owner_id uuid references public.profiles(id) on delete set null,
  source text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index companies_org_domain_unique on public.companies (organization_id, lower(domain)) where domain is not null and archived_at is null;
create index companies_org_name_idx on public.companies (organization_id, lower(name)) where archived_at is null;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  email text,
  phone text,
  job_title text,
  source text,
  lifecycle public.contact_lifecycle not null default 'new',
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}',
  email_permission text,
  email_permission_recorded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint contact_custom_fields_object check (jsonb_typeof(custom_fields) = 'object')
);
create unique index contacts_org_email_unique on public.contacts (organization_id, lower(email)) where email is not null and archived_at is null;
create index contacts_org_owner_idx on public.contacts (organization_id, owner_id) where archived_at is null;
create index contacts_org_company_idx on public.contacts (organization_id, company_id) where archived_at is null;
create index contacts_org_lifecycle_idx on public.contacts (organization_id, lifecycle) where archived_at is null;

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create unique index pipelines_org_default_unique on public.pipelines (organization_id) where is_default;

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position integer not null check (position >= 0),
  probability numeric(5,4) not null default 0 check (probability between 0 and 1),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  unique (pipeline_id, name),
  unique (pipeline_id, position),
  check (not (is_won and is_lost))
);

create or replace function public.create_default_pipeline()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare new_pipeline uuid;
begin
  insert into public.pipelines (organization_id, name, is_default)
  values (new.id, 'Sales pipeline', true)
  returning id into new_pipeline;
  insert into public.pipeline_stages (pipeline_id, name, position, probability, is_won, is_lost) values
    (new_pipeline, 'New Lead', 0, 0.05, false, false),
    (new_pipeline, 'Contacting', 1, 0.10, false, false),
    (new_pipeline, 'Qualified', 2, 0.25, false, false),
    (new_pipeline, 'Pitch / Proposal', 3, 0.40, false, false),
    (new_pipeline, 'Appointment / Follow-up', 4, 0.50, false, false),
    (new_pipeline, 'Negotiation', 5, 0.70, false, false),
    (new_pipeline, 'Won', 6, 1.00, true, false),
    (new_pipeline, 'Lost', 7, 0.00, false, true),
    (new_pipeline, 'Handoff', 8, 1.00, true, false);
  return new;
end;
$$;
revoke all on function public.create_default_pipeline() from public, anon, authenticated;
create trigger on_organization_created_default_pipeline
after insert on public.organizations
for each row execute function public.create_default_pipeline();

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  amount numeric(14,2) check (amount is null or amount >= 0),
  currency char(3) not null default 'USD',
  expected_close_on date,
  next_action text,
  status public.deal_status not null default 'open',
  lost_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index deals_org_pipeline_stage_idx on public.deals (organization_id, pipeline_id, stage_id) where archived_at is null;
create index deals_org_owner_idx on public.deals (organization_id, owner_id) where archived_at is null;
create index deals_org_close_date_idx on public.deals (organization_id, expected_close_on) where status = 'open' and archived_at is null;

create table public.deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id) on delete set null,
  to_stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);
create index deal_stage_history_deal_time_idx on public.deal_stage_history (deal_id, changed_at desc);

create or replace function public.move_deal_stage(target_deal uuid, target_stage uuid, reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  deal_org uuid;
  deal_pipeline uuid;
  previous_stage uuid;
  next_is_won boolean;
  next_is_lost boolean;
begin
  select d.organization_id, d.pipeline_id, d.stage_id
    into deal_org, deal_pipeline, previous_stage
    from public.deals d where d.id = target_deal and d.archived_at is null for update;
  if deal_org is null or not public.has_org_role(deal_org, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[]) then
    raise exception 'Deal not found or access denied' using errcode = '42501';
  end if;
  select s.is_won, s.is_lost into next_is_won, next_is_lost
    from public.pipeline_stages s where s.id = target_stage and s.pipeline_id = deal_pipeline;
  if not found then
    raise exception 'Stage does not belong to this deal pipeline' using errcode = '22023';
  end if;
  if previous_stage = target_stage then return; end if;
  if next_is_lost and nullif(trim(reason), '') is null then
    raise exception 'A reason is required when marking a deal lost' using errcode = '22023';
  end if;
  update public.deals set stage_id = target_stage,
    status = case when next_is_won then 'won'::public.deal_status when next_is_lost then 'lost'::public.deal_status else 'open'::public.deal_status end,
    lost_reason = case when next_is_lost then trim(reason) else null end,
    updated_at = now()
    where id = target_deal;
  insert into public.deal_stage_history (deal_id, from_stage_id, to_stage_id, changed_by, note)
    values (target_deal, previous_stage, target_stage, auth.uid(), case when next_is_lost then trim(reason) else null end);
  insert into public.activity_events (organization_id, actor_id, deal_id, event_type, summary, source)
    values (deal_org, auth.uid(), target_deal, 'deal.stage_changed', 'Deal stage updated', 'web');
end;
$$;
revoke all on function public.move_deal_stage(uuid, uuid, text) from public;
grant execute on function public.move_deal_stage(uuid, uuid, text) to authenticated;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  title text not null,
  description text,
  priority smallint not null default 2 check (priority between 1 and 4),
  status public.task_status not null default 'open',
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_org_owner_due_idx on public.tasks (organization_id, owner_id, due_at) where status in ('open', 'in_progress');

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  event_type text not null,
  summary text not null,
  occurred_at timestamptz not null default now(),
  source text,
  idempotency_key text,
  metadata jsonb not null default '{}',
  constraint activity_metadata_object check (jsonb_typeof(metadata) = 'object')
);
create unique index activity_org_idempotency_unique on public.activity_events (organization_id, idempotency_key) where idempotency_key is not null;
create index activity_org_time_idx on public.activity_events (organization_id, occurred_at desc);
create index activity_contact_time_idx on public.activity_events (contact_id, occurred_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  result text not null check (result in ('success', 'failure', 'denied')),
  request_id text,
  created_at timestamptz not null default now(),
  details jsonb not null default '{}',
  constraint audit_details_object check (jsonb_typeof(details) = 'object')
);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);

create or replace function public.prevent_organization_transfer()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_organization_transfer() from public, anon, authenticated;
create trigger companies_org_immutable before update on public.companies for each row execute function public.prevent_organization_transfer();
create trigger contacts_org_immutable before update on public.contacts for each row execute function public.prevent_organization_transfer();
create trigger pipelines_org_immutable before update on public.pipelines for each row execute function public.prevent_organization_transfer();
create trigger deals_org_immutable before update on public.deals for each row execute function public.prevent_organization_transfer();
create trigger tasks_org_immutable before update on public.tasks for each row execute function public.prevent_organization_transfer();
create trigger activity_org_immutable before update on public.activity_events for each row execute function public.prevent_organization_transfer();
create trigger audit_org_immutable before update on public.audit_logs for each row execute function public.prevent_organization_transfer();

create or replace function public.prevent_pipeline_stage_transfer()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.pipeline_id is distinct from old.pipeline_id then
    raise exception 'pipeline_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_pipeline_stage_transfer() from public, anon, authenticated;
create trigger pipeline_stages_pipeline_immutable before update on public.pipeline_stages for each row execute function public.prevent_pipeline_stage_transfer();

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.memberships m where m.organization_id = target_org and m.user_id = (select auth.uid())) $$;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

create or replace function public.has_org_role(target_org uuid, allowed_roles public.member_role[])
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.memberships m where m.organization_id = target_org and m.user_id = (select auth.uid()) and m.role = any(allowed_roles)) $$;
revoke all on function public.has_org_role(uuid, public.member_role[]) from public;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated;

create or replace function public.is_org_user_member(target_org uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.memberships m where m.organization_id = target_org and m.user_id = target_user and (target_user = (select auth.uid()) or public.has_org_role(target_org, array['super_admin', 'sales_manager']::public.member_role[]))) $$;
revoke all on function public.is_org_user_member(uuid, uuid) from public;
grant execute on function public.is_org_user_member(uuid, uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.deal_stage_history enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_events enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can read their organizations" on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "users can read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "users can update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members can read organization memberships" on public.memberships for select to authenticated using (public.is_org_member(organization_id));

create policy "members read companies" on public.companies for select to authenticated using (public.is_org_member(organization_id));
create policy "authorized roles create companies" on public.companies for insert to authenticated with check (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[]) and created_by = (select auth.uid()) and (owner_id is null or public.is_org_user_member(organization_id, owner_id)));
create policy "authorized roles update companies" on public.companies for update to authenticated using (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[])) with check (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[]) and (owner_id is null or public.is_org_user_member(organization_id, owner_id)));

create policy "members read contacts" on public.contacts for select to authenticated using (public.is_org_member(organization_id));
create policy "authorized roles create contacts" on public.contacts for insert to authenticated with check (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[]) and created_by = (select auth.uid()) and (owner_id is null or public.is_org_user_member(organization_id, owner_id)));
create policy "authorized roles update contacts" on public.contacts for update to authenticated using (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[])) with check (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[]) and (owner_id is null or public.is_org_user_member(organization_id, owner_id)));

create policy "members read pipelines" on public.pipelines for select to authenticated using (public.is_org_member(organization_id));
create policy "admins manage pipelines" on public.pipelines for all to authenticated using (public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[])) with check (public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));
create policy "members read stages" on public.pipeline_stages for select to authenticated using (exists (select 1 from public.pipelines p where p.id = pipeline_id and public.is_org_member(p.organization_id)));
create policy "admins manage stages" on public.pipeline_stages for all to authenticated using (exists (select 1 from public.pipelines p join public.memberships m on m.organization_id = p.organization_id where p.id = pipeline_id and m.user_id = auth.uid() and m.role in ('super_admin', 'sales_manager'))) with check (exists (select 1 from public.pipelines p join public.memberships m on m.organization_id = p.organization_id where p.id = pipeline_id and m.user_id = auth.uid() and m.role in ('super_admin', 'sales_manager')));

create policy "members read deals" on public.deals for select to authenticated using (public.is_org_member(organization_id));
create policy "sales roles create deals" on public.deals for insert to authenticated with check (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[]) and created_by = (select auth.uid()) and (owner_id is null or public.is_org_user_member(organization_id, owner_id)));
create policy "sales roles update deals" on public.deals for update to authenticated using (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[])) with check (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[]) and (owner_id is null or public.is_org_user_member(organization_id, owner_id)));
create policy "members read deal history" on public.deal_stage_history for select to authenticated using (exists (select 1 from public.deals d where d.id = deal_id and public.is_org_member(d.organization_id)));
create policy "members read tasks" on public.tasks for select to authenticated using (public.is_org_member(organization_id));
create policy "sales roles create tasks" on public.tasks for insert to authenticated with check (public.has_org_role(organization_id, array['super_admin', 'sales_manager', 'sales_representative']::public.member_role[]) and created_by = (select auth.uid()) and (owner_id is null or public.is_org_user_member(organization_id, owner_id)));
create policy "owners or managers update tasks" on public.tasks for update to authenticated using (public.is_org_member(organization_id) and (owner_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]))) with check (public.is_org_member(organization_id) and (owner_id is null or public.is_org_user_member(organization_id, owner_id)));
create policy "members read activity" on public.activity_events for select to authenticated using (public.is_org_member(organization_id));
create policy "managers read audit logs" on public.audit_logs for select to authenticated using (public.has_org_role(organization_id, array['super_admin', 'sales_manager']::public.member_role[]));

-- Supabase projects can grant table access to anon/authenticated by default; keep grants explicit too.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations, public.memberships to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.companies, public.contacts, public.deals, public.tasks to authenticated;
grant select, insert, update, delete on public.pipelines, public.pipeline_stages to authenticated;
grant select on public.deal_stage_history, public.activity_events, public.audit_logs to authenticated;

-- Intentionally no policies for browser writes to audit logs, mailbox secrets, send jobs or integrations.
