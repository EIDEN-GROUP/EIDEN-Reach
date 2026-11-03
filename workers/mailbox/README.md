# Mailbox connection Worker

This Worker currently lists authorized mailbox metadata, verifies an IMAP/SMTP login, and creates a mailbox record with an AES-GCM-encrypted credential envelope. It does not synchronize mail, persist messages, send email, or provide delivery tracking. A successful SMTP authentication check is not a delivery test.

## Configuration

Deploy only after applying `supabase/migrations/202610280008_mailbox_credentials.sql` to a development database. Set these Worker secrets/vars using Wrangler or the Cloudflare dashboard:

- `SUPABASE_URL`: project URL.
- `SUPABASE_ANON_KEY`: public key, used only for Supabase Auth user validation.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key. Never put it in Vite/browser configuration.
- `MAILBOX_ENCRYPTION_KEY`: base64 encoding of 32 random bytes, e.g. generate locally with `openssl rand -base64 32`.
- `MAILBOX_ENCRYPTION_KEY_VERSION`: non-secret identifier used for rotation, initially `v1`.
- `APP_ORIGIN`: exact HTTPS origin of the app, with no path or trailing slash.

Configure `VITE_MAILBOX_WORKER_URL` in the frontend build environment to the HTTPS Worker origin. For local development, HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]`.

## Current behavior and limits

The adapter uses Hostinger's documented IMAP TLS endpoint (`imap.hostinger.com:993`) and SMTP TLS (`smtp.hostinger.com:465`), falling back to STARTTLS (`smtp.hostinger.com:587`) when implicit TLS cannot authenticate/connect. It checks login only. Hostinger account policy and mailbox plan limits must be reviewed before any sending implementation; this Worker sends no messages. Connection tests are capped at ten per actor/workspace per hour by a database RPC.

The two protocol connections are sequential and the Worker does not maintain IMAP IDLE. Cloudflare Workers Free documents 10 ms CPU per request; TLS handshakes may exceed that budget in practice. No controlled mailbox is configured here, so real-provider compatibility and Free-plan CPU fit are unverified. Measure this before relying on the endpoint; if it exceeds the Free limit, use a paid compatible runtime or a conventional worker without changing the provider-independent business layer.

## Validation

`npm run typecheck`, `npm test`, and `npm run build` validate the app and Worker TypeScript. They do not apply the SQL migration, deploy the Worker, or prove a real mailbox connection. A controlled integration test remains required.
