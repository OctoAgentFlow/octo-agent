# Daily X Queue Test Environment Ops Notes

## Test URL

Daily X Queue test URL:

https://test.octo-agent.com/daily-x-queue

API base:

https://test.octo-agent.com/api/v1

## Acceptance Source Of Truth

All Daily X Queue E2E acceptance and product readiness checks must run against the test environment.

Local checks may be used only for development sanity, such as lint, build, and unit tests. Local environment is not the acceptance source of truth.

## Current P0 Commit

Accepted test deployment commit:

709b621

P0 accepted state:

- `/daily-x-queue` returns 200
- `/api/v1/daily-x-queue/overview` is reachable behind auth
- test DB migration exists
- server-side OpenAI config works on test
- generation returns exactly 3 drafts
- edit, reject, approve, and copy work
- `daily_x_queue_activated` is recorded
- Daily Queue drafts create 0 publish jobs
- second generation applies learning summary

## Secret Safety Rules

Do not print, expose, copy into chat, screenshot, commit, or log secrets.

Do not put secrets in frontend code.

Do not commit `backend/configs/.env`.

Only report secret checks as booleans, such as:

- `OPENAI_API_KEY_DOTENV_NONEMPTY=true`
- `CONFIG_LOAD_OPENAI_KEY_NONEMPTY=true`

Do not show actual values.

## Known Environment Limitation

The current test/prod backend deploy scripts read the same server-side file:

`backend/configs/.env`

This means test and prod can share backend environment variables if they run from the same server worktree.

Before production launch, split test and prod env handling so each backend service reads an environment-specific secret source.

Recommended options:

- `backend/configs/.env.test` and `backend/configs/.env.prod`
- service-specific `EnvironmentFile`
- secret manager-backed environment injection
- separate deploy worktrees or containers for test and prod

## Backend Restart Notes

Test backend restart:

```bash
cd /home/ubuntu/octo/octo-agent
DEPLOY_ALERT_ENABLED=0 bash scripts/deploy-backend-api-test.sh
```

Production backend restart should only be done deliberately through the production deploy script after production readiness review.

## Do Not Build During Concierge Test

Do not build:

- reply opportunities
- Auto DM
- scheduler
- autopilot
- publishing
- multi-account flow
- analytics dashboard
- marketing or video work

Only fix real concierge-test blockers that prevent P0 users from completing the Daily X Queue workflow.
