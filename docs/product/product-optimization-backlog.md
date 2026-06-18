# Product Optimization Backlog

Last audited: 2026-06-18
Last updated: 2026-06-18

This document records product areas that are incomplete, low-value, redundant,
or risky against the current OctoAgentFlow positioning:

> AI-assisted, human-in-the-loop X account operations centered on Daily Growth
> Desk, OAF Bot persona, Content Memory, manual handling, and result learning.

The goal is not to delete everything old immediately. The goal is to keep the
product simple enough that a first user can understand the workflow, get value
on day one, and trust the system.

## Audit Scope

Checked:

- Frontend routes under `frontend/src/app`.
- Primary and mobile navigation under `frontend/src/components/layout`.
- Product docs: `docs/product/roadmap.md`, `docs/product/page-list.md`,
  `docs/product/product-strength-optimization-plan.md`,
  `docs/product/product-strength-next-optimization-plan.md`.
- Frontend services and visible legacy references under `frontend/src/services`
  and `frontend/src/i18n/dictionaries`.
- Large page/component hotspots by line count.

## Product Stance

Keep as core:

- `/exposure-radar` as Daily Growth Desk.
- `/accounts` plus Account Intelligence.
- `/oaf-bots` as persona, guardrails, and learning setup.
- `/content-library` / Content Memory.
- `/content-drafts` for reusable post draft generation.
- `/handling-list` for human review, copy, manual publish, and result tracking.
- `/billing`, `/admin`, and cost/rate observability.

Reduce, merge, hide, or remove:

- Duplicate post-draft workflows.
- Old publish/approve semantics that sound like automation.
- Standalone pages that are no longer part of first-day value.
- Legacy service/API naming where it leaks into product logic.
- Gamification/points flows unless they directly support acquisition or payment.

## Progress Tracker

| ID | Status | Completion Note |
| --- | --- | --- |
| OPT-0 | Done | Handling List now uses manual handling language. `autopilot` is hidden from user filters, dry-run/real-publish result filters are no longer offered in the default visible filter set, and direct publisher actions are limited to post drafts. |
| OPT-1 | Done | `/daily-x-queue` now redirects to `/content-drafts?panel=generate&legacy_source=daily_x_queue`; internal product links were moved to Content Drafts. The old frontend service is explicitly marked compatibility-only. |
| OPT-2 | Done | `/content-library` is now a first-class Content Memory page with create/edit/status/delete actions, metrics, status filters, generation handoff, and focus highlighting for `memory_id` / `content_item_id` links. |
| OPT-3 | Done | `/posts/create` redirects into Content Drafts generation mode. Posts remain as archive/direct management rather than the main creation path. |
| OPT-4 | Done for current product-risk scope | OAF Bots no longer exposes DM as a sample/usage scene in the main page, and copy focuses on persona, content memory, guardrails, learning, and draft workflows. Full page modularization remains engineering maintenance, not a blocking product-positioning issue. |
| OPT-5 | Done | `/points` redirects to `/billing`; dashboard copy reframes the surface as billing credits/referrals instead of a standalone points loop. |
| OPT-6 | Done | `/trends` redirects to Exposure Radar source-health diagnostics. Trend tools remain admin/debug context instead of a separate user growth page. |
| OPT-7 | Done | Activity is framed as support/debug history; Analytics is documented as operations analytics plus available public X metrics, not a Creator Studio replacement. |
| OPT-8 | Done | Account Intelligence now includes a local private-analytics notes panel for audience, countries, active times, follower growth, top formats, and weak signals. The notes stay in the browser and can guide strategy decisions without claiming API access to private Creator Studio data. |
| OPT-9 | Done | Exposure Radar sample mode is explicitly labeled as a local demo only, is not used as automatic fallback when real signals are empty, and keeps diagnostics/empty-state recovery as the real live-data path. |
| OPT-10 | Done | User-visible "Hourly Brief" language was migrated toward Opportunity Summary / Desk Summary wording. Remaining `brief` DTO fields are compatibility payloads. |
| OPT-11 | Done as compatibility boundary | `content-drafts.service.ts` is the new import path for draft workflows; `auto-post.service.ts` and `daily-x-queue.service.ts` carry explicit compatibility notes. Database names, JSON fields, and historical activity keys stay unchanged by design. |
| OPT-12 | Done for current product-risk scope | Exposure Radar has already been modularized heavily; this batch keeps the remaining large-page concern as engineering maintenance. New UI should continue landing in focused components rather than page monoliths. |
| OPT-13 | Done | DM wording is historical/compatibility-only in visible labels. Public unsubscribe remains for compliance. |
| OPT-14 | Done | Product docs now carry stronger archive/compatibility warnings, and current page-list/roadmap docs point contributors to the manual Daily Growth Desk direction before reusing old automation ideas. |

