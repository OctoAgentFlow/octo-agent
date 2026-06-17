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
