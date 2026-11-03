# EIDEN Reach — Product Design System

**Version:** 1.0 · **Product:** EIDEN Reach · **Category:** Sales workspace / CRM / email automation  
**Positioning:** A connected workspace for prospecting, sales relationships, email outreach and revenue operations.  
**Design principle:** Calm control. Make complex sales work feel clear, deliberate and trustworthy.

## 1. Brand foundation

### Product promise

EIDEN Reach helps the sales team discover and organize prospects, manage relationships, run thoughtful email sequences, respond from one custom mailbox interface, and understand which activity creates real opportunities.

### Personality

- Confident, not loud.
- Premium and precise, not decorative.
- Human and approachable, not robotic.
- Data-rich, but organized around decisions and next actions.
- EIDEN-native: use the group's deep evergreen and warm neutral visual language without making the app look like a marketing website.

### Brand line

**Reach the right people. Move business forward.**

### Brand vocabulary

Use “contact,” “company,” “sequence,” “conversation,” “deal,” “next action,” and “sender health.” Prefer practical labels over internal engineering terms. Do not imply that an email was delivered to an inbox if the provider only confirms server acceptance.

## 2. Visual direction

A polished B2B workspace with a warm off-white canvas, a deep evergreen navigation rail, restrained muted-gold accents and crisp white surfaces. Use generous spacing around section titles, compact but readable data tables, subtle borders, restrained shadows and clear typographic hierarchy.

Avoid gradient-heavy SaaS templates, neon accent colors, excessive pill badges, giant empty hero areas, meaningless charts, glassmorphism on every surface, overly rounded controls, and decorative cards that hide important information.

## 3. Color tokens

| Token | Value | Usage |
|---|---|---|
| `--reach-forest` | `#123E39` | Primary sidebar, strong brand surfaces |
| `--reach-forest-deep` | `#0D302C` | Sidebar depth, active navigation |
| `--reach-teal` | `#0C5752` | Primary actions, links, selected states |
| `--reach-teal-soft` | `#E4F0EC` | Selected rows, calm positive surfaces |
| `--reach-gold` | `#CFC292` | Small brand accent, important highlights |
| `--reach-ink` | `#1E2927` | Primary text |
| `--reach-muted` | `#687572` | Secondary text, captions |
| `--reach-canvas` | `#F4F6F2` | Main app background |
| `--reach-surface` | `#FFFFFF` | Cards, menus, tables, dialogs |
| `--reach-border` | `#E1E7E2` | Dividers and quiet outlines |
| `--reach-border-strong` | `#CAD5CE` | Input focus and stronger structure |
| `--reach-success` | `#247452` | Success states |
| `--reach-warning` | `#94651A` | Warnings and review-required states |
| `--reach-danger` | `#B5463F` | Errors, bounces, destructive actions |
| `--reach-info` | `#416B94` | Informational states |

Color must never be the only signal for status. Pair it with text, an icon or another visible cue. Check contrast for all text sizes.

## 4. Typography

Use **Inter** where available, with `system-ui`, `-apple-system`, `BlinkMacSystemFont`, and `Segoe UI` fallbacks. If a licensed EIDEN font is supplied later, replace the font stack consistently rather than mixing unrelated typefaces.

- Page title: 26–30 px, 650–720 weight, tight line height.
- Section title: 15–18 px, 620–700 weight.
- Body: 13–14 px, 400–500 weight.
- Table body: 12–13 px, 450 weight; avoid going below 12 px for essential information.
- Labels and metadata: 11–12 px, 500 weight.
- KPI values: 25–32 px, 650–720 weight; use tabular numerals.
- Monospaced type: use only for IDs, logs, technical values and code-like tokens.

Use sentence case. Keep headings short and action-oriented. Avoid long all-caps labels.

## 5. Layout and spacing

- Desktop app shell: fixed sidebar around 248 px, top utility bar around 68 px, fluid content region.
- Main content maximum width: approximately 1500 px; use more width for tables and inbox views.
- Standard content padding: 28–32 px desktop, 20 px tablet, 16 px mobile.
- Grid: 12-column responsive system; 16–20 px gap between cards.
- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48 px.
- Surface radius: 8 px for controls, 12 px for cards, 14–16 px for dialogs and large containers.
- Border: 1 px solid `--reach-border`; use shadows sparingly.

