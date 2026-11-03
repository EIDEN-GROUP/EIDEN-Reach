-- Enforce tenant boundaries on relationships, even if a caller guesses another
-- organization's UUID. Existing single-column FKs preserve null-on-delete behavior.
alter table public.companies add constraint companies_org_id_unique unique (organization_id, id);
alter table public.contacts add constraint contacts_org_id_unique unique (organization_id, id);
alter table public.pipelines add constraint pipelines_org_id_unique unique (organization_id, id);
alter table public.pipeline_stages add constraint pipeline_stages_pipeline_id_unique unique (pipeline_id, id);
alter table public.deals add constraint deals_org_id_unique unique (organization_id, id);
alter table public.tasks add constraint tasks_org_id_unique unique (organization_id, id);
alter table public.mailbox_accounts add constraint mailbox_accounts_org_id_unique unique (organization_id, id);
alter table public.email_threads add constraint email_threads_org_mailbox_id_unique unique (organization_id, mailbox_account_id, id);
alter table public.email_messages add constraint email_messages_org_mailbox_id_unique unique (organization_id, mailbox_account_id, id);
alter table public.email_templates add constraint email_templates_org_id_unique unique (organization_id, id);
alter table public.sequences add constraint sequences_org_id_unique unique (organization_id, id);
alter table public.sequence_enrollments add constraint enrollments_org_id_unique unique (organization_id, id);
alter table public.scheduled_jobs add constraint scheduled_jobs_org_id_unique unique (organization_id, id);

alter table public.companies add constraint companies_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id);
alter table public.contacts add constraint contacts_company_same_org_fk
  foreign key (organization_id, company_id) references public.companies (organization_id, id);
alter table public.contacts add constraint contacts_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id);
alter table public.deals add constraint deals_pipeline_same_org_fk
  foreign key (organization_id, pipeline_id) references public.pipelines (organization_id, id);
alter table public.deals add constraint deals_stage_same_pipeline_fk
  foreign key (pipeline_id, stage_id) references public.pipeline_stages (pipeline_id, id);
alter table public.deals add constraint deals_company_same_org_fk
  foreign key (organization_id, company_id) references public.companies (organization_id, id);
alter table public.deals add constraint deals_contact_same_org_fk
  foreign key (organization_id, primary_contact_id) references public.contacts (organization_id, id);
alter table public.deals add constraint deals_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id);
alter table public.tasks add constraint tasks_contact_same_org_fk
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id);
alter table public.tasks add constraint tasks_company_same_org_fk
  foreign key (organization_id, company_id) references public.companies (organization_id, id);
alter table public.tasks add constraint tasks_deal_same_org_fk
  foreign key (organization_id, deal_id) references public.deals (organization_id, id);
alter table public.tasks add constraint tasks_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id);
alter table public.mailbox_accounts add constraint mailbox_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id);
alter table public.email_threads add constraint threads_mailbox_same_org_fk
  foreign key (organization_id, mailbox_account_id) references public.mailbox_accounts (organization_id, id);
alter table public.email_messages add constraint messages_mailbox_same_org_fk
  foreign key (organization_id, mailbox_account_id) references public.mailbox_accounts (organization_id, id);
alter table public.email_messages add constraint messages_thread_same_mailbox_fk
  foreign key (organization_id, mailbox_account_id, thread_id)
  references public.email_threads (organization_id, mailbox_account_id, id);
alter table public.email_templates add constraint templates_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id);
alter table public.sequences add constraint sequences_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id);
alter table public.sequences add constraint sequences_sender_same_org_fk
  foreign key (organization_id, sender_mailbox_id) references public.mailbox_accounts (organization_id, id);
alter table public.sequence_enrollments add constraint enrollments_sequence_same_org_fk
  foreign key (organization_id, sequence_id) references public.sequences (organization_id, id);
alter table public.sequence_enrollments add constraint enrollments_contact_same_org_fk
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id);
alter table public.sequence_enrollments add constraint enrollments_owner_membership_fk
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id);
alter table public.suppression_records add constraint suppressions_contact_same_org_fk
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id);
alter table public.suppression_records add constraint suppressions_creator_membership_fk
  foreign key (organization_id, created_by) references public.memberships (organization_id, user_id);
alter table public.send_attempts add constraint send_attempt_contact_same_org_fk
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id);
alter table public.send_attempts add constraint send_attempts_org_id_unique unique (organization_id, id);
alter table public.email_events add constraint email_events_contact_same_org_fk
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id);
alter table public.email_events add constraint email_events_send_attempt_same_org_fk
  foreign key (organization_id, send_attempt_id) references public.send_attempts (organization_id, id);
