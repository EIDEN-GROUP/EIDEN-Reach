-- Sequence templates are reusable blueprints: the complete workflow,
-- all step content, timing, and configuration in one place.
create table if not exists public.sequence_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  category text not null default 'sales' check (category in ('sales', 'marketing')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (organization_id, name)
);
create index if not exists sequence_templates_org_idx on public.sequence_templates (organization_id) where archived_at is null;

create table if not exists public.sequence_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.sequence_templates(id) on delete cascade,
  position integer not null check (position >= 0),
  kind public.sequence_step_kind not null,
  subject text not null default '',
  html_body text not null default '',
  text_body text not null default '',
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  delay_unit text not null default 'days' check (delay_unit in ('minutes', 'hours', 'days', 'business_days')),
  business_days_only boolean not null default false,
  time_zone_policy text not null default 'contact' check (time_zone_policy in ('contact', 'workspace', 'utc')),
  configuration jsonb not null default '{}',
  unique (template_id, position),
  constraint sequence_template_step_config_object check (jsonb_typeof(configuration) = 'object')
);
create index if not exists sequence_template_steps_order_idx on public.sequence_template_steps (template_id, position);

alter table public.sequence_templates enable row level security;
alter table public.sequence_template_steps enable row level security;

create policy "members read sequence templates" on public.sequence_templates for select to authenticated using (public.is_org_member(organization_id));
create policy "managers manage sequence templates" on public.sequence_templates for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "members read template steps" on public.sequence_template_steps for select to authenticated using (template_id in (select id from public.sequence_templates where public.is_org_member(organization_id)));
create policy "managers manage template steps" on public.sequence_template_steps for all to authenticated using (template_id in (select id from public.sequence_templates where public.is_org_member(organization_id))) with check (template_id in (select id from public.sequence_templates where public.is_org_member(organization_id)));

grant insert, update, delete, select on public.sequence_templates to authenticated;
grant insert, update, delete, select on public.sequence_template_steps to authenticated;

-- Track which blueprint a sequence was created from (history preserved).
alter table public.sequences
  add column if not exists source_template_id uuid references public.sequence_templates(id) on delete set null,
  add column if not exists source_template_version timestamptz;

-- Unsubscribe tokens: secure, unguessable, contact-specific.
create table if not exists public.unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  enrollment_id uuid references public.sequence_enrollments(id) on delete set null,
  sequence_id uuid references public.sequences(id) on delete set null,
  step_position integer,
  sender_mailbox_id uuid references public.mailbox_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists unsubscribe_tokens_token_idx on public.unsubscribe_tokens (token);
create index if not exists unsubscribe_tokens_contact_idx on public.unsubscribe_tokens (contact_id);
alter table public.unsubscribe_tokens enable row level security;
create policy "members read tokens" on public.unsubscribe_tokens for select to authenticated using (public.is_org_member(organization_id));

-- Optional per-org toggle to double-check suppression before send.
