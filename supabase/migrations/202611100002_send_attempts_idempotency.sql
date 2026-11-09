-- Idempotency of outbound sequence steps. Each (enrollment, step position) can
-- have exactly one accepted/failed send attempt so that concurrent workers and
-- click "Send now" never duplicate an email to the same contact.
create unique index if not exists send_attempts_idempotency_key_uidx
  on public.send_attempts (idempotency_key);
