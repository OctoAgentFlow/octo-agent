# Content Draft And Handling List Route Migration

## Scan Summary

- Public frontend routes previously existed at `/auto-post` and `/execution-queue`; they are now downlined.
- Navigation, internal links, dashboard shortcuts, account cards, admin links, and smoke-test scripts now point at the new route names.
- Frontend Content Draft API calls use `/content-drafts/*`; the legacy `/auto-post/*` API route has been removed from active registration.
- i18n keys still use `autoPost` and `executionQueue`. The visible copy has already moved toward manual, safe growth language, but key renames are medium risk because many pages share them.
- Backend repositories, models, database quota fields, and historical activity keys still use `AutoPost` naming. Billing DTOs now expose content/opportunity/review semantic aliases while keeping the old JSON fields available.

## Migration Target

- New public route for the former Auto Post workbench: `/content-drafts`.
- New public route for the former Execution Queue page: `/handling-list`.
- Legacy frontend routes `/auto-post`, `/execution-queue`, and `/review-queue` are downlined.
- New frontend service import paths: `content-draft.service.ts` and `content-drafts.service.ts`, both using `/content-drafts/*`. The old `autoPostService` export remains only as a code import wrapper and also calls `/content-drafts/*`.

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
| P3 | Backend internals | Rename DTO/service/model/quota/activity/scheduler symbols only after route aliases and tests cover compatibility. | Runtime aliases, billing semantic aliases, P3.3-a inventory, P3.3-b aliases, low-risk call-site migration, and helper rename pass done |
| P4 | Legacy route downline | Remove old frontend pages and unregister old authenticated automation/content draft API routes after production owner approval. | Done on 2026-06-17 |

## Compatibility Notes

- `/auto-post`, `/execution-queue`, `/review-queue`, and `/api/v1/auto-post/*` are downlined as of 2026-06-17.
- Do not rename database tables or JSON fields in the same step as route cleanup.
- Keep old activity event keys stable unless a migration maps historical events to the new labels.
- Keep public `/api/v1/auto-dm/unsubscribe/:token` available for historical compliance.

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
- Later downlined `/api/v1/auto-post/*` after owner approval. Current router coverage asserts the old path is no longer registered.
- Switched the frontend `contentDraftService` and compatibility `autoPostService` export to call `/content-drafts/*`.

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
| Public API routes | `/api/v1/content-drafts/*` active; `/api/v1/auto-post/*` downlined | Low | New clients use `/content-drafts/*`; legacy route removed from active registration on 2026-06-17. |
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

## P3.3-c First Low-Risk Call-Site Migration

- Switched router initialization to `NewContentDraftPlanRepository`, `NewContentDraftRepository`, and `NewContentDraftGenerationRunRepository`.
- Renamed router variables from `autoPost*Repo` to `contentDraft*Repo` and passed those aliases through service constructors.
- Updated low-risk service fields and constructor parameters to use `ContentDraft*` repository aliases in Dashboard, Automation, Billing, OAF Bot, Trend, Daily X Queue, Review Queue, Publishing, and Content Draft services.
- Updated Content Draft controller request bindings and Content Draft service helper signatures to use `ContentDraft*` DTO aliases while preserving all JSON fields and response shapes.
- Kept legacy `NewAutoPostService`, AutoPost model names, database table names, AI usage scene strings, activity preview keys, and public legacy API route untouched.

## P3.3-d Local Helper Rename Pass

- Renamed pure local helpers from `autoPost*` to `contentDraft*` where the helper does not define a persisted contract.
- Covered content draft length mode helpers, generated draft fitting, content hash generation, unique draft generation, trend selection helper, scheduler run helper, planner window parsing, run query time range parsing, and related tests.
- Renamed `auto_post_run_time_range_test.go` to `content_draft_run_time_range_test.go`.
- Kept error constants, model names, GORM table names, DTO JSON tags, AI usage scene values, activity preview keys, and legacy service/controller aliases untouched.

## P3.4-a Remaining Legacy Contract Audit

This batch is an audit and boundary-labeling pass. It documents the remaining
`AutoPost` surfaces and adds code comments around the high-risk compatibility
points. It does not rename database tables, JSON fields, activity keys, AI usage
scene strings, queue types, public routes, or historical data.

