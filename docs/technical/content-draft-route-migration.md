# Content Draft And Handling List Route Migration

## Scan Summary

- Public frontend routes still existed at `/auto-post` and `/execution-queue`.
- Navigation, internal links, dashboard shortcuts, account cards, admin links, and smoke-test scripts were still pointing at the old route names.
- Frontend Content Draft API calls use `/content-drafts/*`; the legacy `/auto-post/*` contract remains available for compatibility.
- i18n keys still use `autoPost` and `executionQueue`. The visible copy has already moved toward manual, safe growth language, but key renames are medium risk because many pages share them.
- Backend repositories, models, database quota fields, and historical activity keys still use `AutoPost` naming. Billing DTOs now expose content/opportunity/review semantic aliases while keeping the old JSON fields available.

## Migration Target

- New public route for the former Auto Post workbench: `/content-drafts`.
- New public route for the former Execution Queue page: `/handling-list`.
- Existing legacy routes stay available for compatibility: `/auto-post`, `/execution-queue`.
- New frontend service import paths: `content-draft.service.ts` and `content-drafts.service.ts`, both using the `/content-drafts/*` API alias while old `autoPostService` keeps `/auto-post/*`.

## Executable Checklist

| Priority | Scope | Action | Status |
| --- | --- | --- | --- |
| P0 | Frontend routes | Add `/content-drafts` and `/handling-list` aliases while keeping old routes alive. | Done |
| P0 | Navigation and public links | Point sidebar, mobile nav, dashboards, account cards, admin links, review links, and product links to the new route names. | Done |
| P0 | Smoke-test and runbook paths | Update audit script and runbooks to test the new public route names. | Done |
| P0 | Frontend service imports | Add `contentDraftService` and `content-drafts.service.ts` aliases so new code can avoid old import paths. | Done |
| P1 | Component semantics | Gradually rename local variables and type aliases from `autoPost*` to `contentDraft*` where this does not touch backend payload names. | First batch done |
| P1 | i18n key migration | Introduce new `contentDrafts.*` and `handlingList.*` keys, then migrate page usage in small batches. | First batch done |
| P2 | Backend API aliases | Add `/api/v1/content-drafts/*` aliases while keeping `/api/v1/auto-post/*` stable. | Done |
| P3 | Backend internals | Rename DTO/service/model/quota/activity/scheduler symbols only after route aliases and tests cover compatibility. | Runtime aliases, billing semantic aliases, P3.3-a inventory, and P3.3-b DTO/repository aliases done |

## Compatibility Notes

- Do not remove `/auto-post` or `/execution-queue` until production logs show no meaningful traffic.
- Do not rename database tables or JSON fields in the same step as route cleanup.
- Keep old activity event keys stable unless a migration maps historical events to the new labels.
- Keep `/api/v1/auto-post/*` available as a legacy API until production logs show no meaningful usage.

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

## P2 Backend API Alias

- Registered `/api/v1/content-drafts/*` with the same controller handlers as `/api/v1/auto-post/*`.
- Kept `/api/v1/auto-post/*` stable for legacy pages, historical clients, and rollback safety.
- Switched the frontend `contentDraftService` to call `/content-drafts/*`; `autoPostService` still calls `/auto-post/*`.
- Added router coverage to assert that the Content Draft aliases mirror the legacy Auto Post endpoints.

## P3.1 Backend Runtime Alias

- Introduced `ContentDraftController` and `ContentDraftService` as the runtime names for new backend wiring.
- Kept `AutoPostController`, `NewAutoPostController`, `AutoPostService`, and `NewAutoPostService` as legacy aliases/wrappers so existing services and tests remain compatible.
- Switched API router wiring and the scheduler dependency from `autoPost` naming to `contentDraft` naming.
- Added `RunContentDraftOnce` for the scheduler while retaining `RunAutoPostOnce` as a compatibility wrapper.
- Did not rename database models, repository types, table names, DTO JSON fields, quota fields, or activity keys in this batch.

## P3.2 Quota And Billing Semantic Alias

- Added billing API semantic aliases such as `monthly_content_drafts`, `monthly_opportunity_drafts`, `monthly_review_capacity`, `content_drafts_month`, and `opportunity_drafts_month`.
- Kept legacy billing JSON fields such as `monthly_auto_posts`, `monthly_auto_comments`, and `auto_posts_month` in the response for older clients and rollback safety.
- Updated frontend billing, dashboard, OAF Bot quota, and plan-benefit displays to prefer the new content/opportunity/review semantic fields with old-field fallback.
- Did not rename database columns, subscription package fields, repositories, quota storage, historical activity keys, or scheduler internals in this batch.