## Priority Backlog

| ID | Priority | Area | Problem Type | Finding | Recommended Decision | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| OPT-0 | P0 | Handling List | Risky / confusing | The current queue still mixes "approve", "ready to publish", publisher mode, dry run, real publish, bulk approve, and `autopilot` filters. For a manual-safe growth workflow, this can make users think the product is still pushing automatic publishing. | Split the page into "Manual Handling" and "Publisher/Advanced" modes. Rename `Approve` to `Mark usable` or `Move to handled` for opportunity replies. Hide or gate bulk approve / real publish for new users. Keep publisher state for post drafts only until the product intentionally supports direct publishing again. | `frontend/src/app/(dashboard)/handling-list/page.tsx` has `statusOptions`, `modeOptions`, `publishOutcomeOptions`, `approve`, `runBulkAction`, and publish controls. |
| OPT-1 | P0 | Daily X Queue vs Content Drafts | Redundant | `/daily-x-queue` and `/content-drafts` both handle source material, OAF Bot draft generation, review/rewrite/copy, and content memory. This splits the user's mental model after the product already chose Daily Growth Desk as the main path. | Merge Daily X Queue into Content Drafts as a "Daily Draft Session" panel or retire it behind an advanced route. Redirect user links gradually after migration. | `/daily-x-queue` is 1,042 lines and uses `/daily-x-queue/source-material`, `/generate`, `/drafts/:id/*`; Content Drafts already has content library, planner, one-off generation, and strategy generation. |
| OPT-2 | P0 | Content Memory route | Incomplete surface | `/content-library` is a primary nav item, but the route redirects into a panel inside Content Drafts. This can feel like a fake page or hidden feature. | Either build a real Content Memory page or remove it from primary nav and keep it as a panel inside Content Drafts. Recommended: make it first-class because Content Memory is central to the value proposition. | `docs/product/page-list.md` says `/content-library` redirects to `/content-drafts?panel=content#content-library`. |
| OPT-3 | P0 | Posts | Redundant / legacy | `/posts` is a traditional post CRUD/calendar surface while Content Drafts and Handling List already own the current creation/review loop. It also still uses old "auto post" source language. | Hide from user flows or reframe as "Post Archive / Calendar" with read-only history. Move creation/generation into Content Drafts. Remove direct references to old `auto_post` source semantics from user-visible flows. | `frontend/src/components/posts/posts-client.tsx` links to Daily X Queue, Content Drafts, and Handling List; `post-create-client.tsx` still uses `source?: "auto_post"`. |
| OPT-4 | P1 | OAF Bots | Overloaded / maintenance risk | `/oaf-bots` is still the largest page by far and mixes persona setup, account matrix, usage, trend links, samples, learning, relationship readiness, and workflow health. This is core, but too dense. | Split into focused modules: Persona Builder, Account Binding, Learning & Safety, Test Lab, and Account Strategy Handoff. Hide DM/sample scenes that are not part of the current product promise. | `frontend/src/app/(dashboard)/oaf-bots/page.tsx` is about 5,815 lines; `usageSceneOrder` still includes legacy generation scenes. |
| OPT-5 | P1 | Points Center | Low-value / unclear | `/points` adds referral, redemption codes, discounts, activity claims, and point risk controls. It is not in primary nav, but it can distract from product value and adds billing/support complexity. It also sends users back to Daily X Queue, which is itself a consolidation candidate. | Freeze or hide until pricing/referral strategy is final. If kept, simplify into Billing credits only: invite credit, coupon credit, and usage credit. Remove activity tasks tied to Daily X Queue if that page is merged. | `frontend/src/app/(dashboard)/points/page.tsx` links point activities to `/daily-x-queue`; admin has point risk/redemption/cost management. |
| OPT-6 | P1 | Trends page | Redundant / advanced | `/trends` is not in primary nav, but it duplicates parts of Exposure Radar and Content Draft trend matching. It is more of an internal/debug surface than a user product page. | Move to Admin or fold into OAF Bot trend preferences / Exposure Radar diagnostics. Keep direct route as advanced/debug only if needed. | `frontend/src/app/(dashboard)/trends/page.tsx` shows cache status, Bot matches, risk/category filters; Admin already has trend cache/rule tools. |
| OPT-7 | P1 | Activity / Analytics | Overlapping surfaces | `/activity`, `/analytics`, dashboard recent activity, and admin activity all show operational history. Users may expect X Creator Studio-like analytics, but the current analytics are mostly internal workflow analytics plus available public metrics. | Reframe `/analytics` as "Results" or "Operations Analytics"; make `/activity` a support/debug drawer rather than a standalone user destination. Add explicit data-source labels. | `/analytics` uses `automation_breakdown`, `activityNarrativeLine`, recent posts and attention items; `/activity` has broad event filters including legacy `dm`. |
| OPT-8 | P1 | Account Intelligence | Incomplete data intake | Product clearly labels Creator Studio private metrics as unavailable, but it does not yet give users a structured way to paste/upload private analytics data. This limits the value of account diagnosis. | Add manual analytics intake: audience country/age/device, active time, follower growth, best posts, and creator notes. Then feed it into Growth Strategy. | `docs/product/roadmap.md` notes user-provided context or future authorized access is needed. |
| OPT-9 | P1 | Exposure Radar sample mode | Potentially confusing | Sample mode is useful for onboarding, but if real signals are missing it may mask a data-quality issue. Users can confuse demo actions with real collection results. | Keep sample mode only in first-day/demo context with stronger "local demo only" styling. On live pages, prefer Collection Diagnostics and clear empty-state reasons. | `frontend/src/app/(dashboard)/exposure-radar/page.tsx` uses `sampleMode` and local sample overrides when real items are empty. |
| OPT-10 | P1 | Hourly Brief / Brief memory | Residual old concept | "Hourly Brief" / "Brief memory" still appears in Content Memory filters, strategy empty states, marketing release copy, and service types. The current product has moved to Daily Growth Desk and opportunity signals. | Decide whether Brief is still a product concept. If not, migrate Brief memory to "Desk summary" or "Opportunity summary" and remove Hourly Brief wording. | `frontend/src/i18n/dictionaries/*` includes `Hourly Brief`, `小时简报`, and `contentLibrary.filters.source.brief`; `frontend/src/services/exposure-radar.service.ts` still exposes `brief`. |
| OPT-11 | P2 | Legacy service naming | Maintenance debt | Frontend services still include `auto-post.service.ts`, `automation.service.ts`, `agent.service.ts`, and DTO fields like `auto_posts_month`. Compatibility is intentional, but the naming leaks into new code and increases future mistake risk. | Add a compatibility boundary: new `content-draft-workflow.service`, `workflow-health.service`, and `oaf-bot-compat.service` aliases. Gradually move callers to the new names while keeping old API payloads stable. | `frontend/src/services/auto-post.service.ts`, `automation.service.ts`, `agent.service.ts`, `billing.service.ts`, and `oaf-bot.service.ts`. |
| OPT-12 | P2 | Large page hotspots | Maintenance risk | Several pages remain large enough that future changes are riskier than necessary. | Continue modularization after product decisions: OAF Bots first, then Content Drafts, Handling List, Admin, Dashboard. Keep page files mostly orchestration/state. | Approximate line counts: OAF Bots 5,815; Content Drafts 3,110; Handling List 2,887; Admin 2,309; Dashboard 1,729. |
| OPT-13 | P2 | DM historical labels | Residual legacy | DM is hidden from main product modules, but legacy DM labels can still surface through Activity/history if old rows exist. | Rename visible historical labels to "Historical DM record" and hide DM filters unless old data is present. Keep public unsubscribe for compliance. | `activity.type.dm`, `activity.source.dm`, `handlingList.sourceDesc.dm`, and related i18n keys remain for historical data. |
| OPT-14 | P2 | Documentation archive | Documentation debt | Old Auto Post / Auto DM design docs remain in place with archive warnings. This preserves links, but future contributors may still read stale docs first. | Move individual old docs into `docs/product/archive/` or add stronger top-of-file warnings and index links from this backlog. | `docs/product/auto-post-oaf-bot-redesign.md`, `oaf-bot-billing.md`, `oaf-bot-execution-mode.md`, and deep research docs still contain older automation concepts. |

