-- ============================================================================
-- EIDEN Reach -- CLEAR ALL WORKSPACE DATA EXCEPT INBOX EMAILS
-- ----------------------------------------------------------------------------
-- WARNING: DESTRUCTIVE / IRREVERSIBLE. Keeps only the inbox (mailbox_*
-- accounts + email_threads / email_messages + participants, locations,
-- attachments). Everything else (CRM, sequences, campaigns, audit, tasks,
-- deals, suppressions, templates, jobs, ...) is hard-deleted.
--
-- Preserves: organizations, memberships, profiles, mailbox_accounts,
--   mailbox_folders (with cursors reset), mailbox_connection_rate_limits,
--   mailbox_access_grants, mailbox_credential_refs, email_threads,
--   email_messages, email_message_participants, email_message_locations,
--   email_attachments.
--
-- BEFORE RUNNING: take a full project backup; schema changes are NOT
-- captured by this script.
-- ----------------------------------------------------------------------------
-- CONFIRM BEFORE RUNNING: EXECUTE MANUALLY IN THE SUPABASE SQL EDITOR
-- ============================================================================

BEGIN;

-- Jobs + ai/cargo/governance logs
delete from public.scheduled_job_attempts;
delete from public.scheduled_jobs;
delete from public.notes;
delete from public.audit_logs;
delete from public.ai_action_logs;
delete from public.approval_records;
delete from public.automation_executions;
delete from public.domain_auth_checks;
delete from public.sequence_variants;

-- Sequence-related (junctions first)
delete from public.enrollment_step_states;
delete from public.sequence_enrollments;
delete from public.sequence_steps;
delete from public.sequence_versions;
delete from public.sequence_template_steps;
delete from public.sequence_templates;
delete from public.suppression_records;
delete from public.sequences;

-- Templates
delete from public.email_templates;

-- Campaigns
delete from public.campaign_audience_members;
delete from public.campaigns;

-- CRM relationships
delete from public.deal_stage_history;
delete from public.deals;
delete from public.tasks;
delete from public.activity_events;
delete from public.integration_credential_refs;
delete from public.integration_connections;

-- Companies -> contacts
delete from public.contact_list_members;
delete from public.contact_lists;
delete from public.contacts;
delete from public.companies;

-- Pipelines keep configuration (likely connector for analytical reporting)
-- (uncomment the two lines below if you also want to wipe pipeline schema)
-- delete from public.pipeline_stages;
-- delete from public.pipelines;

-- Mailbox cleanup: keep all inbox data, reset folder cursors so re-sync starts fresh.
update public.mailbox_folders
set last_synced_uid = 0, highest_synced_uid = 0, highest_seen_uid = 0,
    sync_state = 'not_started', last_sync_at = null, last_error_code = null;

-- Mailbox accounts kept (essential for sync; required by user).

-- Audit verification
select 'contacts'          as entity, count(*) as remaining from public.contacts
union all select 'companies'       , count(*) from public.companies
union all select 'sequences'       , count(*) from public.sequences
union all select 'sequence_templates', count(*) from public.sequence_templates
union all select 'email_templates'   , count(*) from public.email_templates
union all select 'email_threads'     , count(*) from public.email_threads
union all select 'email_messages'    , count(*) from public.email_messages
union all select 'email_attachments' , count(*) from public.email_attachments
union all select 'mailbox_accounts'   , count(*) from public.mailbox_accounts
union all select 'send_attempts'      , count(*) from public.send_attempts
union all select 'activity_events'    , count(*) from public.activity_events;

-- UNCOMMENT AFTER DOUBLE-CHECKING COUNTS
-- COMMIT;
-- COMMIT;

-- To actually commit: run COMMMIT;
-- COMMIT;
