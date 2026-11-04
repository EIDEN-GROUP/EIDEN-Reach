# EIDEN Reach — System Overview & How It Works

> Sales workspace that turns a prospect into a conversation, a qualified opportunity, and a customer — without manually emailing every few days.

## 1. What it is

**EIDEN Reach** is a multi-tenant B2B sales engagement platform:
- **CRM**: contacts, companies, deals, tasks, activities
- **Mailbox**: IMAP sync + reply detection + SMTP send via a Cloudflare Worker
- **Sequences**: multi-step automated follow-up with automatic stop on reply
- **Analytics**: pipeline + outreach KPIs (reply/bounce/completion/failure)
- **Templates**: reusable email content with merge fields (`{{first_name}}`, `{{company}}`, …)

## 2. Motivation — why it exists

Manual follow-up fails:
- People forget → deals die
- Generic blasts → spam complaints and low reply rates
- Emailing after a reply → looks unprofessional
- Continuing after unsubscribe/bounce → compliance risk

The guide (`M:\plan\eiden-reach\full-guide.txt`) sets the bar: a *good* sequence is relevant, differently-purposed per step, reasonably spaced, stops on reply, respects opt-outs, tracks real outcomes, uses verified data, controlled limits, clear ownership, and a full audit trail.

Goal: **create relevant conversations, not maximize volume.**

## 3. Architecture

```
┌──────────────────────────────────────────────┐
│ Frontend (React + TS + Tailwind)             │
│ http://localhost:5173                        │
│ Overview / Inbox / Contacts / Sequences /    │
│ Analytics / Pipeline / etc.                  │
└──────────────┬───────────────────────────────┘
               │ fetch (Supabase client)
               ▼
┌──────────────────────────────────────────────┐
│ Supabase (Postgres + Auth + RLS)             │
│ organizations / memberships / contacts /     │
│ companies / sequences / sequence_steps /     │
│ sequence_enrollments / enrollment_step_states│
│ activity_events / suppression_records /      │
│ email_templates / mailbox_accounts           │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│ Mailbox Worker (Cloudflare)                  │
│ http://127.0.0.1:8787                       │
│ - IMAP sync (fetch new messages)             │
│ - SMTP send (submit emails)                  │
│ - Reply detection → stop enrollment          │
│ - Slack notify (webhook)                     │
│ - Encrypted credential vault                 │
└──────────────────────────────────────────────┘
               │
               ▼
        IMAP/SMTP servers (Hostinger, etc.)
               │
               ▼
        Recipient inbox → reply → IMAP sync → pause/stop
```

**Key packages:**
- Frontend: `React, TypeScript, Tailwind CSS`
- Backend: `Supabase (Postgres), Cloudflare Workers (Wrangler)`
- Testing: `Vitest (35 tests), Playwright (E2E)`
- Version control: `GitHub main`

## 4. Data flow — end to end

### 4.1 User signs in
1. Supabase Auth → session issued
2. Frontend loads membership → `organization_id`
3. RLS scopes every query to the org — teams cannot see each other's data

### 4.2 Create a sequence
1. User clicks **"Use 5-email template"** (Standard B2B Outreach, 20 days)
2. System creates 5 templates if missing (`MeetIntroDay1`, `MeetFollow1Day4`, … `MeetCloseDay20`)
3. `create_sequence_with_version` RPC creates `sequences` row + `sequence_versions`
4. Five `sequence_steps` inserted with delays: Day 1 → 0 min, Day 4 → 3 days, Day 8 → 4 days, Day 13 → 5 days, Day 20 → 7 days
5. User selects **sender mailbox** (Sales / contact / employee) and **daily limit**
6. **Preflight panel** validates: SENDER, MAILBOX, STATUS, STEPS, DAILY LIMIT, ENROLLMENTS, STOP RULES, ADVANCED — all must be ✓ before activation

### 4.3 Enroll a contact
1. Enrolled manually (contact picker) or bulk
2. Eligibility check: email exists, not unsubscribed, not hard-bounced, not suppressed, not already enrolled, personalization fields present
3. Duplicate protection: unique index `enrollment_one_live_per_contact` prevents double-enrollment in the same sequence
4. Enrollment state: `active`, `next_run_at = now`, `next_step_position = 0`, `sequence_version = current`

### 4.4 Scheduling engine
- Cron / background worker claims due enrollments (`next_run_at <= now`, state in active/waiting/pending)
- `enrollment_due_idx` index speeds this
- Before sending: re-checks suppression, unsubscribe, reply, bounce, pause, company rules, mailbox health
- Respects: **business days only**, **contact time zone**, **sending window (9–17 local)**, **daily limits**

### 4.5 Email send
1. Render template with merge fields: `{{first_name}}`, `{{company}}`, `{{sender_name}}`, etc.
2. Worker `POST /mailboxes/test-send` → SMTP submit
3. Store provider response, message ID, timestamp in `activity_events`
4. Events: `sequence.email_sent`, `sequence.reply_received`, etc.
5. Schedule next step (advance `next_step_position`, set `next_run_at`)

### 4.6 Reply detection (the critical stop)
1. Worker syncs IMAP → new message lands in `mailbox_messages`
2. `worker-reply.ts` matches reply to enrollment:
   - **Positive** → stop, mark Interested, create task, Slack notify
   - **Negative** → stop, mark Not Interested, suppress re-enrollment
   - **OOO/autoresponder** → pause, save return date, resume later
   - **Hard bounce** → stop, mark Invalid, suppress
   - **Unsubscribe/complaint** → stop, global suppression
   - **Company-level** → also stop other contacts at same company (configurable)
