# Core Workflow Smoke Test

Status: Active.

Use this after local refactors or production deploys to confirm the core manual growth workflow still has its required routes and pages.

## Static Check

Run without network access:

```bash
scripts/smoke-core-workflows.sh
```

This validates that the key frontend pages and backend routers/controllers still exist:

- Dashboard
- Start Today redirect
- Exposure Radar
- Daily X Queue
- Content Drafts
- Handling List
- Billing
- Admin

## Local UI Shell Check

After a frontend build, run the UI shell smoke check:

```bash
npm --prefix frontend run build
npm --prefix frontend run smoke:core
```

The script starts the API frontend build when no `SMOKE_BASE_URL` is provided,
then checks the key routes return a valid Next.js HTML shell instead of a
server error:

- Home
- Login
- Dashboard
- Start Today
- Daily Growth Desk
- Content Memory
- Content Drafts
- Handling List
- OAF Bots
- Billing
- Admin

To check an already-running local or production frontend without starting a
server:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3000 node scripts/smoke-core-ui.mjs
SMOKE_BASE_URL=https://octo-agent.com node scripts/smoke-core-ui.mjs
```

## Production Route Check

Run after deploy:

```bash
BASE_URL=https://octo-agent.com scripts/smoke-core-workflows.sh
```

The script follows redirects, so authenticated pages can land on the login flow and still prove the public route is reachable.

## API Health Check

When an API base URL is available:

```bash
API_BASE_URL=https://octo-agent.com/api scripts/smoke-core-workflows.sh
```

For the current lite production deployment, the deeper server health check is still:

```bash
scripts/prod-lite-health-check.sh <your-server-ip>
```
