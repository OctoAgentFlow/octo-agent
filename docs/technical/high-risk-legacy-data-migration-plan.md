# High-Risk Legacy Data Migration Plan

Status: Compatibility boundary.

This plan covers legacy names that still contain `auto_post`, `AutoPost`,
`autoPost`, old activity keys, AI scene values, and quota fields. These names
are no longer the product story, but many of them are persisted contracts. Do
not rename them casually during UI cleanup or page modularization.

## Contracts That Must Not Be Renamed In Routine Refactors

| Contract | Examples | Risk |
| --- | --- | --- |
| Database tables/models | `auto_post_plans`, `auto_post_drafts`, `auto_post_generation_runs` | Breaking historical rows, rollback, migrations, and query compatibility. |
| JSON/API fields | `monthly_auto_posts`, `auto_posts_month`, `daily_auto_posts` | Breaking frontend/admin/billing consumers and stored plan payloads. |
| Activity keys | `activity.preview.autoPost*` | Historical activity rows would stop rendering human-readable labels. |
| AI usage scenes | `auto_post` | Cost analytics and usage aggregation would split or lose historical totals. |
| Queue/publish source contracts | legacy post-draft source names | Review queue and publishing rows may become unreadable or unretryable. |

## Required Migration Sequence

1. Add new semantic aliases in code first.
2. Dual-read old and new fields.
3. Dual-write old and new fields for at least one release.
4. Add backfill scripts with row counts and dry-run output.
5. Add regression tests for old rows and new rows.
6. Deploy with observability for read/write mismatches.
7. Back up production database.
8. Run migration in dry-run mode.
9. Run migration in production with rollback instructions ready.
10. Keep old display aliases until historical rows no longer need them.

## Current Decision

- Keep persisted legacy names in place.
- Continue adding semantic wrappers such as Content Draft, Handling List,
  opportunity drafts, review capacity, and Content Memory at the UI/API DTO
  boundary.
- Treat any direct persisted rename as a separate migration project, not part of
  product-strength cleanup.

## Pre-Migration Checklist

- [ ] Product owner confirms no rollback to old release is required.
- [ ] DB backup completed and restore command tested.
- [ ] Backfill script prints affected row counts before mutation.
- [ ] API consumers are known and have switched to semantic aliases.
- [ ] Admin cost/usage dashboards can merge old and new scene names.
- [ ] Activity rendering resolves both old and new preview keys.
- [ ] Smoke tests pass for Content Drafts, Handling List, Daily Growth Desk,
      Billing, Admin, and account strategy handoff.

## Rollback Rule

If any production route, billing view, activity view, or publishing retry path
cannot resolve historical rows after migration, stop and roll back to the last
release that reads old contracts directly. Do not delete old columns or table
aliases until at least one stable release has dual-read coverage.
