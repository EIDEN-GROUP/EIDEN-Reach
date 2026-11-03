# EIDEN Reach MCP Server (skeleton)

A minimal Model Context Protocol (JSON-RPC over stdio) server exposing **read-only**
EIDEN Reach tools. It is a skeleton: it does not perform writes, sending, or
enrichment, and it requires a trusted Supabase service credential at runtime.

## Requirements

- Node.js 20+
- Environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `MCP_ORGANIZATION_ID` — fixed tenant scope for this process
  - `MCP_ACTOR_USER_ID` — fixed signed-in member represented by this process

Never commit service-role credentials. Run this server only in a trusted host.

## Run

```
node mcp/server.mjs
```

## Exposed tools

- `list_contacts` — list contacts for an organization (read-only).
- `list_companies` — list companies for an organization (read-only).
- `list_deals` — list deals for an organization (read-only).
- `list_tasks` — list tasks for an organization (read-only).
- `list_pipeline_stages` — list stages from the default pipeline (read-only).
- `list_sequences` — list sequences for an organization (read-only).
- `list_enrollments` — list sequence enrollments (manager role required).
- `request_create_task` — request approval to create a follow-up task (manager role not required; approval workflow used).

Tenant and actor scope cannot be supplied by a tool caller. They are fixed when
the process starts and verified against `memberships` before every tool call.

## Status

The stdio server is intended for a trusted local host. It provides tenant-scoped
reads and approval-request tools; it does not execute approved writes. Every
successful call is recorded in `audit_logs`. For a shared remote MCP deployment,
replace process-level identity with OAuth-bound per-request identity.
