# Legacy Route Traffic Audit

Status: Superseded by route downline on 2026-06-17.

This runbook was used while old routes were still protected compatibility entries. The current product direction is the manual, review-first growth workflow, and the old authenticated automation routes plus old frontend aliases have now been removed from active routing.

## Routes To Watch

High-risk legacy automation APIs:

- `/api/v1/auto-comments/*`
- `/api/v1/auto-comment/*`
- `/api/v1/auto-reply/*`
- `/api/v1/auto-dm/*`

Compatibility content draft APIs:

- `/api/v1/auto-post/*`

Legacy frontend routes:

- `/auto-post`
- `/execution-queue`

## Production Audit Commands

Run on the production server:

```bash
cd /home/ubuntu/octo/current

sudo grep -E '(/api/v1/auto-comments|/api/v1/auto-comment|/api/v1/auto-reply|/api/v1/auto-dm|/api/v1/auto-post|/auto-post|/execution-queue)' \
  /var/log/nginx/access.log /var/log/nginx/access.log.* 2>/dev/null | tail -200
```

If application logs are available:

```bash
grep -R "deprecated api route used\|legacy automation api route used" \
  /home/ubuntu/octo/shared/logs /home/ubuntu/octo/current/backend/logs 2>/dev/null | tail -200
```

## Current Decision

- `/api/v1/content-drafts/*`, `/handling-list`, and `/api/v1/exposure-radar/*` are the active product routes.
- `/api/v1/auto-post/*`, `/auto-post`, `/execution-queue`, `/review-queue`, authenticated `/api/v1/auto-replies/*`, `/api/v1/auto-comment/*`, `/api/v1/auto-comments/*`, and authenticated `/api/v1/auto-dm/*` are downlined.
- Public `/api/v1/auto-dm/unsubscribe/:token` remains available for historical compliance.
- Do not remove database model/table names, JSON fields, activity keys, or AI usage scene strings without a dedicated migration and rollback plan.

## Historical Removal Gate

Only consider route removal after:

- 14 consecutive days of no meaningful production traffic.
- A release note documents the removal.
- A rollback path is available.
- Smoke tests pass for the current core workflow: `/start-today`,
  `/exposure-radar`, `/accounts`, `/oaf-bots`, `/content-library`,
  `/content-drafts`, and `/handling-list`. Downlined compatibility routes such
  as `/daily-x-queue` can be checked separately when preparing final removal,
  but they are not part of the core smoke path.
