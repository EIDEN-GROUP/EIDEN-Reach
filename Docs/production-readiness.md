# Production Readiness Notes

## Automated checks
- `npm run typecheck`: passed
- `npm test`: 10 files, 34 tests passed
- `npm run build`: successful production build
- `workers/mailbox` TypeScript: clean
- `workers/dispatcher` TypeScript: clean
- `mcp/server.mjs` / `mcp/core.mjs`: Node syntax valid
- All 19 SQL migrations: applied successfully to PostgreSQL with `ON_ERROR_STOP`

## Verified application behavior
- Setup mode renders database guidance and no fabricated records.
- Signed-in application error state is covered by component tests.
- Inbox renders text and sandboxed HTML bodies; sending remains intentionally locked.
- Templates support HTML and text bodies, personalization tags, and modal create/edit.

## Remaining blockers requiring credentials or infrastructure decisions
1. pgTAP schema tests depend on a Supabase-compatible pgTAP/runtime environment; local image lacks `has_constraint()`.
2. Live IMAP synchronization, MIME display, and SMTP delivery need `VITE_MAILBOX_WORKER_URL`, mailbox credentials, and a controlled mailbox.
3. Deployment and post-deploy smoke tests require Vercel/Cloudflare credentials and worker secrets.
