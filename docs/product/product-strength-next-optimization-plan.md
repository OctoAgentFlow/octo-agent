# Product Strength Next Optimization Plan

Last updated: 2026-06-18

This document tracks the next product-strength batch after PS-0 through PS-9.
Those earlier fixes made Daily Growth Desk the primary manual growth workflow.
This batch focuses on making the product feel useful faster, clearer, and more
repeatable for a new operator.

## Current Product Strength Read

OctoAgentFlow is ready for early-user trials, but not yet ready for broad paid
acquisition. The product now has the right direction: one daily workbench for
manual, safe X growth. The next risk is not missing features; it is whether a
new user can quickly understand what to do, trust why a signal is recommended,
see what changed after feedback, and connect account analysis to action.

## Optimization Sequence

| ID | Priority | Status | Shortcoming | Optimization Target | Completion Evidence |
| --- | --- | --- | --- | --- | --- |
| PSN-0 | P0 | Done | Product-strength gaps were discussed but not tracked as an executable plan. | Create a dedicated follow-up plan that can be updated as each product gap is closed. | This document defines the next batch and will be linked from roadmap / docs index. |
| PSN-1 | P0 | Done | First-day flow exists, but the next best action can still feel like a checklist instead of a coach. | Add a first-day coach layer that tells users exactly what to do now, why it matters, and what counts as done. | Daily Growth Desk first-day card now shows a coach panel driven by the incomplete step: do now, why it matters, and done means. |
| PSN-2 | P1 | Done | Opportunity signals have evidence, but the overall quality of the current batch is not instantly legible. | Add a quality gate to Opportunity Evidence Desk: readiness score, recommended handling pace, and evidence mix. | Opportunity Evidence Desk now summarizes whether to handle one signal now, observe first, or tune collection before handling. |
| PSN-3 | P1 | Done | Result learning exists, but users need an obvious "tomorrow changes because of this" view. | Add a learning decision strip that turns backfills, best results, safety warnings, and next moves into next-session guidance. | Result Learning Loop now shows repeat, slow-down, and next-measure actions. |
| PSN-4 | P1 | Done | Account Intelligence gives diagnosis, but the account-to-desk transition could feel more like a growth report. | Add Account Growth Diagnosis: current lane, content gap, safest next move, and strategy handoff. | Account Intelligence page now shows a Growth Diagnosis panel before detailed positioning. |

## Post-PSN Defect Closure

| ID | Priority | Status | Issue | Resolution | Completion Evidence |
| --- | --- | --- | --- | --- | --- |
| PSN-FIX-1 | P0 | Done | The legacy `/automations` page could still look like a user-facing product surface. | Redirect the page to `/dashboard`; route all old links to Daily Growth Desk, Content Drafts, or Handling List. Keep authenticated `/automations` API only as an internal workflow-health compatibility surface. | `/automations` frontend route is now a redirect and user links no longer point to it. |
| PSN-FIX-2 | P0 | Done | Analytics and module health still exposed old DM Review / Auto DM semantics. | Remove the DM operations panel and hide `dm` from user-facing module health lists while preserving historical/internal data compatibility. | Analytics module health, account module pills, Dashboard workflow health, and OAF Bot relationship panels only show current workflow modules. |
| PSN-FIX-3 | P0 | Done | Some visible copy still described a control center or automation failure. | Rewrite public-facing copy toward workflow health, workspace, manual handling, and Daily Growth Desk language. | i18n strings for account blockers, activity troubleshooting, dashboard health, settings notifications, and OAF Bot focus use the new product language. |
| PSN-FIX-4 | P1 | Done | OAF Bot readiness still treated `autopilot` as a setup requirement. | Treat enabled content draft planning plus bound account/persona/memory as the readiness path; no longer require autopilot mode. | OAF Bot readiness and Content Draft setup guide now accept the review-first workflow. |
| PSN-FIX-5 | P1 | Done | Docs did not clearly distinguish downlined product routes from compatibility APIs. | Update roadmap/page-list and this document with the explicit compatibility boundary. | Legacy docs now say the page is downlined/redirected and API compatibility remains only for internal workflow health. |

## Execution Rules

1. Keep the product promise manual and safe: no guaranteed growth, spam, or
   default auto-commenting language.
2. Prefer product clarity over new backend state in this batch.
3. Use existing data already available in Account Intelligence and Exposure
   Radar before adding API cost.
4. Update this document, `docs/product/roadmap.md`, and
   `product/product-strength-audit.md` when each item is completed.

## Completion Target

PSN-0 through PSN-4 and PSN-FIX-1 through PSN-FIX-5 are complete. Local validation passed with:

- `npm --prefix frontend run lint:i18n`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
- `go test ./...` from `backend/`
- `git diff --check`