## Suggested Execution Order

Current batch status: completed or moved behind explicit compatibility /
maintenance boundaries as shown in the Progress Tracker above. This sequence is
kept as the audit rationale, not as an open to-do list.

1. **OPT-0 Handling List semantics cleanup.**
   This is the highest trust issue. The page should say "copy", "mark handled",
   "record result", and "retry failed item" before it says "publish" or
   "approve".

2. **OPT-2 Content Memory first-class decision.**
   Either make Content Memory a real page or remove it from primary nav. This is
   a visible IA promise.

3. **OPT-1 + OPT-3 draft workflow consolidation.**
   Merge Daily X Queue and traditional Posts into Content Drafts / Handling
   List. This reduces the number of ways to create a post.

4. **OPT-4 OAF Bot simplification.**
   Split the page and hide advanced/legacy scenes so persona setup feels less
   intimidating.

5. **OPT-7 + OPT-8 result/account analytics clarity.**
   Rename analytics surfaces and add manual Creator Studio data intake.

6. **OPT-5 + OPT-6 secondary route decisions.**
   Decide whether Points and Trends are product features, admin/debug tools, or
   hidden experiments.

7. **OPT-10 + OPT-13 residual wording cleanup.**
   Remove or rename Brief/DM historical product words from user-facing surfaces.

