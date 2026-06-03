# Daily X Queue Spec

## Target User

Primary target: founder/operator responsible for keeping one X account active.

Best initial segments:

- Web3 project founder or growth operator.
- SaaS founder with product updates and founder-led content.
- AI agent builder showing product progress.
- SocialFi or creator/KOL matrix operator managing consistent account behavior.
- Small agency operator reviewing drafts before publishing.

## User Problem

Users do not need another generic AI tweet writer. They need a controlled daily operating workflow for X:

- What should this account say today?
- Which replies or conversations are worth touching?
- Is the content consistent with the account persona?
- Can a human review before publishing?
- Will the bot learn from edits and rejections?

## Core Workflow

1. User opens Daily X Queue.
2. User enters:
   - X handle
   - product website or product description
   - target audience
   - voice preference
   - guardrails
3. System generates an initial OAF Bot profile.
4. User adds source material.
5. User clicks "Generate today's queue."
6. System returns:
   - post drafts
   - reply opportunities
   - optional comment or quote opportunities
   - warnings and guardrail notes
7. User approves, edits, rejects, or rewrites each item.
8. System records feedback signals.
9. Next queue generation applies the user's edits, rejections, and accurate issue verdicts.

## Input Fields

Required for first value:

- `x_handle`: user-entered handle; OAuth can be requested later for publishing.
- `product_context`: website URL, pasted product description, or both.
- `target_audience`: short free-text audience field.
- `voice_preference`: founder/operator, technical, product-led, community, concise, educational, or custom.
- `guardrails`: blocked claims, topics to avoid, compliance notes, and words/phrases not to use.

Optional:

- `account_goal`: educate, launch update, drive waitlist, recruit contributors, support users, build trust.
- `source_material`: pasted notes, changelog, FAQ, docs URL, landing page copy, product update, customer pain points.
- `preferred_cta`: ask for replies, visit link, join community, book call, read docs, no CTA.
- `language_strategy`: English, Chinese, bilingual, or custom.
- `reply_context`: pasted mentions/comments if live X reading is not available.

## Generated Outputs

Daily queue output should include:

- 3 to 5 post drafts.
- 3 to 10 reply opportunities when source comments or timeline context exists.
- Optional comment/quote opportunities if targets are configured.
- A one-line reason for each item.
- Source material used.
- Risk level and guardrail warnings.
- Suggested action: approve, edit, reject, rewrite.

Each queue item should have:

- `queue_item_id`
- `type`: post, reply, comment, quote, dm only later
- `status`
- `draft_text`
- `target_summary`
- `source_material_ids`
- `bot_id`
- `x_account_id`
- `risk_level`
- `risk_reasons`
- `feedback_signal_count`
- `created_at`

## Review States

Use a simplified user-facing state model:

- `Needs review`: generated but not approved.
- `Edited`: user changed the text.
- `Approved`: ready for publishing or manual copy.
- `Rejected`: not useful; reason required.
- `Published`: published or marked done.
- `Skipped`: intentionally ignored for today.

Map to existing backend states:

- `draft` and `pending_review` -> Needs review.
- edited draft with review pending -> Edited.
- `approved` and `ready_to_publish` -> Approved.
- `rejected` -> Rejected.
- `published` -> Published.
- failed publish or blocked guardrail -> Needs review with warning.

## Feedback Loop

Every review action should create a learning signal:

- Approve without edit: positive signal for style, topic, source, and CTA.
- Edit: compare original and edited draft; store edit delta, changed phrases, removed claims, added specificity.
- Reject: require a short reason:
  - irrelevant
  - too salesy
  - wrong tone
  - fact risk
  - weak context
  - duplicate
  - other
- Rewrite: store selected rewrite mode and optional feedback.
- Issue verdict: if system flags a likely issue, user can mark the issue accurate or irrelevant.

The next queue should apply:

- Recent negative OAF Bot generation feedback.
- Review queue issue verdicts.
- Learned guardrails from accurate issue judgments.
- User-disabled learning preferences only in advanced settings.
- Recent drafts for deduplication.

## UI Screens

### 1. Daily X Queue

Primary first screen after login.

Sections:

- Setup strip: X handle, product context, source material status.
- Today's queue summary: needs review, approved, rejected, published.
- Generate button.
- Queue tabs: Posts, Replies, Opportunities, Approved.
- Inline item cards with approve/edit/reject/rewrite actions.
- Learning summary: "Applied 3 learning signals from your last reviews."

### 2. Setup Drawer

Minimal setup for first value:

- X handle.
- Product website or description.
- Target audience.
- Voice.
- Guardrails.
- Generate profile button.
- Save profile button.

### 3. Source Material Drawer

Fast material capture:

- Title.
- Type.
- Body.
- Source URL.
- Topics.
- Goal.
- CTA preference.

### 4. Queue Item Detail

Focused review:

- Draft text editor.
- Source and reason.
- Risk notes.
- Similar recent drafts.
- Learning signals applied.
- Approve, reject, rewrite, copy, publish when ready.

### 5. Learning Panel

Small and concrete:

- Edits learned this week.
- Top reject reasons.
- Guardrails applied.
- Option to disable a specific learned rule.

## Backend Data Needed

Existing data to reuse:

- `twitter_accounts`
- `oaf_bots`
- `content_library_items`
- `auto_post_plans`
- `auto_post_drafts`
- `auto_post_generation_runs`
- `auto_reply_drafts`
- `auto_comment_tasks`
- `publish_jobs`
- `review_queue_feedback_issue_verdicts`
- `oaf_bot_generation_feedback`
- `oaf_bot_learning_rule_preferences`
- `activity_logs`
- `ai_generation_usages`

New or thin orchestration data:

- `daily_queue_runs`: one row per generated daily queue.
- `daily_queue_items`: optional normalized wrapper if posts/replies/comments need one daily grouping.
- `source_material_ingestion_status`: optional if website fetch/import is added later.

Minimum backend endpoint set:

- `GET /daily-x-queue/overview`
- `POST /daily-x-queue/setup-profile`
- `POST /daily-x-queue/source-material`
- `POST /daily-x-queue/generate`
- `GET /daily-x-queue/items`
- `PATCH /daily-x-queue/items/:id`
- `POST /daily-x-queue/items/:id/approve`
- `POST /daily-x-queue/items/:id/reject`
- `POST /daily-x-queue/items/:id/rewrite`

Smallest version can avoid new tables by composing existing endpoints and using `auto_post_drafts` plus `review_queue` as the queue source.

## Success Metrics

Activation:

- User generates first Daily X Queue.
- User reviews at least 3 queue items.
- User approves at least 1 item.

Usage:

- Number of Daily X Queues generated per account per week.
- Review actions per queue.
- Approved outputs per queue.
- Edit/reject learning signals per queue.

Quality:

- Approval rate after first queue.
- Edit distance between generated and approved drafts.
- Reject reason distribution.
- Repeat rejection rate for the same issue.

Retention:

- Generates queue on 2 separate days in 7 days.
- Reviews queue on 2 separate days in 7 days.
- Approves or publishes on 2 separate days in 7 days.

Pay intent:

- Hits daily or monthly generation quota.
- Connects X OAuth after approving drafts.
- Requests real publishing.
- Adds multiple source materials.
- Adds second account or asks for team review.
