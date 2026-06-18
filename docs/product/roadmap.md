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
| Account Intelligence | `/accounts`, `/exposure-radar` related panels | real / evolving | Public-account positioning analysis and recommendations based on accessible X data, user-provided context, and internal workflow data. Creator Studio private metrics are explicitly labeled as unavailable unless provided or authorized later. |
| Billing | `/billing` | real | Plans, subscription, orders, AI generation quota, opportunity draft capacity, memory limits, and account/bot limits. |
| Dashboard | `/dashboard` | real | Subscription summary, readiness, recent activity, and operational status. |
| Analytics | `/analytics` | real / evolving | Internal activity analytics, content/handling performance, and available public X metrics. |
| Admin | `/admin` | real | Admin overview, user management, execution metrics, billing operations, and system status. |
| Legacy Automation | downlined | deprecated | Auto Reply, authenticated Auto DM, Auto Comment, Auto Comments, old Auto Post, old Automations page, and old Execution Queue routes are no longer registered as product surfaces. |

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

Detailed product-strength fixes are tracked in
`docs/product/product-strength-optimization-plan.md` and
`docs/product/product-strength-next-optimization-plan.md`. Open product
consolidation and cleanup candidates are tracked in
`docs/product/product-optimization-backlog.md`. The current product focus is to
make Daily Growth Desk the single first-day and daily-return workbench, then
make the first useful value easier to understand and repeat.

1. **Legacy route protection and documentation alignment**
   Keep historical compatibility data visible but safe. Old high-risk automation routes and old frontend aliases are downlined; documents stay aligned with the manual growth workflow.

2. **First-day IA and product-strength optimization**
   Consolidate the first-run path around Daily Growth Desk, then improve the
   first-session guide, evidence layer, learning explainability, website/context
   import, and pricing/package clarity.

3. **Exposure Radar module boundary upkeep**
   Keep `/exposure-radar` page code focused on data loading, state, and orchestration. New UI should land in focused component/helper modules instead of rebuilding a monolithic page.

4. **Cost and rate observability**
   Add admin/operator visibility for X Recent Search calls, Exposure refresh counts, OpenAI generations, skipped refreshes, rate-limit errors, and budget guardrails.

5. **Opportunity quality and learning loop**
   Continue improving hot/rising classification, quality tiers, result feedback, memory reuse, and strategy recommendations.

6. **Account Intelligence clarity**
   Make data-source boundaries explicit: public X data can be used; Creator Studio private audience panels require user-provided input or future authorized data access.

7. **Billing and quota semantic cleanup**
   Keep legacy database fields compatible, but move frontend/API language toward opportunity drafts, review capacity, content memory, account intelligence, and radar refreshes.

8. **UI smoke tests for core workflows**
   Add repeatable checks for login, dashboard, Exposure Radar, Content Drafts, Handling List, Billing, and Admin health.

9. **Legacy document archive**
   Move old Auto Post / Auto Reply / Auto Comment / Auto DM design docs into an archive folder with clear historical labels.

## Priority Status - 2026-06-17

| Priority | Status | Notes |
| --- | --- | --- |
| Legacy route protection and documentation alignment | Done / refreshed | Old `/auto-post`, `/automations`, `/execution-queue`, `/review-queue`, authenticated `/auto-replies`, `/auto-dm`, `/auto-comment`, and `/auto-comments` product routes are downlined. `/automations` now redirects to Dashboard, while authenticated `/automations` API calls remain only as internal compatibility for workflow health and paused-module recovery. Public DM unsubscribe remains for compliance. P0 cleanup also added a real `/content-library` entry, redirected `/agents` to `/oaf-bots`, and consolidated nav/start links around Daily Growth Desk, Content Memory, OAF Bots, and Handling List. |
| First-day IA and product-strength optimization | Done / complete for current batch | PS-0 through PS-9 are complete: Daily Growth Desk is the dominant first-run and daily-return workbench, Content Drafts handles reusable draft generation, `/start-today` enters a guided first-session mode, opportunity cards explain operator evidence, learning panels show what feedback changed, strategy setup can import product context into strategy plus Content Memory, pricing/proof copy is aligned to manual operating capacity, activation loop visibility exists, and Account Intelligence labels data-source boundaries. |
| Exposure Radar modularization | Done / maintain boundary | The former large `/exposure-radar` page is now about 1.2k lines and mainly orchestrates data/state. P1 extracted hero/playbook, session progress, daily review/result learning, operating diagnostics, session workflow, strategy/people radar, handling workbench, and `RadarCard` into focused modules. Future work should keep new panels outside `page.tsx`. |
| Cost and rate observability | Done / refining | `CostUsageLedger` records OpenAI generation cost and major X API usage. Admin exposes OpenAI cost, X API calls, X Trends/Exposure refresh config, skip/failure health, estimated Exposure refreshes/day, budget guardrail status, and recent cost-driving events. |
| Opportunity quality and learning loop | Done / refining | Hot/rising, quality tiers, manual records, result backfill, memory, strategy, people radar, weekly review, operator evidence, learning change summaries, opportunity quality gate, and repeat/slow/measure learning decisions exist. Keep improving ranking quality and context intake. |
| Account Intelligence clarity | Done / refining | Current docs and product surfaces avoid assuming Creator Studio private data. Account Intelligence labels public X data, user-provided context, internal workflow data, unavailable private metrics, includes Account Growth Diagnosis before handoff to Daily Growth Desk, and supports local user-provided Creator Studio notes that can be applied into Growth Strategy operator notes. Future work is structured export upload or authorized private metrics sync. |
| Billing and quota semantic cleanup | Done / compatibility boundary | Frontend/API display prefers content drafts, opportunity drafts, review capacity, content memory, and account intelligence. Legacy DB/JSON fields remain by design for historical data. |
| UI smoke tests for core workflows | Done / refining | Added `scripts/smoke-core-workflows.sh` for static/prod checks and `scripts/smoke-core-ui.mjs` / `npm --prefix frontend run smoke:core` for local or production HTML-shell checks covering login, dashboard, Start Today, Exposure Radar, Content Memory, Content Drafts, Handling List, OAF Bots, Billing, Admin, and optional API health. |
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
| P131 | Account Intelligence to Growth Strategy apply | Done | Account Intelligence can now write target audience, core topics, avoid topics, reply style, safety mode, and operator notes into Exposure Radar Growth Strategy with one action; strategy lookup falls back from Bot-specific to account-level strategy when needed. |
| P132 | First-day activation path | Done | Account Intelligence now hands users into a day-one path: analyze account, apply Growth Strategy, enter Daily Growth Desk, generate the first manual reply, and backfill the result so new users know the next step. |

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
