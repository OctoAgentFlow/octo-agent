# Product Roadmap

This roadmap reflects the current OctoAgentFlow direction: AI-assisted, human-in-the-loop X account operations.

The product should help operators find good opportunities, draft with persona and memory, handle replies manually, and learn from results. It should not push fully automated commenting, spam-like engagement, or guaranteed growth claims.

## Current Product Status

| Area | Main Pages | Status | Notes |
| --- | --- | --- | --- |
| Auth | `/login` | real | Email-code login/register/refresh and admin login. |
| Accounts | `/accounts` | real | X OAuth binding, account list, disconnect, and account readiness checks. |
| OAF Bots | `/oaf-bots` | real | Persona, voice, topics, guardrails, language strategy, generation samples, and learning feedback. |
| Daily Growth Desk | `/exposure-radar` | real | The main daily workbench for opportunity signals, strategy context, diagnostics, people radar, and manual handling. |
| Exposure Radar | `/exposure-radar` | real | Chinese and English opportunity signals from X Recent Search / cached trends, hot/rising classification, quality tiers, diagnostics, reply angles, and result learning. |
| Content Memory | `/content-library` through product flows | real | Stores product points, signal context, reply learnings, source traces, and reusable growth material. |
| Content Drafts | `/content-drafts` | real | Drafts generated from persona, memory, trend context, and opportunity signals. Legacy `/auto-post` route is downlined. |
| Handling List | `/handling-list` | real | Review, edit, copy, open original post, mark handled, record results, and inspect learning feedback. |
| Account Intelligence | `/accounts`, `/exposure-radar` related panels | real / evolving | Public-account positioning analysis and recommendations based on accessible X data. Creator Studio private metrics are not assumed. |
| Billing | `/billing` | real | Plans, subscription, orders, AI generation quota, opportunity draft capacity, memory limits, and account/bot limits. |
| Dashboard | `/dashboard` | real | Subscription summary, readiness, recent activity, and operational status. |
| Analytics | `/analytics` | real / evolving | Internal activity analytics, content/handling performance, and available public X metrics. |
| Admin | `/admin` | real | Admin overview, user management, execution metrics, billing operations, and system status. |
| Legacy Automation | downlined | deprecated | Auto Reply, authenticated Auto DM, Auto Comment, Auto Comments, old Auto Post, and old Execution Queue routes are no longer registered as product surfaces. |

## Runtime Stance

The default scheduler should remain conservative:

- Run content draft generation only through configured planner rules.
- Refresh Exposure Radar with explicit interval controls.
- Refresh X Trends cache with configured intervals and retention.
- Process publishing jobs under publisher guardrails.
- Run billing, point expiry, and operational alerts.
- Do not schedule legacy Auto Reply, Auto Comment, or Auto DM loops.

Any new feature that calls X APIs or OpenAI must expose its refresh cadence, quota impact, and fallback behavior.

## Current Priorities

1. **Legacy route protection and documentation alignment**
   Keep historical compatibility data visible but safe. Old high-risk automation routes and old frontend aliases are downlined; documents stay aligned with the manual growth workflow.

2. **Exposure Radar modularization**
   Split the large `/exposure-radar` page into workbench, signal list, diagnostics, strategy, people radar, manual record, and learning modules.

3. **Cost and rate observability**
   Add admin/operator visibility for X Recent Search calls, Exposure refresh counts, OpenAI generations, skipped refreshes, rate-limit errors, and budget guardrails.

4. **Opportunity quality and learning loop**
   Continue improving hot/rising classification, quality tiers, result feedback, memory reuse, and strategy recommendations.

5. **Account Intelligence clarity**
   Make data-source boundaries explicit: public X data can be used; Creator Studio private audience panels require user-provided input or future authorized data access.

6. **Billing and quota semantic cleanup**
   Keep legacy database fields compatible, but move frontend/API language toward opportunity drafts, review capacity, content memory, account intelligence, and radar refreshes.

7. **UI smoke tests for core workflows**
   Add repeatable checks for login, dashboard, Exposure Radar, Content Drafts, Handling List, Billing, and Admin health.

8. **Legacy document archive**
   Move old Auto Post / Auto Reply / Auto Comment / Auto DM design docs into an archive folder with clear historical labels.

