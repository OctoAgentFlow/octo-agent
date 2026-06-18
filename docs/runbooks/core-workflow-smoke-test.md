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
- Accounts
- OAF Bots
- Content Memory
- Content Drafts
- Handling List
- Billing
- Admin

Backend checks use current product semantics (`RegisterContentDrafts`,
`ContentDraftController`, `RegisterReviewQueue`, `ReviewQueueController`) rather
than old filename checks. Some files may still carry legacy names internally for
database/API compatibility, but they are not treated as the product mainline.
The script also asserts that the old `RegisterDailyXQueue` backend route is not
registered in the production router.

`/daily-x-queue` is a downlined compatibility redirect into Content Drafts. It
is intentionally not part of this core smoke path.

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

## Core API Workflow Check

Run the read-only API smoke after backend deploys or when validating a local
server:

```bash
npm --prefix frontend run smoke:api
```

By default this uses `http://127.0.0.1:10001/api/v1`. To check production:

```bash
SMOKE_API_BASE_URL=https://octo-agent.com/api/v1 npm --prefix frontend run smoke:api
```

By default the script attempts `/health`; if the current proxy does not expose
that route, it warns and continues with concrete API route checks. Use
`SMOKE_REQUIRE_HEALTH=1` when the environment is expected to expose health
strictly.

Without a JWT, the script confirms the protected core API surfaces reject
anonymous requests:

- Dashboard overview
- X accounts
- OAF Bots
- Content Memory
- Content Drafts
- Handling List
- Growth Strategy
- Manual handling records
- English and Chinese Exposure Radar

With a JWT, the script checks the same core surfaces return the expected success
envelope and response shape. It also prints an activation-readiness summary:

- X account connected
- OAF Bot created
- Growth Strategy readable
- Exposure Radar diagnostics readable
- visible opportunity pool
- Content Memory seeded
- Content Drafts reachable
- Handling List reachable
- manual handling / result records present

Authenticated run:

```bash
SMOKE_API_BASE_URL=https://octo-agent.com/api/v1 \
SMOKE_JWT="$OCTO_PROD_JWT" \
npm --prefix frontend run smoke:api
```

To make missing activation steps fail the smoke instead of only printing them:

```bash
SMOKE_REQUIRE_ACTIVATED=1 SMOKE_JWT="$OCTO_PROD_JWT" npm --prefix frontend run smoke:api
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

For API response-shape validation, prefer the Core API Workflow Check above.

For the current lite production deployment, the deeper server health check is still:

```bash
scripts/prod-lite-health-check.sh <your-server-ip>
```
