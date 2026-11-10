# EIDEN Reach

EIDEN Reach is an early-stage sales workspace for EIDEN. The design reference and initial product audit live in [`Docs/design.md`](Docs/design.md) and [`Docs/implementation-plan.md`](Docs/implementation-plan.md). The existing interactive preview remains in [`Docs/index.html`](Docs/index.html); it is illustrative and does not connect to live data.

## The logo

The EIDEN Reach mark pairs a sweeping precision arc with two nodes — an evergreen origin and a coral arrival — forming a subtle abstract **R** for **Reach**. It is drawn as vector masters in [`brand/`](brand/) and reproduced here for reference:

| Element | Meaning |
|---|---|
| **The Nodes (Point A → Point B)** | The two distinct circles represent the core of contact management: the sales professional (Point A) and the ideal prospect (Point B). The shift from **Deep Evergreen** to **Coral** signifies a successful conversion — moving a contact from a cold lead to a closed deal. On dark surfaces, both nodes and the arc render in cream, with Point B in coral. |
| **The Precision Arc** | Rather than a heavy, traditional chain link for "connection", the sweeping arc visualizes a frictionless, aerodynamic trajectory. It represents the automated sequences and intelligent routing of EIDEN Reach — outreach as a direct, unimpeded path rather than a manual slog. |
| **The Abstract 'R'** | The composition of the diagonal nodes and the curved path creates a subtle nod to the letter **R** for Reach. The negative space beneath the upper curve loosely forms the bowl and leg of the letter, embedding the brand identity in the geometry without being overly literal. |
| **The Kinetic Energy** | The diagonal tilt gives the mark forward momentum. It feels active and mathematical — a workspace built on AI, data and precision to drive business forward. |

**Palette:** Deep Evergreen `#123E39` (Point A / arc / dark brand surface), Coral `#C94F2E` (Point B / primary action), Warm Cream `#FAF7EF` (canvas / on-dark mark), Ink `#26232F` (primary text). Monochrome cut (`brand/eiden-reach-mark-mono.svg`) for print and one-colour use. Files: `eiden-reach-mark.svg` (light surfaces), `eiden-reach-mark-on-dark.svg` (dark surfaces), `eiden-reach-mark-mono.svg` (single-colour), `eiden-reach-horizontal.svg` (lockup), `public/favicon.svg` + `public/apple-touch-icon.png`, and `public/favicon.svg` as the in-app icon.

## Local development

1. Install Node.js 20.19+ or 22.12+ and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set a development Supabase project URL and public anon key.
4. Apply the versioned migrations in `supabase/migrations` to a new development Supabase project.
5. Run `npm run dev`.

After applying the migrations, invite an initial Auth user in the Supabase Dashboard. The auth trigger creates that user's profile. Then use the SQL Editor with an administrator credential to create the organization and assign the invited user's UUID a `super_admin` membership. Creating the organization also creates its default pipeline stages. This bootstrap is manual because the first administrator has no existing workspace role to authorize a browser request. Do not expose the SQL Editor or service-role credentials to application users.

The Team & Audit page uses the authenticated `team-admin` Supabase Edge Function. Before enabling it, deploy that function and configure the server-side `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `APP_ORIGIN` secrets in Supabase. Configure Supabase Auth email delivery and allow the app origin in Auth redirect URLs so invitation links return to EIDEN Reach. The function verifies the caller's session and role, uses a service credential only on the server, and limits each administrator to 20 invite attempts per workspace per UTC day. A manager can invite representatives and analysts; only a super administrator can assign administrator roles.

The Inbox currently supports a tested-then-save mailbox connection workflow through `workers/mailbox` and Hostinger's published IMAP/SMTP endpoints. Set `VITE_MAILBOX_WORKER_URL` to its HTTPS URL. Configure the Worker secrets listed in [`workers/mailbox/README.md`](workers/mailbox/README.md), then apply migrations including `202610280008_mailbox_credentials.sql`. The Worker validates the signed-in user and workspace role, rate-limits connection checks in PostgreSQL, verifies IMAP TLS and SMTP authentication, and stores only AES-GCM-encrypted mailbox credentials. It does not yet synchronize folders/messages or send email. Never configure a production Worker URL over plain HTTP.

Without Supabase configuration the app still starts in setup mode and does not display fabricated business records. Never put a service-role key, mailbox password, OAuth refresh token or encryption key in a `VITE_` variable. Trusted backend/worker credentials belong in the server platform's secret store.

## Current implementation boundary

The application shell, Supabase password sign-in/out, organization-scoped contacts and companies with search, pagination, detail/edit/archive and relationships, database-recorded contact activity, contextual notes on contacts/companies/deals, reusable contact lists (leads & lists) with membership management, email template management, sequences and campaigns management, analytics, integrations status, settings, tasks with contact/company/deal relations, a deal board with linked records, edit/archive, next actions and database-recorded stage history, and a role-checked Team & Audit Edge Function/UI are present. The Inbox offers mailbox connection setup, folder sync skeleton and a read-only synced-message view. Team invitations and mailbox connections require their functions/workers, migrations and provider configuration. Folder/message synchronization, MIME display, threading, composition, sending, reply processing, prospecting, and deployment remain incomplete. A minimal read-only MCP server skeleton is available under `mcp/`. Do not treat the app as a complete CRM or email integration.

No migrations are applied automatically. Never run these development migrations against production without a reviewed deployment procedure.

Run `npm test` for input-validation tests, `npm run typecheck` for TypeScript checks and `npm run build` for the frontend build. PostgreSQL migration tests under `supabase/tests` require a local Supabase stack and have not run in this workspace.