Keep the sidebar stable across pages. The current location, page title, search and primary action should be obvious on every main screen.

## 6. Navigation model

### Workspace
- Overview
- Inbox
- Contacts
- Companies
- Leads & Lists
- Prospecting

### Engagement
- Sequences
- Campaigns
- Templates

### Sales
- Pipeline
- Tasks & Activities

### Insights
- Analytics

### Administration
- Integrations
- Settings
- Team & Audit (administrators only)

Use grouped navigation with clear labels and active states. Display unread counts only when backed by real state. Do not show features to roles that cannot access them.

## 7. Core components

### Buttons

- Primary: evergreen/teal fill, white label, one per primary task area.
- Secondary: white surface with quiet border.
- Tertiary: low-emphasis text or icon button for local actions.
- Destructive: danger color, with confirmation for irreversible work.
- Disabled: clearly inactive and paired with a reason where helpful.

Use 36–40 px control heights for standard actions. Icon-only buttons require accessible names and tooltips.

### Inputs and filters

Use explicit labels, visible focus rings, clear errors and help text. Keep frequently used list filters near the search control. Use saved views for repeat queries and preserve filters when navigating back from a record.

### Tables

Tables are first-class productivity surfaces. Support sorting, pagination, row selection, bulk actions, column visibility where useful, sticky column headers and responsive overflow. Row actions should not crowd primary identity fields. Empty states should explain what is missing and provide one useful next action.

### Status indicators

Use small semantic labels for states such as Active, Paused, Draft, Needs review, Replied, Bounced and Suppressed. Never use color alone. Distinguish provider acceptance from actual recipient-server delivery and from inbox placement.

### Cards and dashboards

Each card should answer one question. Use compact titles, visible date ranges and drill-down links. Do not fill the dashboard with redundant charts or arbitrary percentage changes. Show “No data yet” when data is unavailable.

### Modals and drawers

Use modals for short focused tasks, such as creating a contact or confirming a campaign launch. Use drawers for record details and contextual actions. Preserve unsaved form state when possible. Confirm destructive actions.

### Toasts and feedback

Toasts report real success/failure only. In preview or demo mode, explicitly state that no external action was executed. For consequential actions, show a persistent result or activity entry rather than relying only on a toast.

## 8. Screen specifications

### Overview

Show a concise greeting and period selector, primary KPIs, a pipeline snapshot, sequence performance, next actions and recent activity. Prioritize overdue tasks, engaged prospects and deals requiring a decision. Use charts only when their data and definitions are known.

### Inbox

Use a three-pane layout: folder/account list; conversation list; message reading pane. Support connected custom-domain mailboxes, threaded replies, compose, drafts, search, flags, provider-supported folders, attachments and CRM context. Make loading, connection loss and synchronization time visible. Treat email HTML as untrusted content and protect private information.

### Contacts

Provide global search, filters, saved views, owner, source, tags, qualification, company association and last activity. The record page includes identity, qualification, recent interactions, tasks, deals, sequence enrollments and a timeline.

### Companies

Provide company search, domain and industry filters, location, size where available, linked contacts, open deals, account owner and interaction history. Mark unavailable or inferred firmographic data clearly.

### Leads & Lists

Show lead qualification and lifecycle, list management, segment filters, import/export, duplicate review, owner assignment and enrollment eligibility. Exclude unsubscribed, suppressed and otherwise ineligible contacts before campaign operations.

### Prospecting

Provide provider-backed search controls and saved searches. Show source, verification state, retrieval date and provider usage when available. Never fabricate contact records or label unverified emails as verified. If no provider is connected, show an honest setup state and allow CSV import.

### Sequences

Build a visual sequence editor with email, wait, task and conditional steps. Show audience eligibility, sender assignment, scheduled windows, versioning and enrollment state. Require a preview before launch, and re-check suppression and sender eligibility immediately before every send.

### Campaigns

Separate personalized sales outreach from permission-based marketing campaigns and transactional mail. Show target audience, exclusions, schedule, sender/provider, activity, bounces, replies, unsubscribes and health. Provide a preflight checklist before sending.

### Pipeline

Use configurable stages and deal cards. Each deal includes value, currency, owner, next step, close date and associated company/contact. Provide board and table views, stage history, stuck-deal alerts and a transparent weighted forecast calculation.

