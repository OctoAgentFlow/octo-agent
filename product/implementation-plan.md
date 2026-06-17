# 2-Week Implementation Plan: Daily X Queue

## Goal

Create the smallest usable Daily X Queue experience:

- User enters X handle and product context.
- System creates or completes an OAF Bot profile.
- User adds source material.
- User generates today's post drafts.
- User reviews drafts in one queue.
- Edits and rejections feed the bot's future outputs.

This should reuse the existing OAF Bot, Content Library, Auto Post, Review Queue, Publishing Pipeline, and feedback-learning code.

## Implementation Status - 2026-06-17

Use this section as the working status tracker for this plan. When a planned item
is shipped or intentionally moved into another product surface, update the row
here.

| Plan item | Status | Current implementation / remaining gap |
| --- | --- | --- |
| P0.1 Add Daily X Queue navigation and route | Done / repositioned | `/daily-x-queue` exists and related services/routes are implemented, but it is no longer the primary first-run route. Daily Growth Desk (`/exposure-radar` via `/start-today`) is the primary workbench; Daily X Queue is supporting post-draft prep. |
| P0.2 Build single-page first value flow | Mostly done | The page supports setup, source material, generate, edit, approve, reject, rewrite, and copy. It is strongest for post drafts; reply opportunities live in Exposure Radar rather than inside Daily X Queue. |
| P0.3 Add thin backend orchestration | Done | Backend exposes `/api/v1/daily-x-queue/overview`, `/setup`, `/source-material`, `/source-material/select`, `/generate`, and draft action endpoints. |
| P0.4 Capture edit and reject learning signals | Mostly done | Reject requires a reason and creates negative feedback. Approve/copy can feed memory for future generation. Edit/copy/activation paths have service coverage. Continue simplifying the user-facing "what was learned" explanation. |
| P0.5 Make dashboard point to daily queue | Superseded by Daily Growth Desk IA | Dashboard hero, today workbench, homepage hero, `/start-today`, and primary navigation now point to Daily Growth Desk as the first-day path. Daily X Queue remains linked from content-prep contexts only. |
| P1.1 Reply opportunities in daily queue | Moved / partially solved | Reply and opportunity handling is implemented in Exposure Radar and Handling List, not directly inside Daily X Queue. This may be the right split, but the product IA should make the relationship clear. |
| P1.2 Website context import | Open | Daily X Queue has a `website_url` field, but automatic fetch/readability/summarization into source material is not implemented yet. |
| P1.3 Daily queue run tracking | Partially done | `DailyXQueueContext` exists. Dedicated run/item tracking for cohort metrics is still open. |
| P1.4 Manual publish and copy flow | Partially done | Copy flow exists and is safe. Real publish remains outside the core Daily X Queue path and should stay guarded. |
| P1.5 Activation analytics | Partially done | Daily X Queue tracks review/copy/activation counts and activity events. A complete activation analytics dashboard is still open. |

## P0 Changes

### 1. Add Daily X Queue Navigation And Route

Add `/daily-x-queue` as the primary product route.

Files likely affected:

- `frontend/src/app/(dashboard)/daily-x-queue/page.tsx`
- `frontend/src/components/layout/app-sidebar.tsx`
- `frontend/src/components/layout/mobile-app-nav.tsx`
- `frontend/src/i18n/dictionaries/en.ts`
- Other dictionaries can temporarily use English fallback or minimal labels.

Acceptance:

- Daily X Queue appears above Dashboard or directly after Dashboard.
- Existing Auto Post, Opportunities, Execution Queue remain accessible but no longer lead activation.

### 2. Build Single-Page First Value Flow

Create a Daily X Queue page with:

- setup panel
- source material panel
- generate today's queue action
- review queue list
- learning summary

Reuse existing frontend services:

- `accountService.list`
- `oafBotService.list`
- `oafBotService.completeProfile`
- `oafBotService.create`
- `contentLibraryService.list/create`
- `autoPostService.plans/createPlan/generateDraft/drafts/updateDraft/approveDraft/rejectDraft/rewriteDraft`
- `reviewQueueService.list`

Acceptance:

- User can complete setup and produce at least 3 post drafts without visiting `/oaf-bots` or `/auto-post`.
- User can edit, approve, and reject from the same page.
- User can see that learning signals were applied or captured.

### 3. Add Thin Daily Queue Backend Orchestration

Smallest backend can be frontend-composed. Better P0 is a thin API that hides existing module complexity:

- `GET /daily-x-queue/overview`
- `POST /daily-x-queue/setup`
- `POST /daily-x-queue/source-material`
- `POST /daily-x-queue/generate`

The endpoint can:

- find or create a lightweight X account placeholder if OAuth is not connected, or prompt OAuth only for publishing.
- find or create an OAF Bot.
- create a default Auto Post plan in review mode.
- create source material.
- generate 3 drafts with different content directions.
- return matching review queue items.

