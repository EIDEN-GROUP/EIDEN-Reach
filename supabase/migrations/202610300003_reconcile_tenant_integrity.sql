-- Reconcile projects where migration history was repaired without executing
-- every tenant-integrity statement. This migration is idempotent on a fresh schema.
create or replace function pg_temp.add_constraint_if_missing(
  target_table regclass,
  constraint_name text,
  definition text
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = target_table and conname = constraint_name
  ) then
    execute format('alter table %s add constraint %I %s', target_table, constraint_name, definition);
  end if;
end;
$$;

select pg_temp.add_constraint_if_missing('public.companies', 'companies_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.contacts', 'contacts_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.pipelines', 'pipelines_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.pipeline_stages', 'pipeline_stages_pipeline_id_unique', 'unique (pipeline_id, id)');
select pg_temp.add_constraint_if_missing('public.deals', 'deals_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.tasks', 'tasks_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.mailbox_accounts', 'mailbox_accounts_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.email_threads', 'email_threads_org_mailbox_id_unique', 'unique (organization_id, mailbox_account_id, id)');
select pg_temp.add_constraint_if_missing('public.email_messages', 'email_messages_org_mailbox_id_unique', 'unique (organization_id, mailbox_account_id, id)');
select pg_temp.add_constraint_if_missing('public.email_templates', 'email_templates_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.sequences', 'sequences_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.sequence_enrollments', 'enrollments_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.scheduled_jobs', 'scheduled_jobs_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.send_attempts', 'send_attempts_org_id_unique', 'unique (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.mailbox_folders', 'mailbox_folders_account_id_unique', 'unique (mailbox_account_id, id)');

select pg_temp.add_constraint_if_missing('public.companies', 'companies_owner_membership_fk', 'foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.contacts', 'contacts_company_same_org_fk', 'foreign key (organization_id, company_id) references public.companies (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.contacts', 'contacts_owner_membership_fk', 'foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.deals', 'deals_pipeline_same_org_fk', 'foreign key (organization_id, pipeline_id) references public.pipelines (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.deals', 'deals_stage_same_pipeline_fk', 'foreign key (pipeline_id, stage_id) references public.pipeline_stages (pipeline_id, id)');
select pg_temp.add_constraint_if_missing('public.deals', 'deals_company_same_org_fk', 'foreign key (organization_id, company_id) references public.companies (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.deals', 'deals_contact_same_org_fk', 'foreign key (organization_id, primary_contact_id) references public.contacts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.deals', 'deals_owner_membership_fk', 'foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.tasks', 'tasks_contact_same_org_fk', 'foreign key (organization_id, contact_id) references public.contacts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.tasks', 'tasks_company_same_org_fk', 'foreign key (organization_id, company_id) references public.companies (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.tasks', 'tasks_deal_same_org_fk', 'foreign key (organization_id, deal_id) references public.deals (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.tasks', 'tasks_owner_membership_fk', 'foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.mailbox_accounts', 'mailbox_owner_membership_fk', 'foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.email_threads', 'threads_mailbox_same_org_fk', 'foreign key (organization_id, mailbox_account_id) references public.mailbox_accounts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.email_messages', 'messages_mailbox_same_org_fk', 'foreign key (organization_id, mailbox_account_id) references public.mailbox_accounts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.email_messages', 'messages_thread_same_mailbox_fk', 'foreign key (organization_id, mailbox_account_id, thread_id) references public.email_threads (organization_id, mailbox_account_id, id)');
select pg_temp.add_constraint_if_missing('public.email_templates', 'templates_owner_membership_fk', 'foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.sequences', 'sequences_owner_membership_fk', 'foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.sequences', 'sequences_sender_same_org_fk', 'foreign key (organization_id, sender_mailbox_id) references public.mailbox_accounts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.sequence_enrollments', 'enrollments_sequence_same_org_fk', 'foreign key (organization_id, sequence_id) references public.sequences (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.sequence_enrollments', 'enrollments_contact_same_org_fk', 'foreign key (organization_id, contact_id) references public.contacts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.sequence_enrollments', 'enrollments_owner_membership_fk', 'foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.suppression_records', 'suppressions_contact_same_org_fk', 'foreign key (organization_id, contact_id) references public.contacts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.suppression_records', 'suppressions_creator_membership_fk', 'foreign key (organization_id, created_by) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.send_attempts', 'send_attempt_contact_same_org_fk', 'foreign key (organization_id, contact_id) references public.contacts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.email_events', 'email_events_contact_same_org_fk', 'foreign key (organization_id, contact_id) references public.contacts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.email_events', 'email_events_send_attempt_same_org_fk', 'foreign key (organization_id, send_attempt_id) references public.send_attempts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.activity_events', 'activity_contact_same_org_fk', 'foreign key (organization_id, contact_id) references public.contacts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.activity_events', 'activity_company_same_org_fk', 'foreign key (organization_id, company_id) references public.companies (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.activity_events', 'activity_deal_same_org_fk', 'foreign key (organization_id, deal_id) references public.deals (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.activity_events', 'activity_task_same_org_fk', 'foreign key (organization_id, task_id) references public.tasks (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.activity_events', 'activity_actor_membership_fk', 'foreign key (organization_id, actor_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.audit_logs', 'audit_actor_membership_fk', 'foreign key (organization_id, actor_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.mcp_authorization_grants', 'mcp_grant_membership_fk', 'foreign key (organization_id, user_id) references public.memberships (organization_id, user_id)');

