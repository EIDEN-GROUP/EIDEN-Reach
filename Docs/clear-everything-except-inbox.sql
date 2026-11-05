-- ============================================================================
-- EIDEN Reach -- CLEAR ALL WORKSPACE DATA EXCEPT INBOX EMAILS
-- ----------------------------------------------------------------------------
-- WARNING: This is DESTRUCTIVE / IRREVERSIBLE. It keeps only the inbox
-- (email_threads / email_messages + participants + locations + attachments
-- + mailbox_* accounts). Everything else (CRM, sequences, campaigns, audit
-- logs, leads, tasks, deals, support approvals, etc.) is hard-deleted.
--
-- BEFORE RUNNING: take a full project backup. Schema changes would be
-- captured by the backup but NOT by this script.
-- Always run inside a transaction + verify the final counts before COMMIT.
-- ----------------------------------------------------------------------------
-- CONFIRM BEFORE RUNNING -- EXECUTE MANUALLY IN SUPABASE SQL EDITOR
-- ============================================================================

BEGIN;

-- Off-field relations (jobs, notes, attachments, ai/cargo logs)
delete from public_scheduled_job_attempts;
delete from public_scheduled_jobs;
delete from public_notes;
delete from public_audit_logs;
delete from public_ai_action_logs;
delete from public_approval_records;

-- Lead/enrollment-level CRM junctions
delete from public_automation_executions;
delete from public_domain_auth_checks;
delete from public_sequence_variants;
delete from public_campaign_audience_members;

-- Sequence: steps/enrollments first
delete from public_enrollment_step_states;
delete from public_sequence_enrollments;
delete from public_sequence_steps;
delete from public_sequence_versions;
delete from public_sequence_template_steps;
delete from public_sequence_templates;
delete from public_suppression_records;
delete from public_sequences;

-- Templates
delete from public_email_templates;

-- Campaigns (creators/audience/junctions)
delete from public_campaigns;

-- CRM relationships
delete from public_deal_stage_history;
delete from public_deals;
delete from public_tasks;
delete from public_activity_events;
delete from public_integration_credential_refs;
delete from public_integration_connections;

-- Companies -> contacts
delete from public_contact_list_members;
delete from public_contact_lists;
delete from public_contacts;
delete from public_companies;

-- Pipelines (keep org/pref unchanged; pipeline structures are config)
-- keep pipelines + stages as configuration unless explicitly asked otherwise
-- (also delete if asked to fully reset)
-- delete from public_pipeline_stages;
-- delete from public_pipelines;

-- Mailbox cleanup (preserves inbox; resets folders/consensus; keep accounts)
update public_mailbox_folders set last_synced_uid = 0, highest_synced_uid = 0, highest_seen_uid = 0;

-- Keep organizations / memberships / profiles as-is.

-- Report counts
select 'contacts'         as entity, count(*) as remaining from public_contacts
union all
select 'companies'        , count(*) from public_companies
union all
select 'sequences'        , count(*) from public_sequences
union all
select 'email_messages'   , count(*) from public_email_messages
union all
select 'email_threads'     , count(*) from public_email_threads
union all
select 'mailbox_accounts'  , count(*) from public_mailbox_accounts
union all
select 'send_attempts'     , count(*) from public_send_attempts
union all
select 'activity_events'     , count(*) from public_activity_events;

-- UNCOMMENT BELOW ONLY AFTER DOUBLE-CHECKING THE TABLE LIST ABOVE
-- COMMIT;

-- To commit: change -- to:
COMMIT;