# EIDEN Reach — Design System

**Version:** 2.0 · **Product:** EIDEN Reach · **Category:** Sales workspace / CRM / sequence automation
**Positioning:** A connected workspace for prospecting, relationships, outbound sequences and revenue operations.
**Design principle:** Calm control. Make complex sales work feel clear, deliberate and trustworthy.
**Status:** This document describes the **shipped** system. The source of truth is `src/styles.css` (tokens) and the components under `src/components/`. If the two ever disagree, the code wins — update this file.

## 1. Brand foundation

### Product promise
EIDEN Reach helps the team discover and organise prospects, manage relationships, run thoughtful email sequences, answer from one shared inbox and see which activity creates real opportunities.

### Personality
- Confident, not loud.
- Premium and precise, not decorative.
- Human and approachable, not robotic.
- Data-rich, but organised around decisions and next actions.

### Brand line
**Reach the right people. Move business forward.**

### Language
Prefer "contact", "company", "sequence", "conversation", "deal", "next action", "sender health" over internal engineering terms. Never imply a message was delivered to an inbox when the provider only confirmed server acceptance.

## 2. The logo

The mark is a sweeping precision arc connecting two nodes — an evergreen origin (Point A, the sales professional) and a coral arrival (Point B, the closed deal) — forming a subtle abstract **R** for **Reach**. Masters live in `brand/`.

### Meaning
**The Nodes (Point A → Point B).** The two circles are the core of contact management: the sales professional (Point A) and the ideal prospect (Point B). The shift from Deep Evergreen to Coral signifies a successful conversion — a contact moving from cold lead to closed deal.

**The Precision Arc.** Not a chain link: the arc visualises a frictionless, aerodynamic trajectory — the automated sequences and intelligent routing of EIDEN Reach. Outreach is a direct, unimpeded path, not a manual slog.

**The Abstract 'R'.** The diagonal nodes and the curved path nod to the letter **R**. The negative space beneath the upper curve loosely forms the bowl and leg of the letter — identity embedded in the geometry, never drawn literally.

**The Kinetic Energy.** The diagonal tilt gives the mark forward momentum — active, mathematical, a workspace that runs on data and precision.

### Palette
| Token | Value | Use |
|---|---|---|
| Deep Evergreen | `#123E39` | Brand dark surface, arc & Point A on light, arc & dots on dark (cream) |
| Coral | `#C94F2E` | Point B (the conversion), primary actions |
| Warm Cream | `#FAF7EF` | Canvas, on-dark mark strokes & Point A |
| Ink | `#26232F` | Mono cut, body text |

### Files & rules
- `brand/eiden-reach-mark.svg` — default mark on light surfaces (evergreen arc/A, coral B).
- `brand/eiden-reach-mark-on-dark.svg` — cream arc/A, coral B; use on evergreen or ink surfaces.
- `brand/eiden-reach-mark-mono.svg` — single-ink `#26232F` for print, engraving, single-colour contexts.
- `brand/eiden-reach-horizontal.svg` / `eiden-reach-horizontal-on-dark.svg` — lockups (type-set in Plus Jakarta Sans 800/500).
- `public/favicon.svg`, `public/apple-touch-icon.png` — app icons (evergreen tile, cream mark, coral B).
- Never redraw, re-colour or re-proportion the mark. Never add text or effects into the symbol. Keep the diagonal axis; never rotate to horizontal. Minimum size 16 px. Exclusion zone: the diameter of Point A on every side.
- Point B's coral is the only accent in the mark — never invert it onto the arc or the canvas.

## 3. Visual direction
A warm off-white canvas, ink text, a coral primary action colour and a single evergreen brand surface (the sign-in aside). Light sidebar, crisp white panels, dense but breathable tables, subtle borders and near-invisible shadows. Avoid gradient-heavy SaaS templates, neon accents, excessive pill badges, glassmorphism and decorative cards.

