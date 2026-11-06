# Restart-Ready Continuous Deployment (GitHub Actions → VPS)

This repository includes two workflows:
- `.github/workflows/ci.yml` — lint/typecheck/tests/build on every push / PR
- `.github/workflows/deploy-vps.yml` — build + deploy `dist/` to a VPS over SSH, plus optional Cloudflare worker deploy

## Secrets stored in GitHub (production environment)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAILBOX_WORKER_URL`
- `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_DEPLOY_PATH`, `VPS_SERVICE`
- (Optional) `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

## Recommended manual steps before first run
1. Create the production environment in GitHub: Settings → Environments → New environment “production”.
2. Ensure the VPS can clone/deploy:
   - Web server (nginx/Apache) serving `dist/`
   - SSH user with sudo for reload/restart