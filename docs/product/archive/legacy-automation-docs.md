# Legacy Automation Documents

Status: Historical archive.

These documents describe older Auto Post / Auto Reply / Auto Comment / Auto DM automation concepts. They are kept for implementation history and compatibility context, not as the current product positioning.

## Current Product Direction

OctoAgentFlow is now positioned around a manual, review-first X growth workflow:

- Daily Growth Desk
- Exposure Radar opportunity signals
- OAF Bot persona and content memory
- Guardrails and review queues
- Manual copy/open-original handling
- Result backfill and learning

Avoid reviving spam-like automation, bulk commenting, or fully automated outreach as default product behavior.

## Historical Documents

- `../auto-post-oaf-bot-redesign.md`
- `../oaf-bot-billing.md`
- `../oaf-bot-execution-mode.md`
- `../publishing-pipeline.md`
- `../oaf-product-deep-research-2026-05.md`
- `../../technical/auto-post-oaf-bot-redesign-tech-design.md`
- `../../technical/oaf-bot-execution-mode-tech-design.md`

## Compatibility Boundary

Some legacy names remain intentionally:

- Database tables such as `auto_post_drafts`
- JSON fields such as `monthly_auto_posts`
- AI usage scenes such as `auto_post`
- Activity preview keys for historical rows

The old product routes and authenticated old automation APIs are no longer active:

- `/auto-post`
- `/execution-queue`
- `/review-queue`
- `/api/v1/auto-post/*`
- authenticated `/api/v1/auto-replies/*`
- `/api/v1/auto-comment/*`
- `/api/v1/auto-comments/*`
- authenticated `/api/v1/auto-dm/*`

Public DM unsubscribe stays available for historical compliance.

See:

- `../../technical/content-draft-route-migration.md`
- `../../technical/legacy-content-draft-reference-audit.md`
- `../../runbooks/legacy-route-traffic-audit.md`
