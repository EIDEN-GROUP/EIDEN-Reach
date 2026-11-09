# Production reliability fixes

Two reported symptoms, root cause, and fix.

## 1. Logs you out at random intervals

**Symptom**: refresh/reload or navigate shows the global sign-in screen again even without clicking Sign out.

**Cause**: stale expired access tokens retained in `localStorage`. On page load, supabase-js tries to refresh with that token; once the refresh-token server returns `401/429`, the browser stays unauthenticated but the SPA still renders the `databaseConfigured` skeleton + sign-in screen without explicit messaging.

**Fix** (planned): defense-in-depth `supabase.auth.signOut()` on unused/stale sessions + a visible "session expired" toast instead of silent redirect.

## 2. All traffic unexpectedly re-sends sequence emails

**Symptom**: contacts receive the sequence email again, sometimes many times.

**Cause**: `dispatch-due` runs without an atomic claim over `sequence_enrollments` and without `idempotency` on `send_attempts`. If the SMTP send succeeds but the enrollment update fails (or two worker instances pick the same set), the same step is re-queued and delivered again. This explains `send_attempts` rows in multiples of seven/four for the same step.

**Fix** (this release):
- `send_attempts.idempotency_key` is deterministic: `seq-send-<enrollment_id>-<position>`
- new unique index `send_attempts_idempotency_key_uidx` enforces atomicity at the database layer
- worker skips sending when the step was already `accepted`
- only one window per `(enrollment, step)` can produce a duplicate

## How to verify after deploy
- connect as `olaati@eiden-group.com`
- open Analytics → Sequence KPIs — Failed rate should reconcile with `accepted` vs `failed` rows
- open a `send_attempts` table row (service role) and confirm every step has a deterministic `seq-send-...`/`seq-fail-...` key