### Category 1: Must Remain For Historical Compatibility

These surfaces are legacy contracts, not ordinary naming leftovers.

| Surface | Current Contract | Why It Must Stay | Boundary |
| --- | --- | --- | --- |
| GORM models and tables | `AutoPostPlan`, `AutoPostDraft`, `AutoPostGenerationRun`; derived tables `auto_post_plans`, `auto_post_drafts`, `auto_post_generation_runs` | Existing production data, migrations, scheduler history, review queue joins, and publish jobs depend on these names. | Do not rename without a DB migration and rollback plan. Comments added to the model files. |
| Public legacy API | `/api/v1/auto-post/*` | Older frontend builds, bookmarks, scripts, and rollback paths may still call it. | Downlined on 2026-06-17 after owner approval. |
| Billing legacy JSON | `monthly_auto_posts`, `daily_auto_posts`, `auto_posts_month`, `auto_posts_today`, and sibling legacy quota fields | API consumers and stored plan semantics may still read these fields. | Keep legacy fields and fill semantic aliases from them. Comment added in billing DTO. |
| Automation DTO JSON | `AutoPost*` DTOs with existing JSON fields such as `generated_content`, `daily_limit`, `selected_trends` | The route alias uses the same wire shape for compatibility. | Prefer `ContentDraft*` aliases in new code; do not rename JSON tags yet. Comment added in automation DTO. |
| AI usage scenes | `AIGenerationSceneAutoPost = "auto_post"` and sibling auto scene strings | Historical cost/usage rows are keyed by scene string. | Add display aliases for product wording; do not rewrite scene values in P3.4. Comment added in repository. |
| Activity preview keys | `activity.preview.autoPost*` | Historical `activity_logs.preview_key` values and dictionaries depend on these exact keys. | Add display/dictionary aliases before changing future emissions. |
| Queue/review types | `queue_type = "auto_post"` and related review/publish paths | Stored review items and feedback learning logic use the type string. | Keep stored type stable until a data migration exists. |
| Admin legacy metrics | `auto_post_enabled_plans`, `auto_post_due_now`, `auto_post_skipped_24h`, `auto_post_failed_24h` | Admin dashboard/API consumers may still read these keys. | Add semantic aliases before changing legacy fields. Comment added in admin DTO. |
| Scheduler wrapper | `RunAutoPostOnce` | Existing imports/tests/rollback code may still reference the old entrypoint. | Active scheduling should use `RunContentDraftOnce`; keep wrapper until references are gone. Comment updated in job file. |

### Category 2: Internal Semantic Alias Layer

These are safe places to continue improving product language because they can
alias the legacy contract instead of changing it.

| Surface | Current State | Next Safe Action |
| --- | --- | --- |
| Controller/service runtime | `ContentDraftController` and `ContentDraftService` alias legacy implementations. | Keep using `ContentDraft*` names in new wiring; leave `AutoPost*` wrappers in place. |
| Repository aliases | `ContentDraftPlanRepository`, `ContentDraftRepository`, `ContentDraftGenerationRunRepository` alias legacy repositories. | Continue moving local variables and constructor parameters to the alias names. |
| DTO aliases | `ContentDraft*` DTO aliases wrap the legacy `AutoPost*` wire contract. | Continue using aliases in handlers/services while keeping JSON tags unchanged. |
| Frontend services/routes | New callers use `/content-drafts`; legacy `autoPostService` export calls the same route. | New UI code should import content draft services; no old frontend page routes remain. |
| Helper names | P3.3-d moved pure local helpers to `contentDraft*`. | Continue renaming only non-persisted helpers when tests cover the call site. |
| Admin display labels | Admin metrics still use legacy JSON keys. | Add `content_draft_*` semantic aliases in a later small batch, while keeping old fields. |
| AI generation method names | `GenerateAutoPost`, `RewriteAutoPost`, and `GenerateAutoPostInput` are still internal method/type names. | Add `GenerateContentDraft` / `RewriteContentDraft` wrappers first if we want cleaner call sites. |
| Automation service helper names | `syncAutoPostPlannerEnabled` and `applyAutoPostPlannerState` are internal names. | Rename or wrap only after confirming no public payload or DB field changes are involved. |

