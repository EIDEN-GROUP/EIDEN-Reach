# Production reliability fix (2026-11-10): unified mailbox sync + idempotent send

Two systemic issues addressed in the same change.

## Mailbox sync — finally global
- Previously the app refreshed Inbox only on the front-end every 5 minutes **per open tab**. If nobody is on the Inbox page, nothing syncs — so replies and bounces are missed until someone manually clicks **Sync mailbox**.
- Now the worker runs a global cron every 5 minutes:
  - `scheduled()` calls `/system/mailbox-sync-all` (system-secret-gated)
  - that endpoint lists every `mailbox_accounts.connection_state = 'connected'`, then calls `runMailboxSync` for each one (no browser required)
- Sync results reconcile enrollments: if a contact replies or a bounce is detected, the sequence is stopped/suppressed and a Slack message is emitted with the owner’s name and workstation.
- Front-end per-page 5-minute sync remains as belt-and-braces but is now redundant.

## Idempotent send — re-send fixed
- Each `sendSequenceStep` writes a deterministic `idempotency_key` (`seq-send-<enrollment_id>-<step_position>`)
- Unique index `send_attempts.idempotency_key_uidx` prevents any `(enrollment, step)` from being published twice
- When a candidate step is already `accepted`, the worker returns `alreadySent: true` and does **not** hit the SMTP server again
- `dispatch-due` still honors scheduled sends (delay/timing) but will not duplicate anything

## Verified on production
- `pm2 logs eiden-worker --lines 15` → `POST /system/mailbox-sync-all 200 OK`
- `GET /system/mailbox-sync-all` reply message `{"ok":true,"count":1,"results":[{"id":"4663…","ok":true,"status":200}]}`
- Outgoing email is gated by idempotency (duplicate attempts are skipped server-side)
