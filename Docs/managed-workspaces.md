# Managed workspaces (god-mode multi-tenant)

EIDEN-Reach supports a multi-workspace model in which a root organization's super_admin can split each invited account into its own isolated child workspace while keeping god-mode management from the root team page.

## Model
- `organizations.parent_organization_id` — every organization either is a root (`parent_organization_id IS NULL`) or a child created by a parent.
- A user invited via the **Managed workspaces** tab (or any listed super_admin inviting flow that creates an org) gets their own organization with `role = super_admin` inside it, giving them *full access to their own workspace*.
- The parent root super_admin does **not** become a member of the child; cross-org visibility happens through the `workspace-admin` Edge Function, which validates caller membership in the parent root and uses the service role.
- Normal RLS is unchanged — a super_admin of their own workspace cannot see sibling workspaces.

## Edge Function actions (`workspace-admin`)
All actions require the caller to be `super_admin` of a **root** organization (`organizations.parent_organization_id IS NULL`).

| Action | Purpose |
|---|---|
| `list` | List every child workspace with members, enrollment counts by state, emails sent, owner info |
| `kpis` | Get KPIs for one child (enrollments by state, emails sent, contacts, suppressed) |
| `emails` | Paginate recent messages for a child (direction, subject, snippet, date, participants) |
| `email` | Full body for one email (HTML body supported, rendered sandboxed in the UI) |
| `invite` | Create a new child organization, create the auth user or email invite, add membership as `super_admin` |

## Frontend
`TeamPanel` exposes two tabs:
1. **Members & audit** — existing team members + audit log (unchanged)
2. **Managed workspaces** — only `super_admin` members of the root see it; lists each child workspace, lets you drill in and see KPI tiles and recent emails, plus a modal to read full message text.

## Invite flow
The Members & audit tab keeps the legacy invite into the **current** workspace for compatibility. The Managed workspaces tab's **Create workspace & invite** form is the new mechanism that spin-up a child workspace per invite.