### Category 3: Future High-Risk Migration Only

These should not be touched during routine cleanup. Treat them as explicit data
migration projects.

| Surface | Why It Is High Risk | Required Gate Before Migration |
| --- | --- | --- |
| Renaming `auto_post_*` tables or Go models | Can break GORM table resolution, migrations, joins, and production data access. | Dedicated DB migration, `TableName()` compatibility tests, staging/prod backup, rollback script. |
| Renaming quota storage fields | Subscription packages and usage counters still map semantic limits to old storage fields. | Full billing compatibility test matrix and dual-read/dual-write period. |
| Rewriting AI usage scene values | Historical cost dashboards and monthly usage rows are keyed by old scene strings. | Backfill script plus reporting comparison before and after. |
| Rewriting activity preview keys | Historical activity rows may lose labels if keys change. | Dictionary/display alias first, then optional future-key emission with backward mapping. |
| Changing `queue_type = "auto_post"` | Review queue, feedback learning, and publish flow can stop resolving old items. | Data migration plus queue compatibility tests over old and new rows. |
| Removing `/auto-post` or `/execution-queue` routes | Old sessions/bookmarks no longer resolve to product pages. | Completed on 2026-06-17 after owner approval. |
| Removing legacy TypeScript service/types | Some pages and tests still import old service/type wrappers. | Frontend `rg` audit must show no live imports outside compatibility wrappers. |

### P3.4-a Decision

- Stop treating every `AutoPost` string as cleanup debt.
- Keep Category 1 contracts stable until a real migration exists.
- Use Category 2 aliases for normal product-language cleanup.
- Defer Category 3 migrations until there is a separate release plan with data
  migration, compatibility tests, backups, and rollback.

Historical note: the P3.4-b recommendation below this section has been
completed. Admin execution metrics and activity display labels now expose
semantic aliases while keeping the old API keys and stored activity keys
unchanged.

## P3.4-b Admin And Activity Display Aliases

- Added additive admin execution metric aliases:
  - `content_draft_enabled_plans`
  - `content_draft_due_now`
  - `content_draft_skipped_24h`
  - `content_draft_failed_24h`
- Kept the legacy admin JSON fields `auto_post_enabled_plans`,
  `auto_post_due_now`, `auto_post_skipped_24h`, and `auto_post_failed_24h` in
  the same response for existing dashboard/API consumers.
- Added additive activity `preview_display_key` fields for activity list and
  admin recent activity responses.
- Mapped legacy stored `activity.preview.autoPost*` keys to new display aliases
  such as `activity.preview.contentDraftGenerated` and
  `activity.preview.contentDraftPublishJobCreated`.
- Kept stored `activity_logs.preview_key` values unchanged; this batch only
  changes display resolution and additive response fields.
- Updated frontend Admin metrics to prefer the new `content_draft_*` fields with
  legacy `auto_post_*` fallback.
- Updated frontend activity narratives and analytics recent-event display to
  prefer `preview_display_key`, with old `preview_key` fallback.

P3.4-b still avoids the high-risk migrations from P3.4-a Category 3: no table
renames, no queue type rewrites, no AI usage scene rewrites, no historical
activity key rewrites, and no route removals.

## P3.4-c AI Service Content Draft Aliases

- Added `GenerateContentDraftInput` as an alias over the legacy
  `GenerateAutoPostInput` type.
- Added `AIService.GenerateContentDraft` and `AIService.RewriteContentDraft`
  wrappers over the legacy `GenerateAutoPost` and `RewriteAutoPost` methods.
- Moved low-risk backend call sites to the new wrappers:
  - Content Draft generation and rewrite flows.
  - Manual post generation that reuses the same content draft prompt input.
  - Daily X Queue rewrite fallback.
- Renamed the shared local helper from `autoPostInputFromBot` to
  `contentDraftInputFromBot`.
- Kept `GenerateAutoPost`, `RewriteAutoPost`, `GenerateAutoPostInput`, prompt
  behavior, `scene=auto_post`, database models, JSON fields, activity keys, and
  legacy route contracts unchanged.