3. `stopEnrollmentsForReply` + `reconcileReplyStoppedEnrollments` update enrollment state to `replied` with `stop_reason = reply_received`
4. Frontend shows **Replied: 1** chip in Sequences enrollments table

### 4.7 Analytics / KPIs
| KPI | Formula |
|---|---|
| Reply rate | unique contacts who replied / eligible contacted ×100 |
| Positive reply rate | interested / contacted ×100 |
| Bounce rate | bounced / sent ×100 |
| Meeting rate | booked / eligible ×100 |
| Completion rate | completed / enrolled ×100 |
| Failure rate | failed steps / completed+failed ×100 |

Displayed in:
- **Overview → Outreach Health panel** (8 cards, color-coded: green = good, red = bounce/failure >5%)
- **Analytics → Sequence KPIs** (15 metrics + state breakdown table)

## 5. User workflows

| User wants | Path |
|---|---|
| Send a follow-up | Sequences → Create → Add steps → Activate → Enroll contact |
| See who replied | Sequences → select sequence → Enrollments table (replied chip) |
| Check deliverability | Analytics → Bounce rate, Suppressed count |
| Connect mailbox | Inbox → Connect mailbox → IMAP/SMTP credentials (encrypted) |
| Track pipeline | Pipeline → deals by stage, weighted forecast |

## 6. Email Sequences — the 5-email default

| Email | Day | Purpose | Subject |
|---|---|---|---|
| 1 | 1 | Introduction | A possible opportunity for `{{company}}` |
| 2 | 4 | First follow-up | Re: A possible opportunity… |
| 3 | 8 | Value proposition | An idea for `{{company}}` |
| 4 | 13 | Objection handling | Is this something you're considering? |
| 5 | 20 | Final / close | Should I close this for now? |

Delays are configurable as minutes / calendar days / business days / exact date. The UI distinguishes "Wait 3 calendar days" vs "Wait 3 business days."

## 7. Mailbox management

Each mailbox has:
- Sender name, email, provider, auth status
- Sending limits (daily/hourly), current usage
- Health checks, last sync, last successful send
- Reply sync status, error logs

**Rotation:** if multiple approved mailboxes, the engine distributes eligible emails across them (respecting provider limits and reputation).

> IMAP/SMTP connection ≠ ready for sequences. Production requires: outbound send + inbound sync + reply matching + bounce processing.

## 8. Suppression & compliance

Central suppression list (`suppression_records`) overrides every sequence rule:
- Visible unsubscribe link where required
- One-click unsubscribe headers
- Global + contact-specific + company-specific rules
- Permanent opt-out record
- Protection against re-enrollment

**Deliverability requirements:**
- SPF, DKIM, DMARC, TLS, DNS alignment
- Hard bounce → suppress immediately; soft bounce → limited retry, then pause
- Verify Hostinger policy before cold prospecting (mass-mail restrictions apply)

## 9. Security & isolation

- **RLS (Row Level Security)** on every table — tenant isolation at the DB level
- Mailbox credentials: encrypted in Worker vault, decrypted only at send/sync time
- `SLACK_WEBHOOK_URL` via env — replies post to the configured Slack channel
- Supabase service role kept server-side; frontend uses anon key only

## 10. Local development

```bash
# Frontend
npm run dev          # http://localhost:5173

# Mailbox worker (Cloudflare)
cd workers/mailbox
npx wrangler dev --port 8787   # http://127.0.0.1:8787

# Tests & build
npm test             # 10 files / 35 tests
npm run build
npm run typecheck
```

Env vars (`.env.local` / `.dev.vars`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SLACK_WEBHOOK_URL`, `ENCRYPTION_KEY`

## 11. Current state & limits

**Working (verified):**
- Email sends via SMTP, replies synced, enrollment stops on reply
- Sequences: 5-email template, sender selector, enroll dialog, preflight panel, enrollment table
- Dashboard KPIs (Overview + Analytics)
- Inbox ordering & HTML preview, typecheck/tests/build green

**Pending / partial:**
- SMTP delivery/bounce reconciliation (Hostinger SMTP acceptance only — no real bounce inbox handling yet)
- Browser Playwright E2E (planned)
- Slack notify requires `SLACK_WEBHOOK_URL` env to be set

**Production note:** Do not claim production-ready until core workflows are tested against deployed infra. Local Wrangler can be unstable (`SQLITE_BUSY`).

## 12. Key files

| File | Role |
|---|---|
| `src/components/SequencesPanel.tsx` | Sequence builder, enrollments, preflight |
| `src/components/OverviewPanel.tsx` | Outreach Health KPI panel |
| `src/components/AnalyticsPanel.tsx` | Full sequence KPI table |
| `src/lib/dashboard-metrics.ts` | `calculateSequenceKpis`, `formatKpi` |
| `workers/mailbox/src/worker.ts` | Sync/send routes, CORS |
| `workers/mailbox/src/protocols.ts` | IMAP/SMTP implementation |
| `workers/mailbox/src/worker-reply.ts` | Reply → stop enrollment + Slack |
| `supabase/migrations/*` | Schema, RLS, indexes, RPCs |

## 13. Glossary

- **Enrollment** — one person's journey through a sequence (independent timeline)
- **Preflight** — pre-launch checklist (sender, mailbox, status, steps, limits…)
- **Suppression** — permanent block from further outreach
- **Queued vs Accepted vs Delivered** — three distinct states; "Accepted by SMTP" ≠ "In Inbox"