alter table public.email_message_locations add column if not exists organization_id uuid;
alter table public.email_message_locations add column if not exists mailbox_account_id uuid;
update public.email_message_locations location
set organization_id = account.organization_id,
    mailbox_account_id = folder.mailbox_account_id
from public.mailbox_folders folder
join public.mailbox_accounts account on account.id = folder.mailbox_account_id
where folder.id = location.folder_id
  and (location.organization_id is null or location.mailbox_account_id is null);
alter table public.email_message_locations alter column organization_id set not null;
alter table public.email_message_locations alter column mailbox_account_id set not null;
select pg_temp.add_constraint_if_missing('public.email_message_locations', 'location_folder_same_mailbox_fk', 'foreign key (mailbox_account_id, folder_id) references public.mailbox_folders (mailbox_account_id, id)');
select pg_temp.add_constraint_if_missing('public.email_message_locations', 'location_message_same_mailbox_fk', 'foreign key (organization_id, mailbox_account_id, message_id) references public.email_messages (organization_id, mailbox_account_id, id)');

alter table public.email_attachments add column if not exists organization_id uuid;
alter table public.email_attachments add column if not exists mailbox_account_id uuid;
update public.email_attachments attachment
set organization_id = message.organization_id,
    mailbox_account_id = message.mailbox_account_id
from public.email_messages message
where message.id = attachment.message_id
  and (attachment.organization_id is null or attachment.mailbox_account_id is null);
alter table public.email_attachments alter column organization_id set not null;
alter table public.email_attachments alter column mailbox_account_id set not null;
select pg_temp.add_constraint_if_missing('public.email_attachments', 'attachment_message_same_mailbox_fk', 'foreign key (organization_id, mailbox_account_id, message_id) references public.email_messages (organization_id, mailbox_account_id, id)');

alter table public.email_message_participants add column if not exists organization_id uuid;
alter table public.email_message_participants add column if not exists mailbox_account_id uuid;
update public.email_message_participants participant
set organization_id = message.organization_id,
    mailbox_account_id = message.mailbox_account_id
from public.email_messages message
where message.id = participant.message_id
  and (participant.organization_id is null or participant.mailbox_account_id is null);
alter table public.email_message_participants alter column organization_id set not null;
alter table public.email_message_participants alter column mailbox_account_id set not null;
select pg_temp.add_constraint_if_missing('public.email_message_participants', 'participants_message_same_mailbox_fk', 'foreign key (organization_id, mailbox_account_id, message_id) references public.email_messages (organization_id, mailbox_account_id, id)');
select pg_temp.add_constraint_if_missing('public.email_message_participants', 'participants_contact_same_org_fk', 'foreign key (organization_id, contact_id) references public.contacts (organization_id, id)');

alter table public.mailbox_access_grants add column if not exists organization_id uuid;
update public.mailbox_access_grants access_grant
set organization_id = account.organization_id
from public.mailbox_accounts account
where account.id = access_grant.mailbox_account_id
  and access_grant.organization_id is null;
alter table public.mailbox_access_grants alter column organization_id set not null;
select pg_temp.add_constraint_if_missing('public.mailbox_access_grants', 'mailbox_grant_account_same_org_fk', 'foreign key (organization_id, mailbox_account_id) references public.mailbox_accounts (organization_id, id)');
select pg_temp.add_constraint_if_missing('public.mailbox_access_grants', 'mailbox_grant_user_membership_fk', 'foreign key (organization_id, user_id) references public.memberships (organization_id, user_id)');
select pg_temp.add_constraint_if_missing('public.mailbox_access_grants', 'mailbox_grant_actor_membership_fk', 'foreign key (organization_id, granted_by) references public.memberships (organization_id, user_id)');

drop trigger if exists participants_org_immutable on public.email_message_participants;
create trigger participants_org_immutable before update on public.email_message_participants for each row execute function public.prevent_organization_transfer();
drop trigger if exists locations_org_immutable on public.email_message_locations;
create trigger locations_org_immutable before update on public.email_message_locations for each row execute function public.prevent_organization_transfer();
drop trigger if exists attachments_org_immutable on public.email_attachments;
create trigger attachments_org_immutable before update on public.email_attachments for each row execute function public.prevent_organization_transfer();
drop trigger if exists mailbox_grants_org_immutable on public.mailbox_access_grants;
create trigger mailbox_grants_org_immutable before update on public.mailbox_access_grants for each row execute function public.prevent_organization_transfer();

create index if not exists email_participants_org_message_idx on public.email_message_participants (organization_id, message_id);
create index if not exists mailbox_access_org_user_idx on public.mailbox_access_grants (organization_id, user_id) where revoked_at is null;