The remaining `GenerateAutoPost*` references in runtime code are compatibility
definitions or wrapper internals. Tests may still reference the old alias while
gradually moving to the new names.

## P3.4-d AI Service Test Alias Cleanup

- Migrated Daily X Queue service tests from `GenerateAutoPostInput` to
  `GenerateContentDraftInput`.
- Added a small alias contract test proving `GenerateContentDraftInput` and
  `GenerateAutoPostInput` can round-trip without losing fields.
- Kept the legacy `GenerateAutoPostInput` type available because it is still
  the compatibility anchor behind the new alias.
- Did not change runtime behavior, prompt behavior, `scene=auto_post`, database
  models, JSON fields, activity keys, or route contracts.

## P3.4-e Display-Only Label Cleanup

- Changed display-only fallback labels from `Auto Post` to Content Draft wording
  in Dashboard and Review Queue DTO construction.
- Kept the frontend Handling List compatible with all three labels:
  `Auto Post`, `Content Draft`, and `Content Draft Planner`.
- Updated user-facing Content Draft publish failure copy while keeping
  `publish_jobs.source_type`, legacy activity keys, and API route contracts
  unchanged.
- Updated the Daily X Queue blocking error copy from Auto Post wording to
  Content Draft wording.
- Left compatibility/storage surfaces untouched:
  - `System / Auto Post` activity source values.
  - GORM model comments and migration descriptions.
  - AI prompt compatibility text.
  - Legacy `AutoPost*` type and method definitions.

## P3.5 Remaining Legacy Reference Audit

- Added `docs/technical/legacy-content-draft-reference-audit.md` as the
  remaining-reference inventory.
- Classified remaining `AutoPost`, `auto_post`, `autoPost`, `auto-post`, and
  `Auto Post` references into:
  - Low-risk internal cleanup.
  - Compatibility contracts that should remain.
  - Future migration-only surfaces.
- Kept this as documentation and boundary-setting. The audit does not change
  routes, database tables, JSON fields, quota storage, activity keys, AI scene
  strings, or queue type values.

## P3.6 Low-Risk Internal Naming Cleanup

- Renamed internal Automation service helpers:
  - `syncAutoPostPlannerEnabled` -> `syncContentDraftPlannerEnabled`
  - `applyAutoPostPlannerState` -> `applyContentDraftPlannerState`
- Renamed the pure AI rewrite prompt helper from
  `normalizeAutoPostRewriteMode` to `normalizeContentDraftRewriteMode`.
- Renamed Review Queue and Publishing service internal helpers to
  Content Draft wording:
  - `autoPostDraftToReviewQueueItem` -> `contentDraftToReviewQueueItem`
  - `processAutoPostPublishJob` -> `processContentDraftPublishJob`
- Added `PickActiveForContentDraft` to the Content Library repository and kept
  `PickActiveForAutoPost` as a compatibility wrapper.
- Moved the Content Draft scheduler generation call site to
  `PickActiveForContentDraft`.
- Kept all persisted and public contracts unchanged, including DB table names,
  model names, JSON fields, `scene=auto_post`, activity keys, queue types, and
  legacy API routes.

## P3.7 Compatibility Guard Script

- Added `scripts/check-legacy-compat-contracts.sh` as the executable guard for
  the remaining high-risk compatibility boundary.
- The script asserts that legacy persisted contracts still exist where they are
  required:
  - `AutoPost*` model/table anchors for existing `auto_post_*` rows.
  - `ContentDraft*` DTO and repository aliases over legacy storage contracts.
  - Billing semantic and legacy JSON fields.
  - `AIGenerationSceneAutoPost = "auto_post"` for historical usage/cost rows.
  - `queue_type = "auto_post"` compatibility in review/feedback logic.
  - Active scheduler entrypoint `RunContentDraftOnce` plus legacy wrapper
    `RunAutoPostOnce`.
- The same script also asserts that old active route registrations remain
  absent from the production router:
  - `RegisterAutoPost`
  - `RegisterDailyXQueue`
- It runs targeted Go compatibility tests for model table names, DTO aliases,
  repository aliases, billing JSON aliases, and route registration.
- This is a guardrail step only. It does not rename DB tables, JSON tags,
  activity keys, AI scene values, queue types, or historical data.