Files likely affected:

- `backend/internal/router/*`
- `backend/internal/controller/daily_x_queue_controller.go`
- `backend/internal/service/daily_x_queue_service.go`
- `backend/internal/dto/daily_x_queue_dto.go`
- `frontend/src/services/daily-x-queue.service.ts`

Acceptance:

- One backend call can generate the daily queue after setup.
- Queue generation does not require planner windows, scheduler, or autopilot.

### 4. Capture Edit And Reject Learning Signals

Current learning exists through generation feedback and review queue issue verdicts. P0 should make edit/reject feedback automatic and visible.

Implementation:

- On edit, save draft content and create feedback metadata if the edit meaningfully changed content.
- On reject, require reason and create a negative OAF Bot generation feedback row for the relevant bot and scene.
- On next generation, existing `feedbackLearningSignals` and negative feedback paths should apply.

Files likely affected:

- `backend/internal/service/auto_post_service.go`
- `backend/internal/service/review_queue_service.go`
- `backend/internal/repository/oaf_bot_generation_feedback_repository.go`
- `frontend/src/app/(dashboard)/daily-x-queue/page.tsx`
- `frontend/src/services/auto-post.service.ts`

Acceptance:

- Rejecting a draft with "too salesy" affects future generated drafts.
- Editing a draft creates a visible "learned from edit" or "edit captured" event.

### 5. Make Dashboard Point To Daily Queue

Update first-run onboarding and blocker CTAs:

- primary CTA: "Generate today's X queue"
- setup steps collapsed into Daily X Queue
- show "Daily queue not generated today" as the main blocker

Files likely affected:

- `frontend/src/app/(dashboard)/dashboard/page.tsx`
- `frontend/src/components/onboarding/user-onboarding-card.tsx`
- `frontend/src/components/operations/operational-blockers-card.tsx`
- `frontend/src/i18n/dictionaries/en.ts`

Acceptance:

- New users are sent to `/daily-x-queue` for activation.
- Dashboard no longer requires users to understand five modules before first value.

## P1 Changes

### 1. Reply Opportunities In Daily Queue

Bring `/opportunities` data into Daily X Queue:

- manual pasted reply context
- existing Auto Reply drafts
- existing Auto Comment tasks
- target account opportunities

Acceptance:

- Daily queue includes at least posts plus reply opportunities when context exists.

### 2. Website Context Import

Allow product website URL to create initial source material:

- fetch title and readable text
- summarize into product context
- save as content library item

Acceptance:

- User can paste a website and get source material without writing a long description.

### 3. Daily Queue Run Tracking

Add `daily_queue_runs` and optional `daily_queue_items`.

Acceptance:

- Metrics can measure queue generation, review actions, activation, and retention by day.

### 4. Manual Publish And Copy Flow

Publishing is not required for first value, but users need output handoff:

- copy approved draft
- prepare publish
- publish-now only when OAuth and flags allow

Acceptance:

- User gets value even without real X publishing.

### 5. Activation Analytics

Add event tracking for:

- queue generated
- item reviewed
- item approved
- item edited
- item rejected
- learning signal applied

Acceptance:

- Product can identify effective users, not just signups.

## Risks

- Overbuilding a new queue model instead of composing existing Auto Post and Review Queue.
- Treating OAuth as mandatory before draft value.
- Keeping too many old modules visible in activation.
- Making profile setup too detailed.
- Showing learning internals before users trust the workflow.
- Generating too many drafts and creating review fatigue.
- Adding reply/comment automation before post queue quality is credible.
- Confusing "approved" with "published."

## What Not To Build Yet

- No real scheduled autopilot publishing.
- No multi-account or team queue.
- No complex CRM-style opportunity scoring.
- No embeddings or advanced content import pipeline.
- No A/B testing.
- No full analytics dashboard expansion.
- No DM-first workflow.
- No marketing video optimization.
- No landing page polish unless the activation path needs a CTA update.

## Smallest Usable Implementation

Build a single `/daily-x-queue` page using existing APIs first.

Minimum version:

1. If user has no OAF Bot, show setup form.
2. Use `completeProfile` to generate a profile from X handle and product context.
3. Save the OAF Bot.
4. Save one source material item in Content Library.
5. Create or reuse an Auto Post plan in `review` mode.
6. Generate 3 drafts with content directions:
   - product value
   - user pain point
   - operational proof or product update
7. Display matching post queue items on the same page.
8. Support edit, approve, reject, and rewrite.
9. On reject, require reason and feed it into OAF Bot generation feedback.
10. Show a small learning summary after any edit/reject.

This creates a usable Daily X Queue without new automation modules, new marketing pages, or premature publishing scope.
