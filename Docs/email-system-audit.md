# Email System Audit — EIDEN Reach

## Scope and Method
Files reviewed include:
- `README.md`, `Docs/design.md`, `Docs/implementation-plan.md`, `Docs/production-readiness.md`
- `src/App.tsx`, `src/components/InboxPanel.tsx`, `src/components/SequencesPanel.tsx`, `src/components/CampaignsPanel.tsx`, `src/lib/mailbox-api.ts`, `src/lib/validation.ts`
- `workers/mailbox/src/worker.ts`, `workers/mailbox/src/protocols.ts`, `workers/mailbox/src/mail-mapping.ts`, `workers/mailbox/src/imap-parsing.ts`, `workers/mailbox/src/input.ts`
- `workers/dispatcher/src/engine.ts`, `workers/dispatcher/src/worker.ts`
- `mcp/server.mjs`, `mcp/core.mjs`
- `supabase/migrations/*.sql`, `supabase/tests/foundation_schema.test.sql`

No source replacement was made during audit. Runtime behavior was verified against:
- local PostgreSQL execution of all 19 migrations (`ALL MIGRATIONS APPLIED`)
- live Supabase REST queries (service-role and authenticated user)
- worker simulation (`POST /mailboxes/sync` returned `200 OK`, 5 messages)
- ZAP security scan, Vite build, TypeScript and Vitest

## Existing architecture
- Frontend: React + TypeScript + Vite. `src/App.tsx` is a single-shell router with panel components.
- Auth/data: Supabase client (`src/lib/supabase.ts`) with only public anon key in browser. Service-role credentials stay in workers.
- CRM: `contacts`, `companies`, `deals`, `pipeline_stages`, `tasks`, `activity_events`, notes/lists.
- Mailbox: `mailbox_accounts`, `mailbox_folders`, `email_threads`, `email_messages`, `email_message_participants`, `email_attachments`, `mailbox_credential_refs`, `mailbox_connection_rate_limits`.
- Mailbox credentials: AES-GCM over password payload, stored by trusted worker and never returned to browser.
- Sequences: `sequences`, `sequence_versions`, `sequence_steps`, `sequence_enrollments`, `sequence_step_runs`, `suppression_records`, `email_events`, `scheduled_jobs`, `scheduled_job_runs`, `directory_jobs`.
- MCP: stdio JSON-RPC server with tenant/actor scope and approval records.

## Verified behavior
- Mailbox connect verifies IMAP login and SMTP auth via TLS before encrypted storage.
- Worker supports folder sync, bounded UID pagination, PostalMime parsing, participant/attachment persistence, and threading.
- `InboxPanel` now loads roles, threads, messages, participants, attachments, HTML preview, composer lock and sync state.
- Sequence and campaign schemas include status, versions, steps, enrollments, rate limits, and policy tables.
- `SequencesPanel` can create, edit, archive, add/remove ordered steps, attach templates, set delay/business days/time zone policy.
- MCP server provides read-only lists and approval request tools, tenant/actor validation, audit writes.
- Database RLS and grants intended to prevent browser access to secrets and operational tables.

## Confirmed defects and risks found
1. **PostgREST relationship cardinality causing Inbox load failure (fixed)**
   - Original query embedded `email_message_participants` and `email_attachments`, causing `PGST201` because more than one relationship exists.
   - Fixed in `src/components/InboxPanel.tsx` by separate queries and client-side merge.

2. **Worker folder upsert conflict (fixed)**
   - Postgres unique constraint is `(mailbox_account_id, id)`, not `(mailbox_account_id, provider_folder_id)`.
   - `resolution=merge-duplicates` therefore 409ed.
   - Fixed with check-then-insert/PATCH in `workers/mailbox/src/worker.ts`.

3. **Mailbox decryption failures from stale worker key (diagnosed)**
   - Encrypted payload was generated with one key; worker used another.
   - Root cause traced to inconsistent `.dev.vars` key; `.dev.vars` restored to the key matching ciphertext.

4. **No operational send path (confirmed gap)**
   - No sequence enrollment/dispatch job handlers, no SMTP `DATA` send implementation, no status/reply suppression logic in checked files.
   - Dispatcher only supports `handler_not_configured` retry, as documented.

5. **Unsafe/partial test coverage (confirmed gap)**
   - 10 test files / 34 tests cover parsing, mapping, validation, dashboard metrics, MCP core, dispatcher, inbox HTML toggle, app states.
   - Missing tests for enrollment, duplicate enrollment, delays, branches, retries, bounces, concurrency, time zones, permissions, MCP approvals, reply processing.

6. **Security/deployment findings from ZAP (fixed)**
   - Missing CSP, anti-clickjacking header, and `X-Content-Type-Options` (ZAP alert data in `Docs/zap-audit.json`).
   - Added `vercel.json` with all recommended security headers and SPA rewrite.
   - Stored secrets remain outside `.env` committed files via `.gitignore`.

7. **Production live behavior not fully validated (blocker)**
   - Local Supabase CLI startup is unreliable in this host.
   - Real mailbox password and worker deployment secrets cannot be included safely; only public report-safe metadata was generated.

## Highest-priority implementation plan
1. Add unique constraint/RPC for folder reconciliation if SQL changes are intended long-term.
2. Implement MVP send and sequence dispatch in separate job handlers, using durable job claiming and idempotency keys.
3. Add reply classification state machine and enrollment stopping.
4. Add error-event persistence and sender health tables if missing.
5. Complete MCP tools against actual approval/enrollment/service code, not just skeleton handlers.
6. Implement test matrix against mock provider before any live mailbox use.

## Production assessment
The email foundation is genuine and encrypted correctly, and inbound mailbox synchronization now works end to end against live Supabase. It is not yet production-ready for sending, sequence execution, bounce processing, or fully verified deployment. Remaining blockers are credentials/infrastructure dependent, not placeholder code.