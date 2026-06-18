# Current Product Strength Execution Batch

Status: Active.

This batch tracks the 9 practical follow-up items after the OAF Bots
component/action split and the latest product-strength review. Update this file
whenever an item is completed or deliberately held at a compatibility boundary.

## Scope

| # | Item | Status | Implementation note |
| --- | --- | --- | --- |
| 1 | Core workflow UI/API smoke tests | Done / refining | Added `scripts/smoke-core-ui.mjs`, `npm --prefix frontend run smoke:core`, `scripts/smoke-core-api.mjs`, `npm --prefix frontend run smoke:api`, and runbook instructions for local/production route-shell, API-shape, auth-boundary, diagnostics, and activation-readiness checks. |
| 2 | Continue splitting large pages | Done for this batch | Moved Content Drafts helper/model logic into `components/content-drafts/content-draft-workbench-model.ts` and Handling List helper/model logic into `components/handling-list/handling-list-model.ts`. |
| 3 | OAF Bots remaining orchestration split | Done for this batch | Previous batch extracted data/action hooks; this batch moved wizard/persona helper logic into `components/oaf-bots/oaf-bot-model.ts`. |
| 4 | Creator Studio/private analytics manual import | Done / local-first | Account Intelligence stores local private analytics notes, supports local paste/file import for Creator Studio observations, parses structured audience/country/active-time/growth/content/weak-signal fields, and appends user-provided observations into Growth Strategy operator notes when applied. |
| 5 | Result backfill and learning loop reinforcement | Done / refining | Learning Insights now shows handled, pending backfill, backfilled, and learning-cue counts so result feedback is visible. |
| 6 | First-day/user validation material | Done | Added `docs/runbooks/first-day-user-validation.md` for account analysis, strategy apply, manual reply, result backfill, and learning status validation. |
| 7 | Legacy route traffic audit | Done / operational gate | Existing `docs/runbooks/legacy-route-traffic-audit.md` remains the production access-log gate before any final deletion. |
| 8 | High-risk backend naming/data migration plan | Compatibility boundary documented | Added `docs/technical/high-risk-legacy-data-migration-plan.md`; do not rename `auto_post_*` DB tables, persisted JSON keys, AI scene names, or historical activity keys in this batch. |
| 9 | Documentation sync | Done for this batch | Updated docs index, smoke runbook, execution plan, and product-strength audit references. |

## Completion Rules

- Do not ship a direct DB/key rename as part of this batch.
- Keep user-facing copy aligned to manual, safe Daily Growth Desk workflows.
- Run `npm --prefix frontend run lint`, `npm --prefix frontend run lint:i18n`,
  `npm --prefix frontend run build`, `npm --prefix frontend run smoke:core`,
  and `npm --prefix frontend run smoke:api` when an API server is reachable before
  considering the batch ready.
- When a backlog item is resolved, update this file and the relevant audit file
  in the same commit.