alter table public.activity_events add constraint activity_contact_same_org_fk
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id);
alter table public.activity_events add constraint activity_company_same_org_fk
  foreign key (organization_id, company_id) references public.companies (organization_id, id);
alter table public.activity_events add constraint activity_deal_same_org_fk
  foreign key (organization_id, deal_id) references public.deals (organization_id, id);
alter table public.activity_events add constraint activity_task_same_org_fk
  foreign key (organization_id, task_id) references public.tasks (organization_id, id);
alter table public.activity_events add constraint activity_actor_membership_fk
  foreign key (organization_id, actor_id) references public.memberships (organization_id, user_id);
alter table public.audit_logs add constraint audit_actor_membership_fk
  foreign key (organization_id, actor_id) references public.memberships (organization_id, user_id);

alter table public.mailbox_folders add constraint mailbox_folders_account_id_unique unique (mailbox_account_id, id);
alter table public.email_message_locations add column organization_id uuid;
alter table public.email_message_locations add column mailbox_account_id uuid;
update public.email_message_locations l set organization_id = a.organization_id, mailbox_account_id = f.mailbox_account_id
  from public.mailbox_folders f join public.mailbox_accounts a on a.id = f.mailbox_account_id
  where f.id = l.folder_id;
alter table public.email_message_locations alter column organization_id set not null;
alter table public.email_message_locations alter column mailbox_account_id set not null;
alter table public.email_message_locations add constraint location_folder_same_mailbox_fk
  foreign key (mailbox_account_id, folder_id) references public.mailbox_folders (mailbox_account_id, id);
alter table public.email_message_locations add constraint location_message_same_mailbox_fk
  foreign key (organization_id, mailbox_account_id, message_id)
  references public.email_messages (organization_id, mailbox_account_id, id);

alter table public.email_attachments add column organization_id uuid;
alter table public.email_attachments add column mailbox_account_id uuid;
update public.email_attachments a set organization_id = e.organization_id, mailbox_account_id = e.mailbox_account_id
  from public.email_messages e where e.id = a.message_id;
alter table public.email_attachments alter column organization_id set not null;
alter table public.email_attachments alter column mailbox_account_id set not null;
alter table public.email_attachments add constraint attachment_message_same_mailbox_fk
  foreign key (organization_id, mailbox_account_id, message_id)
  references public.email_messages (organization_id, mailbox_account_id, id);

create trigger participants_org_immutable before update on public.email_message_participants for each row execute function public.prevent_organization_transfer();
create trigger locations_org_immutable before update on public.email_message_locations for each row execute function public.prevent_organization_transfer();
create trigger attachments_org_immutable before update on public.email_attachments for each row execute function public.prevent_organization_transfer();
create trigger mailbox_grants_org_immutable before update on public.mailbox_access_grants for each row execute function public.prevent_organization_transfer();
alter table public.mcp_authorization_grants add constraint mcp_grant_membership_fk
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id);

-- Recipient contacts and mailbox messages must belong to the same organization.
alter table public.email_message_participants add column organization_id uuid;
alter table public.email_message_participants add column mailbox_account_id uuid;
update public.email_message_participants p
  set organization_id = e.organization_id,
      mailbox_account_id = e.mailbox_account_id
  from public.email_messages e where e.id = p.message_id;
alter table public.email_message_participants alter column organization_id set not null;
alter table public.email_message_participants alter column mailbox_account_id set not null;
alter table public.email_message_participants
  add constraint participants_message_same_mailbox_fk foreign key (organization_id, mailbox_account_id, message_id)
  references public.email_messages (organization_id, mailbox_account_id, id);
alter table public.email_message_participants
  add constraint participants_contact_same_org_fk foreign key (organization_id, contact_id)
  references public.contacts (organization_id, id);

-- Prevent mailbox sharing grants from crossing organization boundaries.
alter table public.mailbox_access_grants add column organization_id uuid;
update public.mailbox_access_grants g
  set organization_id = a.organization_id
  from public.mailbox_accounts a where a.id = g.mailbox_account_id;
alter table public.mailbox_access_grants alter column organization_id set not null;
alter table public.mailbox_access_grants
  add constraint mailbox_grant_account_same_org_fk foreign key (organization_id, mailbox_account_id)
  references public.mailbox_accounts (organization_id, id);
alter table public.mailbox_access_grants
  add constraint mailbox_grant_user_membership_fk foreign key (organization_id, user_id)
  references public.memberships (organization_id, user_id);
alter table public.mailbox_access_grants
  add constraint mailbox_grant_actor_membership_fk foreign key (organization_id, granted_by)
  references public.memberships (organization_id, user_id);

create index email_participants_org_message_idx on public.email_message_participants (organization_id, message_id);
create index mailbox_access_org_user_idx on public.mailbox_access_grants (organization_id, user_id) where revoked_at is null;