## Priority Status - 2026-06-17

| Priority | Status | Notes |
| --- | --- | --- |
| Legacy route protection and documentation alignment | Done | Old `/auto-post`, `/execution-queue`, `/review-queue`, authenticated `/auto-replies`, `/auto-dm`, `/auto-comment`, and `/auto-comments` product routes are downlined. Public DM unsubscribe remains for compliance. |
| Exposure Radar modularization | In progress | The page has been split into many helpers/components and is much smaller. Recent checkpoints include workspace panels, operating desk panels, people relationship desk, memory asset desk containers, and learning/history panels. Continue extracting remaining page-local panels opportunistically. |
| Cost and rate observability | Done / refining | `CostUsageLedger` records OpenAI generation cost and major X API usage. Admin exposes OpenAI cost, X API calls, X Trends/Exposure refresh config, skip/failure health, estimated Exposure refreshes/day, and budget guardrail status. |
| Opportunity quality and learning loop | Done / refining | Hot/rising, quality tiers, manual records, result backfill, memory, strategy, people radar, and weekly review exist. Keep improving ranking quality and user-facing explanations. |
| Account Intelligence clarity | Done / refining | Current docs and product surfaces avoid assuming Creator Studio private data. Next step is optional user-provided analytics import or future authorized private metrics access. |
| Billing and quota semantic cleanup | Done / compatibility boundary | Frontend/API display prefers content drafts, opportunity drafts, review capacity, content memory, and account intelligence. Legacy DB/JSON fields remain by design for historical data. |
| UI smoke tests for core workflows | Done / refining | Added `scripts/smoke-core-workflows.sh` and runbook coverage for login, dashboard, Start Today, Exposure Radar, Daily X Queue, Content Drafts, Handling List, Billing, Admin, and optional API health. |
| Legacy document archive | Done / refining | Added `docs/product/archive/legacy-automation-docs.md` as the historical archive entry. Individual old docs remain in place to avoid breaking links. |

## Next Product Enhancement Sequence

The next product work should improve decision quality and first-session clarity, not add higher-risk automation.

| ID | Priority | Status | Goal |
| --- | --- | --- | --- |
| P125 | Account Intelligence handoff | Done | Keep `x_account_id` / `bot_id` context when moving from Account Intelligence into Daily Growth Desk, auto-pair bound Bots, and show the active account/Bot context on the desk. |
| P126 | Opportunity fit scoring | Done | Signal cards and the handling workbench now show account fit score, fit keywords, avoid-topic guardrails, and on-lane/off-lane reasoning using existing `account_fit_*` fields plus local fallback inference. |
| P127 | Reply quality coach | Done | Reply quality checks now include context, selected angle, specificity, length, non-promotional tone, and no growth-promise checks before copying/publishing manually. |
| P128 | Result review next move | Done | Result learning actions now include visible next-action labels and metrics such as backfill links, repeat proven angle, slow down a weak lane, or handle the next controlled experiment. |
| P129 | First-session guided path | Done | First-day launch now includes a guided first-session path: bind account/Bot, save strategy, handle one opportunity, and backfill one measurable result before scaling. |
| P130 | Packaging and pricing clarity | Done | Marketing, billing, and plan feature labels are further aligned around Account Intelligence, Daily Growth Desk, opportunity drafts, content memory, review capacity, and learning windows. |

## Milestones

| Milestone | Status | Scope |
| --- | --- | --- |
| M1 | done | Scaffold, auth, wallet, accounts, and base dashboard. |
| M2 | done | OAF Bot persona, billing, content library, and review workflows. |
| M3 | done | Exposure Radar, Chinese/English signal collection, manual reply drafting, memory, and result feedback. |
| M4 | done / refining | Daily Growth Desk packaging, people radar, strategy guidance, quality tiers, diagnostics, and onboarding states. |
| M5 | current | Legacy automation safety, documentation alignment, cost observability, and core page modularization. |
| M6 | next | Stronger account intelligence, operator playbooks, workflow tests, and pricing/package clarity. |

## Non-Goals

- No guaranteed growth or guaranteed engagement claims.
- No spam-at-scale positioning.
- No default background auto-commenting or auto-DM outreach.
- No assumption that X Creator Studio private analytics are available unless explicitly authorized or provided by the user.