## 4. Color tokens (shipped values; source of truth: `src/styles.css`)
| Token | Approx. value | Usage |
|---|---|---|
| `--canvas` | `#FBF9F2` | App background |
| `--surface-raised` | `#FFFFFF` | Panels, cards, dialogs |
| `--subtle` | `#F5F4EE` | Quiet fills, table header |
| `--sunken` | `#EFEDE6` | Wells, inset tracks |
| `--ink` | `#222230` | Primary text |
| `--muted` | `#6B6B75` | Secondary text |
| `--quiet` | `#8E8E97` | Tertiary text, captions |
| `--line` / `--line-strong` | `#E8E7E0` / `#DBD9D1` | Borders, dividers |
| `--primary` | `#C2572F` | Primary buttons, brand accents |
| `--primary-hover` | `#AC4A25` | Primary hover |
| `--primary-ink` | `#96401E` | Coral text on light (links) |
| `--primary-soft` | `#F8E8E0` | Soft coral fill (active nav) |
| `--reach-forest` | `#123E39` | Evergreen brand surface (sign-in aside) |
| `--success` / `--warning` / `--danger` / `--info` | `#1F7A4D` / `#8A6B10` / `#B8433A` / `#2F5BB3` | Status (paired with text/icons, never colour alone) |
| `--tone-*` | blue, teal, violet, coral, amber, green, rose | Section/icon accents (one per sidebar section) |

Colour is never the only signal for status. Check contrast for all text sizes.

## 5. Typography
**Plus Jakarta Sans** (Google Fonts, imported in `styles.css`), falling back to Inter → system-ui → Segoe UI. 15 px base size; page titles 22–26 px at 650–700 weight with tight tracking; section titles 15–17 px/650; body 13–14 px; table text 13 px; labels and captions 11–12 px. KPI numerals 20–32 px with tabular figures. Monospaced (`JetBrains Mono`, ui-monospace) only for IDs, logs and tokens. Sentence case everywhere; avoid all-caps.

## 6. Layout & spacing
Fixed 256 px sidebar, 48 px sticky topbar with blurred cream backdrop, fluid content (max 1480 px), page padding 26/28 px. 12-column mental model, 16 px gaps, 4/8/12/16/20/24/32 scale. Radii: 6 px controls, 10 px cards/panels, 14 px dialogs. Border: 1 px `--line`. Shadows limited to `--shadow-soft` (panels) and `--shadow-pop` (floating).

## 7. Navigation
Workspace → Overview, Inbox, Contacts, Prospecting · Engagement → Sequences, Sequence Templates · Sales → Pipeline, Tasks & Activities · Insights → Analytics · Administration → Integrations, Settings, Team & Audit (super_admin/sales_manager). Grouped labels, one accent tone per group, active states in soft coral, icon-only mobile close. Section purposes are structural and user-facing — never rename to internal terms.

## 8. Components
**Buttons:** one coral primary per task area; white secondary with quiet border; destructive in danger outline; tertiary text/icon with visible focus rings (`--focus`). **Panels:** white surface, 1 px line, soft shadow, 15 px/650 heading. **Tables:** sticky header, 34 px rows, hover wash, right-aligned numerals, tabular figures; empty states explain what's missing and offer one useful action. **Status chips:** short labels (Active, Paused, Replied, Bounced…), never colour alone. **KPI ledger:** 4-up metric band on Overview; detail tiles in Analytics; unique-contact denominators for sequence rates. **Inbox:** three-pane (rail / list / reader); untrusted HTML in a sandboxed iframe; sync state visible ("Synced …"). **Slide-outs & centred dialogs:** record detail and short focused tasks respectively; confirm destructive actions.

## 9. Accessibility
WCAG 2.2 AA where practicable: keyboard operability, visible focus (coral ring), semantic headings, labelled controls, alt text, reduced-motion support, no colour-only meaning, table semantics, 44 px touch targets on mobile. Forms use explicit labels and programmatic errors; dialogs manage focus.

## 10. Required states
Every data screen implements: loading/skeleton, first-use empty state with one next action, filtered empty state with clear-filters, error with recovery, permission-denied, partial/provider-unavailable, success confirmation, pagination/load-more. See §12 of the implementation plan for per-screen requirements.

## 11. Content policy
Production data comes from the database and approved integrations only. Preview/demo states are labelled. Never fabricate delivery, open, reply or provider events; label unavailable ones as such. Unconnected features say "Not connected" / "Needs setup" — never fake data.

## 12. Responsive
Desktop: persistent sidebar + multi-column dashboards + three-pane inbox. ≤900 px: narrower sidebar (232 px), 2-up KPI grids. ≤760 px: drawer navigation, stacked content, page heading wraps, tables scroll horizontally. Inbox collapses to single column. Preserve core actions at every width; avoid page-level horizontal overflow.