### Tasks & Activities

Provide assigned tasks, due dates, priorities, statuses, related records and activity history. Support list and calendar-style views when implemented. Make overdue tasks and next actions easy to scan.

### Templates

Manage reusable email templates with subject, HTML, plain-text fallback, personalization fields, signature and test-send preview. Validate missing variables and sanitize content appropriately.

### Analytics

Include sales conversion, pipeline health, sequence performance, reply outcomes, email provider events, sender health and team activity. Every metric requires a documented definition, time range and denominator. Identify missing provider events rather than estimating them silently.

### Integrations

Manage email hosting, provider credentials, Cloudflare workers/queues, AI/MCP clients, enrichment services, webhook endpoints and health checks. Show scope, last sync, status, errors and safe reconnect controls. Secrets should be write-only after initial entry.

### Settings

Manage profile, organization, teams, roles, pipeline stages, custom fields, sending defaults, domain authentication guide, suppression policy, retention, notifications and audit controls. Restrict administrative settings by role.

### Team & Audit

Administrator-only controls for members, roles, permission review, action history, campaign events, provider operations and sensitive exports. Keep logs searchable and ensure sensitive tokens or email content are not accidentally exposed.

## 9. Email and automation UX rules

- Always show the selected sender and audience before launch.
- Preview eligible and excluded recipients with exclusion reasons.
- Validate missing template variables before a send.
- Pause future sequence steps when an applicable human reply is received.
- Apply unsubscribe and suppression checks immediately before sending.
- Stop or safely pause after hard bounce or spam complaint according to policy.
- Use durable job records, retries and idempotency; never depend on an open browser tab.
- Treat a provider-accepted message, a reported delivery event, a reply, an open and an inbox placement as different facts.
- If a provider cannot report an event, mark it unavailable rather than displaying invented data.
- Require explicit approval for high-impact bulk actions and provider changes.
- Preview mode must never send a real message or change a real record.

## 10. Responsive behavior

- Desktop: persistent sidebar and multi-column dashboards; full three-pane inbox.
- Tablet: collapsible sidebar and reduced dashboard columns; inbox panes can be switched.
- Mobile: navigation drawer, stacked cards and full-screen compose/record panels; tables retain access through horizontal scrolling or card layout.
- Preserve core actions on every width. Avoid horizontal overflow of the overall page.

## 11. Accessibility

Target WCAG 2.2 AA where practicable. Support keyboard interaction, visible focus, semantic headings, labeled controls, appropriate contrast, reduced motion, text alternatives for icons, table semantics and screen-reader announcements for important feedback. Do not rely on hover alone to reveal functionality.

## 12. States that every data screen must implement

- Loading / skeleton state.
- First-use empty state with one useful next action.
- Filtered empty state with a way to clear filters.
- Error state with a recovery action.
- Permission denied state.
- Partial data / provider unavailable state.
- Success confirmation for completed actions.
- Pagination or load-more state for large datasets.

## 13. Content and demo-data policy

All preview data must be clearly illustrative. Production data must come from the connected database and approved integrations. Never fabricate email delivery, open, reply, provider connection or enrichment events. Mark unconnected features as Not connected, Needs setup or Unavailable. Use realistic sample values only in explicitly labeled demo states.

## 14. Logo and icon direction

The app symbol should suggest reach, connection and movement through a clear geometric form, not a literal envelope. Explore a compact signal/connection motif, a stylized “R,” or a geometric path joining two points. The mark must remain legible at 16–24 px and work in monochrome, on the dark sidebar and on a light background.

Use a restrained palette of evergreen, teal, warm cream and muted gold. The symbol must be distinctive enough to work without the wordmark, but should not imitate existing email or CRM brands.

## 15. Implementation handoff checklist

Before treating the design as complete:

- Confirm every sidebar route has a purposeful screen.
- Confirm each control corresponds to a real action or is clearly marked as a preview.
- Verify desktop, tablet and mobile behavior.
- Verify contrast, focus rings and empty/error/loading states.
- Verify that demo data cannot be mistaken for production data.
- Verify email event terminology and sender-health labels.
- Verify the UI does not imply that preview actions actually send email or mutate connected systems.
- Keep the interface and code aligned with these tokens and component rules.