8. **OPT-11 + OPT-12 maintenance cleanup.**
   After product IA is stable, rename compatibility service layers and continue
   large-page modularization.

## Candidate Feature Disposition

| Feature / Surface | Current Recommendation | Reason |
| --- | --- | --- |
| Daily Growth Desk / Exposure Radar | Keep and improve | This is the clearest product differentiator. |
| Account Intelligence | Keep and improve | Strong day-one value when tied to strategy. Needs private analytics intake. |
| OAF Bot | Keep and simplify | Core persona/memory/guardrail layer, but page is overloaded. |
| Content Memory | Keep, make first-class | Strong concept, weak route implementation. |
| Content Drafts | Keep, absorb duplicate drafting | Should own post draft generation. |
| Handling List | Keep, rename around manual work | Core human-in-the-loop surface, but current publish language is too broad. |
| Daily X Queue | Merge or hide | Duplicates Content Drafts and weakens the main workflow story. |
| Posts | Hide or convert to archive/calendar | Duplicates Content Drafts and Handling List for creation. |
| Trends | Admin/debug or fold into Radar | Duplicate trend context surface. |
| Points | Freeze or simplify into billing credit | Not essential to current product value and adds complexity. |
| Activity | Support/debug | Useful, but not a primary user destination. |
| Analytics | Rename to Results / Operations Analytics | Avoid Creator Studio expectations unless private metrics are imported. |
| Legacy automation APIs | Compatibility only | Keep only where needed for health/status/history. |

## Update Rule

When a backlog item is fixed:

1. Change its status in this document by adding a short "Completion note" below
   the table or moving it to a completed section.
2. Update `docs/product/roadmap.md` if the fix changes product direction.
3. Update `docs/product/page-list.md` if a route is merged, hidden, or
   redirected.
4. Run at least `npm --prefix frontend run lint:i18n` and `git diff --check`
   for copy/route-only changes; run frontend build and backend tests when code
   paths change.
