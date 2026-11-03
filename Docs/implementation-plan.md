# EIDEN Reach implementation plan

## Repository audit (2026-10-28)

The repository is a preview pack, not an application. `Docs/index.html` is a 127 KB single-file UI demonstration with 15 navigable illustrative screens. Its controls explicitly say they do not persist records or connect to providers. `Docs/design.md` is a detailed, reusable visual specification. The preview screenshots are reference artifacts. There was no root README, `AGENTS.md`, package manifest, application source, auth/database configuration, migration history, test setup, deployment configuration, or Git repository metadata at the workspace root. No secrets were read or reported.

### Reuse

- Preserve the preview and screenshots as product/design references.
- Reuse the evergreen, teal, neutral color tokens and responsive navigation direction from `Docs/design.md`.
- Start with Supabase/PostgreSQL because no existing data or identity architecture exists.

### Gaps and constraints

- No Supabase project URL/anon key or server-only credentials have been supplied.
- No email mailbox credentials, domain, or permission to test external sending are available.
- There is no configured Vercel or Cloudflare account/project.
- Vercel Hobby is not a suitable production plan for this internal business application; review current Vercel terms and choose a compliant paid plan before deployment.
- IMAP/SMTP are connection-oriented protocols. A short-lived Cloudflare Worker is not a persistent IMAP IDLE worker; use bounded scheduled polling and durable database cursor/job records. Validate Cloudflare plan limits and the chosen mail host before enabling processing.
- The workspace has no `.git` metadata, so Git status/diff and uncommitted-change checks are unavailable.
- Node is installed. Use `npm.cmd` in PowerShell because the `npm.ps1` shim is blocked by execution policy.
- Hostinger's published policy prohibits unsolicited email. The Hostinger adapter can support the connected mailbox and permitted solicited communication, but must not enable cold unsolicited sequence sending.

## Initial architecture

- React + TypeScript + Vite for a Vercel-compatible static frontend shell.
- Supabase Auth and PostgreSQL with versioned SQL migrations and row-level security. Browser code contains only the public anon key; service-role credentials must remain in trusted server/worker secrets.
- Database-backed organizations/memberships, CRM records, pipeline, tasks, activity and audit foundation.
- Keep mailbox credentials, message sync, sending, approvals and MCP authorization behind trusted server/worker services. They are deliberately not implemented as direct browser operations.
- A Cloudflare Worker dispatcher now polls the durable job table every 15 minutes and claims at most five jobs per invocation. It has no email handlers yet; unsupported job types are retried, never marked successful. PostgreSQL is authoritative. Queues are deferred because the current bounded poller does not need a second transport and Free queue retention is only 24 hours.
- Logo is a replaceable placeholder mark. The user will provide the official logo asset later.

## External platform checks (2026-10-28)

