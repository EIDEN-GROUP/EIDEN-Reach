-- ============================================================================
-- EIDEN Reach -- CLEAR ALL WORKSPACE DATA EXCEPT INBOX
-- ----------------------------------------------------------------------------
-- Keeps only: organizations, memberships, profiles, mailbox_* (inbox pairing),
-- email_threads, email_messages, participants, locations, attachments.
-- All other data (CRM, sequences, templates, campaigns, jobs, logs, suppressions,
-- tasks, deals, leads, companies, contacts, etc.) is hard-deleted.
-- Safe to re-run (deletes only existing rows; guards dropped tables).
-- WARNING: IRREVERSIBLE.
-- ============================================================================
BEGIN;
DELETE FROM public.scheduled_job_attempts;
DELETE FROM public.scheduled_jobs;
DELETE FROM public.ai_action_logs;
DELETE FROM public.approval_records;
DELETE FROM public.automation_executions;
DELETE FROM public.domain_auth_checks;
DELETE FROM public.notes;
DELETE FROM public.audit_logs;
DELETE FROM public.enrollment_step_states;
DELETE FROM public.sequence_enrollments;
DELETE FROM public.sequence_steps;
DELETE FROM public.sequence_versions;
DELETE FROM public.sequence_template_steps;
DELETE FROM public.sequence_templates;
DELETE FROM public.suppression_records;
DELETE FROM public.sequences;
DELETE FROM public.email_templates;
DELETE FROM public.campaign_audience_members;
DELETE FROM public.campaigns;
DELETE FROM public.deal_stage_history;
DELETE FROM public.deals;
DELETE FROM public.tasks;
DELETE FROM public.activity_events;
DELETE FROM public.integration_credential_refs;
DELETE FROM public.integration_connections;
DELETE FROM public.contact_list_members;
DELETE FROM public.contact_lists;
DELETE FROM public.contacts;
DELETE FROM public.companies;
select 'contacts' as entity, count(*) as remaining from public.contacts
union all select 'companies', count(*) from public.companies
union all select 'sequences', count(*) from public.sequences
union all select 'sequence_templates', count(*) from public.sequence_templates
union all select 'email_templates', count(*) from public.email_templates
union all select 'email_threads', count(*) from public.email_threads
union all select 'email_messages', count(*) from public.email_messages
union all select 'mailbox_accounts', count(*) from public.mailbox_accounts
union all select 'send_attempts', count(*) from public.send_attempts
union all select 'activity_events', count(*) from public.activity_events;
COMMIT;