## P3.3-a Backend Naming Risk Inventory

This batch is intentionally documentation and test hardening only. It does not rename backend models, database tables, repositories, quota storage, historical activity keys, or AI usage scene keys.

| Area | Current Legacy Surface | Risk | Decision Before P3.3-b |
| --- | --- | --- | --- |
| Public API routes | `/api/v1/auto-post/*` plus `/api/v1/content-drafts/*` aliases | Low | Keep both routes. New clients use `/content-drafts/*`; legacy route stays until production access logs are clean. |
| Controller/service runtime | `ContentDraftController` / `ContentDraftService` aliases over legacy `AutoPost*` implementation | Low | Keep current aliases. Further renames should be internal-only and covered by existing route tests. |
| Scheduler entrypoint | Active scheduler calls `RunContentDraftOnce`; `RunAutoPostOnce` remains a wrapper | Low | No behavior change needed. Do not remove wrapper until no old tests/jobs/imports reference it. |
| DTO type names | `AutoPostPlanRequest`, `AutoPostDraftItem`, `AutoPostGenerationRunItem` | Medium | Add `ContentDraft*` aliases before renaming call sites. Keep JSON payload fields unchanged in the first pass. |
| Repository names | `AutoPostPlanRepository`, `AutoPostDraftRepository`, `AutoPostGenerationRunRepository` | Medium | Introduce repository type aliases or wrapper constructors first; do not change query behavior or model targets. |
| Models and tables | `AutoPostPlan`, `AutoPostDraft`, `AutoPostGenerationRun`; GORM tables `auto_post_plans`, `auto_post_drafts`, `auto_post_generation_runs` | High | Do not rename tables in P3.3. If Go model names change later, add explicit `TableName()` methods to keep the existing tables. |
| Subscription quota internals | `MonthlyAutoPosts`, `MonthlyAutoComments`, `MonthlyAutoDMs`, related daily fields | High | Keep internal fields until all usage paths read semantic aliases. Billing API already emits new and old fields. |
| AI usage scenes | `AIGenerationSceneAutoPost = "auto_post"` and sibling legacy scene strings | High | Keep historical scene strings. Add display aliases if user-facing labels need new wording. |
| Activity preview keys | `activity.preview.autoPost*` stored in `activity_logs.preview_key` | High | Keep keys stable for historical logs. Add dictionary aliases/display mapping before any new key emission. |
| Admin metrics DTO | `auto_post_enabled_plans`, `auto_post_due_now`, `auto_post_failed_24h` | Medium | Add admin semantic aliases before changing field names; admin API consumers may still read old keys. |
| Local helper names | `autoPostDraftMaxFor`, `autoPostContentHash`, `autoPostRunTimeRange`, `autoPostLocation` | Low | These can be renamed gradually with wrapper helpers because they are not persisted or public. |
| Cross-feature dependencies | Daily X Queue, Review Queue, Publishing, Trend preference, Dashboard all read `AutoPostDraft` or `AutoPostPlan` | High | Rename only after repository/model compatibility tests are in place and each consumer has a small targeted diff. |

### P3.3-a Compatibility Tests Added

- `backend/internal/dto/billing_dto_test.go` checks that billing usage aliases and subscription JSON keep both semantic and legacy quota fields.
- `backend/internal/model/auto_post_compat_test.go` checks that the three legacy `auto_post_*` GORM table names remain stable during backend renaming.

## P3.3-b DTO And Repository Alias Layer

- Added `ContentDraft*` DTO type aliases over the existing `AutoPost*` DTO types, including plan requests, draft items, run items, list queries, and response wrappers.
- Added repository aliases and constructors:
  - `ContentDraftPlanRepository` / `NewContentDraftPlanRepository`
  - `ContentDraftRepository` / `NewContentDraftRepository`
  - `ContentDraftGenerationRunRepository` / `NewContentDraftGenerationRunRepository`
  - `ContentDraftGenerationRunListQuery`
- Kept all JSON payload fields unchanged, including `generated_content`, `daily_limit`, and the existing response shapes.
- Kept all GORM models and tables unchanged; new repository names still target the legacy `auto_post_*` tables through the same implementation.
- Kept historical activity preview keys and AI usage scene strings unchanged.
- Added alias tests so future migrations can safely move call sites to the new names without accidentally changing public contracts.
