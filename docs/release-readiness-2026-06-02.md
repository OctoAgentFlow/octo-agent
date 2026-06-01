# Release Readiness - 2026-06-02

## Decision

Do not deploy production yet.

The release boundary is now staged as one coherent package, backend tests pass, frontend lint/build pass, and the Admin 404s on test have been removed. The remaining production gate is a final release review, especially schema safety for the two new AutoMigrate models and a final full authenticated test audit after the complete package is deployed.

## Current Branch And Working Tree

- Current branch: `main`
- Working tree: release package staged.
- Excluded from release package:
  - `docs/product/oaf-product-deep-research-2026-05.md`

## Release Scope Observed

- Opportunity Inbox page and sidebar/mobile navigation entry.
- Dashboard operations workbench and release/post-publish review surfaces.
- Execution Queue bulk actions, feedback issue verdicts, details, and handling flows.
- OAF Bot generation feedback, learning rule preferences, and feedback-informed generation/rewrite behavior.
- Auto Post, Auto Reply, Auto Comment, and Post generation/rewrite feedback integration.
- Activity narrative updates and service/data contract expansion.
- Test-site audit automation using isolated Chrome profile and control/link checks.

## Validation Completed

- `go test ./...` in `backend`: passed.
- `npm run lint` in `frontend`: passed.
- `npm run build` in `frontend`: passed.
- Direct Admin API verification on test: passed.
  - `/admin/overview`: 200
  - `/admin/users?page=1&page_size=20`: 200
  - `/admin/points/activities`: 200
  - `/admin/points/users?page=1&page_size=20`: 200
  - `/admin/points/risk-config`: 200
- Authenticated test-site audit:
  - Routes: 21
  - Failed routes: 0
  - Controls checked: 509
  - Latest report: `logs/audit/test-site-audit-latest.md`
- Focused retry after API restart:
  - `/settings`: OK
  - `/admin`: OK

## Release Blockers

1. Migration needs explicit production review.
   `AutoMigrate` now includes:
   - `ReviewQueueFeedbackIssueVerdict`
   - `OAFBotLearningRulePreference`
   These should be checked against prod migration policy and rollback expectations before deployment.

2. Test environment private config had drift.
   During backend API restart, test was missing stable `JWT_SECRET` and `MYSQL_DSN` in server-private config. These were restored in `/home/ubuntu/octo/octo-agent/backend/configs/.env`, but production deployment should verify prod private config before restart.

## Non-Blocking Warnings To Triage

- Several pages include business copy containing words like `Failed`, `Restricted`, or `Unknown error`; the audit flags these as visible error text even when they may be labels or empty-state copy.
- Some expected controls are absent in the current test account data state, such as queue retry/select-all or billing upgrade/current controls. These are warnings, not hard failures.

## Recommended Next Steps

1. Review the staged release diff.
2. Review the two new AutoMigrate models for prod schema safety.
3. Verify prod private config before any restart:
   - `JWT_SECRET`
   - `MYSQL_DSN`
4. Deploy the full staged package to test if any staged file has not yet been synced there.
5. Re-run:
   - `go test ./...`
   - `npm run lint`
   - `npm run build`
   - authenticated `node scripts/audit-test-site.mjs --base=https://test.octo-agent.com`
6. Only then create the release commit and deploy production.
