# Product Strength Optimization Plan

Last updated: 2026-06-18

This document tracks the next product-strength fixes for OctoAgentFlow.

The product has enough value to test with early users, but it should not be
marketed broadly until the first-day path, proof layer, and packaging are
clearer.

## Product Strength Thesis

The strongest product wedge is Daily Growth Desk:

> Help an operator open one workbench each day, find the right X opportunities,
> draft safe persona-aware replies, publish manually, record results, and let the
> system learn from that feedback.

Daily Growth Desk should be the primary product experience. Content Drafts,
Handling List, OAF Bots, and Content Memory should support that workflow
instead of competing with it as separate first-run concepts. The former Daily X
Queue route is now a compatibility redirect into Content Drafts.

## Current Assessment

| Dimension | Rating | Notes |
| --- | --- | --- |
| Value for experienced X operators | 7/10 | Opportunity signals, manual reply workflow, result feedback, and memory create real operator value. |
| New-user first-day clarity | 5.5/10 | The product still exposes too many adjacent concepts before the user understands the core loop. |
| Team / agency usefulness | 6.5/10 | Multi-step workflow, memory, and review surfaces are promising, but proof and reporting need to be stronger. |
| Self-serve conversion readiness | 5/10 | Landing, onboarding, and pricing need to lead with the Daily Growth Desk outcome more directly. |

## Optimization Sequence

| ID | Priority | Status | Shortcoming | Optimization Target | Completion Evidence |
| --- | --- | --- | --- | --- | --- |
| PS-0 | P0 | Done | The first-run IA was split between Daily Growth Desk, Daily X Queue, Content Drafts, and Handling List. | Daily Growth Desk is now the default first-day path, and the former Daily X Queue flow has been absorbed into Content Drafts. | `/start-today` redirects to Daily Growth Desk; dashboard hero and today workbench CTAs use Daily Growth Desk; homepage hero secondary CTA anchors to Exposure Radar; `/daily-x-queue` redirects to `/content-drafts?panel=generate&legacy_source=daily_x_queue`; sidebar/mobile nav does not expose Daily X Queue as a primary route. |
| PS-1 | P0 | Done | The first session asked the user to understand too many product modules. | The day-one path now opens in a guided Daily Growth Desk mode: bind/select account, analyze account, apply strategy, pick one opportunity, generate/copy reply, and record result. Advanced desk tabs and secondary panels are hidden until the first loop is complete. | `/start-today` enters `/exposure-radar?tab=today&activation=first_day#first-day-path`; Exposure Radar reads `activation=first_day`, hides workspace tabs while the first loop is unfinished, and renders First Day Launch / Preflight / First Loop before advanced daily desk panels. |
| PS-2 | P1 | Done | The product needs stronger context intake before drafts and replies become specific. | Add website/profile/context import that summarizes product positioning, target audience, proof points, blocked claims, and reusable memory. | Strategy setup now includes a context import panel: users can paste product/website/FAQ/changelog text, extract target audience, topics, guardrails, reply style, and operator notes, then optionally save the context as Content Memory through the existing Content Library API. |
| PS-3 | P1 | Done | Users need clearer evidence for why a signal is worth acting on. | Add a stronger proof layer on opportunity cards: why now, why this account, expected handling mode, risk reason, and what prior feedback changed. | `RadarCard` now renders `OperatorEvidencePanel`, which condenses decision evidence, account fit, manual move, and risk check before the detailed decision / credibility / fit panels. |
| PS-4 | P1 | Done | The learning loop exists, but the value of feedback is not obvious enough. | Show "what changed because of your feedback" after rejects, result backfills, and memory saves. | `LearningInsightsPanel` now renders `LearningChangeSummaryCard`, using `buildLearningChangeRows` to explain boosted topics, cautious lanes, preferred angles, linked result metrics, and pending result backfills. |
| PS-5 | P1 | Done | Pricing still needs to fully match the new product promise. | Package plans around Daily Growth Desk, opportunity drafts, account intelligence, content memory, review capacity, result learning, and refresh limits. | Billing already uses value-map and plan-packaging panels around Daily Growth Desk capacity. Marketing pricing now includes proof items for Radar refreshes, opportunity drafts, Content Memory, and result learning, while avoiding legacy automation promises. |
| PS-6 | P1 | Done | The product needs proof before paid acquisition. | Add demo examples, sample opportunities, and outcome records that show the manual growth loop without fake claims. | Landing Exposure Radar already shows signal-to-memory-to-strategy examples; first-run empty states include safe sample-loop paths; pricing now reinforces concrete workflow proof without fake metrics or guaranteed outcomes. |
| PS-7 | P2 | Done | Product analytics should measure activation, not just feature usage. | Track first useful reply generated, copied, opened on X, result recorded, next-day return, and repeated opportunity handling. | Daily Session Progress now includes an Activation Loop panel that reads generated suggestions, copy/open actions, saved/handled records, result backfills, and multi-day handling from existing Radar state and manual records. |
| PS-8 | P2 | Done | Navigation still contains surfaces that can dilute the main promise. | Reduce or nest secondary routes in activation context, especially legacy or advanced concepts. | Primary desktop and mobile nav now focuses on Dashboard, Daily Growth Desk, X Accounts, OAF Bots, Content Memory, Handling List, Billing, and Settings. Daily X Queue is a compatibility redirect, and Analytics remains a supporting observability surface rather than a primary activation nav item. |
| PS-9 | P2 | Done | Creator Studio and private analytics are not directly available through current public API assumptions. | Support user-provided analytics export/manual input first; only add authorized private metrics access when the data path is confirmed. | Account Intelligence now shows a Data Boundary panel that separates public X data, user-provided context, OAF workflow data, and unavailable Creator Studio private analytics. |

## Recommended Development Order

1. **PS-0 through PS-9 complete**
   Daily Growth Desk is the primary first-day path, with evidence, learning,
   pricing proof, activation visibility, navigation focus, and honest data
   boundaries in place.

## Documentation Maintenance Rule

When a product-strength item is fixed:

1. Update the row status in this document.
2. Add completion evidence with routes, components, APIs, tests, or release
   commits.
3. Update `product/product-strength-audit.md` if the fix resolves an audit
   concern.
4. Update `docs/product/roadmap.md` if the fix changes product priorities.
5. Update `docs/product/page-list.md` if routes, navigation, or IA changed.

## Current Next Step

PS-0 through PS-9 are complete. The next dedicated enhancement batch is tracked
in `docs/product/product-strength-next-optimization-plan.md`.