- Vercel documents Hobby for personal, non-commercial use, so it is not an appropriate production plan for this internal sales application. Hobby cron runs at most once per day with up to an hour of timing variance. Use Vercel Pro or another compliant business deployment plan for production and do not use Vercel cron for frequent mailbox polling. ([Hobby plan](https://vercel.com/docs/plans/hobby), [cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing))
- Cloudflare Workers Free currently documents 100,000 requests/day, 10 ms CPU per request, 128 MB memory, six simultaneous outgoing connections per request, and five Cron Triggers per account. Cron invocations have up to 15 minutes wall time but only the 10 ms Free CPU allowance. ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/))
- Cloudflare Queues Free currently includes 10,000 operations/day, with 24-hour non-configurable retention. PostgreSQL must own scheduled job state, retries, due times, and idempotency; queue payloads are only wake-up hints. Use bounded batches and cursor-based processing. ([Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [Queues limits](https://developers.cloudflare.com/queues/platform/limits/))
- Workers supports outbound TCP sockets, including application protocols, but blocks outbound TCP port 25. Hostinger lists IMAP TLS port 993 and SMTP TLS port 465 (or STARTTLS 587). SMTP on those ports is technically distinct from port 25; a real end-to-end connection test is still required. ([Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/), [Hostinger connection settings](https://www.hostinger.com/support/4305847-set-up-hostinger-email-on-your-applications-and-devices/))
- Hostinger allows legal, solicited email within account limits and prohibits unsolicited email/spam. The Hostinger adapter must be limited to recipients with documented permission consistent with provider terms and applicable markets. Cold unsolicited sequence sending must not be enabled over Hostinger SMTP. Hostinger Business Starter/Premium list 1,000/3,000 messages per rolling 24 hours, but limits can change and count recipients and incoming/outgoing activity; verify the purchased plan in hPanel before enabling sends. ([Hostinger mass-mailing policy](https://www.hostinger.com/support/1583510-is-mass-mailing-supported-at-hostinger/), [Hostinger account limits](https://support.hostinger.com/en/articles/4625828-parameters-and-limits-of-hostinger-email))
- Supabase requires explicit grants as well as RLS on exposed tables, and a pinned empty search path for `SECURITY DEFINER` functions. The migration follows that model; policy tests are still required before production. ([Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions))

## Phases and current state

1. **Audit and foundation:** repository audited; responsive React shell, password sign-in/out, organization-aware workspace label, role-gated navigation, contact create/search/pagination/detail/edit/archive and company association, database-recorded contact activity timeline, company create/search/pagination/detail/edit/archive with industry/location/employee count, task creation/completion with CRM relationships, deal create/edit/archive/details with linked company/contact, next action and close date, database-recorded deal activity and stage history, and a role-checked Team & Audit UI/Edge Function are implemented. Team administration uses server-only Auth administration, role checks and a transactional membership/audit RPC. The SQL foundation covers CRM, mailbox metadata/messages, sequences, suppressions, durable jobs, campaigns, send events and MCP grant metadata, with RLS and tenant relationship constraints.
2. **CRM completion:** implement administrator invitation/onboarding and organization membership management, then lists, contact/company editing/archive/search/pagination, activity timelines, task relations and deal details; add scenario tests.
3. **Mailbox:** trusted Worker connection setup is implemented for Hostinger-compatible IMAP/SMTP authentication; credentials are encrypted at rest in a dedicated table and never returned to the browser. Inbox UI reports connection/sync state. Connection flow is not yet verified against a controlled real mailbox because no credentials or Supabase runtime are configured. Incremental polling, provider folder/message sync, safe MIME rendering, threading, composition, drafts and send are pending. Workers Free's 10 ms CPU budget may be too small for two TLS handshakes; measure with a controlled mailbox and move this operation to a compatible paid Worker/runtime if it consistently exceeds that bound.
4. **Sequences and workers:** implement job handlers, idempotent enrollment/dispatch, final suppression checks, business-hour scheduling and rate limits. Durable job schema and dispatch leases exist; no email handlers are enabled. Validate current Cloudflare plan/provider terms first.
5. **Automation/analytics:** idempotent inbound activity, reply stop rules, tasks, permission-aware metrics and honest provider capability reporting.
6. **MCP/prospecting:** authenticated, audited tools through shared business services; read-only tools before approval-gated writes; licensed enrichment only after provider authorization.

## Next tasks

1. Configure a development Supabase project, invite the first administrator and create the organization/membership records using the documented admin-only procedure.
2. Configure and verify the team function in a local Supabase stack, then add company timelines, task assignment workflows, contextual notes and deeper CRM tests. Contact search currently covers first name, last name and email only; saved views, list membership, bulk actions and exports remain unimplemented.
3. Run Supabase pgTAP/schema tests in a local Supabase stack; eleven application tests, TypeScript checking and the production frontend build are the current checks. SQL tests are authored but not run.
4. Apply the mailbox credential migration in local Supabase and configure the mailbox Worker secrets. Test IMAP/SMTP authentication against a controlled Hostinger mailbox, including whether the Cloudflare Free CPU bound accommodates both TLS sessions. Then implement bounded incremental folder/message synchronization, MIME safety and the mailbox UI. Do not enable send until a provider policy and controlled send test are reviewed.
5. Build a sequence editor and transactional enrollment/stop-rule service, then concrete worker handlers after validating provider policy and limits.
