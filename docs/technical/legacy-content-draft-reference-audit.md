# Legacy Content Draft Reference Audit

Date: 2026-06-14

## Scope

This audit covers remaining `AutoPost`, `auto_post`, `autoPost`, `auto-post`,
and `Auto Post` references after the Content Draft route, DTO, quota, admin,
activity display, and AI service alias passes.

Latest scan:

- `1752` total matches.
- `1652` matched lines.
- `81` files with matches.
- `478` files searched under `backend/internal` and `frontend/src`.

The remaining matches are not all cleanup debt. Most are compatibility anchors
for existing rows, routes, JSON fields, historical activity keys, or rollback
paths.

## Category A: Low-Risk Cleanup

These references are internal helper names or display mappers. They are safe to
rename when covered by existing tests because they do not define persisted
storage, public JSON, route names, scene strings, or activity keys.

| Area | Current Reference | Suggested Name | Notes |
| --- | --- | --- | --- |
| Automation service helpers | `syncAutoPostPlannerEnabled`, `applyAutoPostPlannerState` | `syncContentDraftPlannerEnabled`, `applyContentDraftPlannerState` | Completed in P3.6. Internal helpers over the Content Draft plan repository. |
| AI rewrite helper | `normalizeAutoPostRewriteMode` | `normalizeContentDraftRewriteMode` | Completed in P3.6. Pure prompt helper; no stored values. |
| Review Queue mapper | `autoPostDraftToReviewQueueItem` | `contentDraftToReviewQueueItem` | Completed in P3.6. Internal DTO mapper; keeps `type=post`. |
| Publishing helper | `processAutoPostPublishJob` | `processContentDraftPublishJob` | Completed in P3.6. Internal publishing flow helper; keeps `publish_jobs.source_type`. |
| Content Library picker | `PickActiveForAutoPost` | `PickActiveForContentDraft` | Completed in P3.6. New helper added; legacy wrapper kept for compatibility. |
| Frontend display fallback | `Auto Post` summary fallback in Handling List | Keep as compatibility alias | The frontend should accept old and new summaries while displaying Content Draft copy. |

## Category B: Preserve For Compatibility

These references should remain for now. Removing or renaming them would break
older clients, rollback behavior, historical rows, or API consumers.

| Area | Reference Examples | Why It Stays |
| --- | --- | --- |
| Legacy API routes | `/api/v1/auto-post/*`, `/auto-post` compatibility route | Existing bookmarks, older frontend builds, scripts, and rollback safety. |
| Legacy service/controller wrappers | `AutoPostController`, `NewAutoPostController`, `AutoPostService`, `NewAutoPostService` | Existing constructors/tests/imports can keep working while new wiring uses Content Draft aliases. |
| DTO aliases and wire shapes | `AutoPostPlanRequest`, `AutoPostDraftItem`, `AutoPostGenerationRunItem` | The JSON contract is shared by `/auto-post/*` and `/content-drafts/*`. |
| Frontend compatibility service | `frontend/src/services/auto-post.service.ts` | Old import path and old type names remain as wrappers while new callers use Content Draft services. |
| Billing/quota compatibility fields | `monthly_auto_posts`, `daily_auto_posts`, `auto_posts_month`, `auto_posts_today`, `monthlyAutoPosts` | API consumers and plan storage still use these fields; semantic aliases are additive. |
| OAF Bot readiness flags | `auto_post_not_ready`, `auto_post_not_ready_count` | Stored/filter semantics and dashboard data shape still use the old flag. |
| Activity display aliases | `activity.preview.autoPost*` dictionary keys and display mapping | Historical `activity_logs.preview_key` values must continue resolving. |
| Activity source strings | `System / Auto Post` | Existing activity source parsing expects this value; display aliases handle user-facing wording. |
| Legacy source query | `source=auto_post` in post create flow | Existing links can continue opening the Content Draft source mode. |

## Category C: Future Migration Only

These are high-risk migration projects and should not be changed during routine
cleanup.

| Area | Reference Examples | Required Gate |
| --- | --- | --- |
| Database model/table names | `AutoPostPlan`, `AutoPostDraft`, `AutoPostGenerationRun`, `auto_post_plans`, `auto_post_drafts`, `auto_post_generation_runs` | Dedicated DB migration, backup, rollback plan, and `TableName()` compatibility tests. |
| Queue and publish types | `queue_type=auto_post`, `PublishSourcePost` consumers that point at Auto Post draft rows | Data migration and review/publishing compatibility tests over old and new rows. |
| AI usage scene values | `AIGenerationSceneAutoPost = "auto_post"` | Backfill plan and before/after reporting comparison for usage/cost dashboards. |
| Activity preview keys | Stored `activity.preview.autoPost*` values | Backward display mapping and optional future-key emission plan. |
| Subscription package internals | `MonthlyAutoPosts`, `DailyAutoPosts` and sibling storage fields | Dual-read/dual-write period and billing regression test matrix. |
| Migration descriptions | Legacy migration strings mentioning Auto Post | Historical schema documentation; not user-facing product copy. |
| Legacy route removal | `/auto-post`, `/execution-queue`, `/api/v1/auto-post/*` | Production access-log audit showing no meaningful traffic for a defined window. |

## P3.6 Completion

P3.6 completed the Category A helper naming pass. The remaining `AutoPost` and
`auto_post` references should be treated as Category B compatibility contracts
or Category C migration projects unless a fresh audit proves otherwise.
