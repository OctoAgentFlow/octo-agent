# Legacy Route Traffic Audit

Status: Active.

Use this before hiding or removing legacy automation routes. The current product direction is the manual, review-first growth workflow, but several old route contracts remain for rollback safety and historical clients.

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

## Decision Rules

- Any real user traffic to legacy automation APIs means keep protection enabled and investigate caller/source.
- Repeated crawler/probe traffic can stay blocked and logged.
- `/api/v1/auto-post/*` can remain as a compatibility alias while new clients use `/api/v1/content-drafts/*`.
- Do not remove database model/table names, JSON fields, activity keys, or AI usage scene strings without a dedicated migration and rollback plan.

## Removal Gate

Only consider route removal after:

- 14 consecutive days of no meaningful production traffic.
- A release note documents the removal.
- A rollback path is available.
- Smoke tests pass for `/content-drafts`, `/handling-list`, `/exposure-radar`, and `/daily-x-queue`.
