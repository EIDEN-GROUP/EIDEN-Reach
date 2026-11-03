# Durable job dispatcher

This Worker is a bounded scheduler for rows in PostgreSQL. It does not treat Cloudflare Queues as storage, and it contains no email provider handlers yet. Unknown job types are retried with `handler_not_configured`; the worker never reports an unimplemented operation as successful.

`wrangler.jsonc` schedules one trigger every 15 minutes. The dispatcher claims no more than five database jobs per invocation and uses a 120-second lease. PostgreSQL owns job payloads, attempts, idempotency keys, retry times and terminal state. The Worker talks to the database through narrowly scoped RPCs using the service-role secret.

Before any deployment, configure these Worker secrets with Wrangler:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DISPATCH_TOKEN`

Never put these values in source, a `VITE_` frontend variable, or a committed Wrangler vars section. Deploy only after reviewing the selected Cloudflare account's remaining Free cron-trigger capacity. Current Free limits documented in `Docs/implementation-plan.md` include five cron triggers per account, 100,000 requests/day and 10 ms CPU per invocation.

The HTTP `/dispatch` endpoint requires the bearer dispatch token. `/health` returns only liveness. No provider sync or send job should be inserted until a handler with provider limits, final suppression checks and idempotent external operations has been implemented and tested.
