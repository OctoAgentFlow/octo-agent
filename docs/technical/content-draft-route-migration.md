# Content Draft And Handling List Route Migration

## Scan Summary

- Public frontend routes still existed at `/auto-post` and `/execution-queue`.
- Navigation, internal links, dashboard shortcuts, account cards, admin links, and smoke-test scripts were still pointing at the old route names.
- Frontend API calls still use `/auto-post/*`; this is the current backend contract and should stay compatible until backend route aliases exist.
- i18n keys still use `autoPost` and `executionQueue`. The visible copy has already moved toward manual, safe growth language, but key renames are medium risk because many pages share them.
- Backend services, repositories, DTOs, models, quota fields, activity keys, and scheduler internals still use `AutoPost` naming. These are high risk because they touch database tables, historical events, and scheduled behavior.

## Migration Target

- New public route for the former Auto Post workbench: `/content-drafts`.
- New public route for the former Execution Queue page: `/handling-list`.
- Existing legacy routes stay available for compatibility: `/auto-post`, `/execution-queue`.
- New frontend service import paths: `content-draft.service.ts` and `content-drafts.service.ts`, both aliasing the existing `auto-post.service.ts` contract.

## Executable Checklist

| Priority | Scope | Action | Status |
| --- | --- | --- | --- |
| P0 | Frontend routes | Add `/content-drafts` and `/handling-list` aliases while keeping old routes alive. | Done |
| P0 | Navigation and public links | Point sidebar, mobile nav, dashboards, account cards, admin links, review links, and product links to the new route names. | Done |
| P0 | Smoke-test and runbook paths | Update audit script and runbooks to test the new public route names. | Done |
| P0 | Frontend service imports | Add `contentDraftService` and `content-drafts.service.ts` aliases so new code can avoid old import paths. | Done |
| P1 | Component semantics | Gradually rename local variables and type aliases from `autoPost*` to `contentDraft*` where this does not touch backend payload names. | First batch done |
| P1 | i18n key migration | Introduce new `contentDrafts.*` and `handlingList.*` keys, then migrate page usage in small batches. | First batch done |
| P2 | Backend API aliases | Add `/api/v1/content-drafts/*` aliases while keeping `/api/v1/auto-post/*` stable. | Pending |
| P3 | Backend internals | Rename DTO/service/model/quota/activity/scheduler symbols only after route aliases and tests cover compatibility. | Pending |

## Compatibility Notes

- Do not remove `/auto-post` or `/execution-queue` until production logs show no meaningful traffic.
- Do not rename database tables or JSON fields in the same step as route cleanup.
- Keep old activity event keys stable unless a migration maps historical events to the new labels.
- Keep `/api/v1/auto-post/*` documented as the active API until backend route aliases are implemented.

## P1 First Batch

- Switched new frontend callers to `contentDraftService` and `ContentDraft*` type aliases.
- Renamed local plan/readiness state in Accounts, OAF Bots, Dashboard, Post Create, Trends, Handling List, and the Content Draft workbench.
- Kept i18n keys such as `autoPost.*` and backend-compatible fields such as `auto_post_*` and `autoPostsMonth` unchanged.

## P1.2 First Batch

- Added static dictionary aliases for `contentDrafts.*` and `handlingList.*` in English and Simplified Chinese.
- Migrated the Content Draft workbench from `autoPost.*` to `contentDrafts.*`.
- Migrated the Handling List page from `executionQueue.*` to `handlingList.*`.
- Kept old `autoPost.*` and `executionQueue.*` keys available for compatibility while other pages migrate.

## P1.3 First Batch

- Migrated Post Create trend keys from `autoPost.trends.*` to `contentDrafts.trends.*`.
- Migrated Trends and OAF Bots trend/category/policy keys to `contentDrafts.trends.*`.
- Migrated Dashboard, account cards, activity bulk labels, and OAF Bots handling status/mode keys to `handlingList.*`.
- Added new field-style keys for Dashboard/Admin/Post Create/OAF Bots where old names used `autoPost` inside a broader namespace.
- Kept legacy key handling for historical stored learning reasons that may still contain `executionQueue.*`.

## P1.4 Final Frontend Key Sweep

- Added `marketing.contentDrafts.*` aliases and moved the public marketing Content Drafts section off `marketing.autoPost.*`.
- Added `posts.guide.contentDraft.*` aliases and moved the Posts guide card off `posts.guide.autoPost.*`.
- Kept the old `marketing.autoPost.*` and `posts.guide.autoPost.*` keys for compatibility until a later dictionary cleanup confirms no legacy references remain.
