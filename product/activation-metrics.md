# Activation Metrics

Status: Current product activation metrics. Historical Daily X Queue metrics are
no longer the primary activation definition; the current first-value path is
Daily Growth Desk / Exposure Radar with manual reply handling and result
backfill.

## Effective User Definition

An effective user is not someone who signs up, creates a bot, or visits automation settings. An effective user is someone who uses OctoAgentFlow to operate an X account through a daily review workflow.

Effective user:

- Connects or selects an X account.
- Runs or reviews Account Intelligence / Growth Strategy context.
- Opens Daily Growth Desk and reviews real or clearly labeled demo opportunity signals.
- Generates, copies, and manually publishes at least one safe reply draft.
- Records the outcome so Content Memory and strategy recommendations can learn.

## Activation Event

Primary activation event:

`daily_growth_desk_activated`

Definition:

- User creates or confirms an OAF Bot profile.
- User connects or selects an X account.
- User applies account/product context into Growth Strategy.
- User opens Daily Growth Desk with a visible data-source / reliability state.
- User generates one manual reply draft from an opportunity signal.
- User copies the reply or marks it handled.
- User records a result or adds a note explaining the outcome.

Minimum activation threshold:

- `daily_queue_generated_count >= 1`
- `opportunity_reply_drafts_generated >= 1`
- `manual_reply_copied_count >= 1`
- `manual_handling_records_count >= 1`
- `strategy_applied_count >= 1`

## Operational Smoke Coverage

Use `npm --prefix frontend run smoke:api` to validate that the activation path is
reachable at the API layer. Without a JWT it confirms protected core workflow
surfaces reject anonymous traffic. With `SMOKE_JWT`, it checks response shapes
for accounts, OAF Bots, Growth Strategy, Exposure Radar diagnostics, Content
Memory, Content Drafts, Handling List, and manual handling records, then prints
a read-only activation-readiness summary.

Set `SMOKE_REQUIRE_ACTIVATED=1` only for a seeded validation account where every
activation threshold is expected to be complete.

## Weekly Active Usage

Primary WAU metric:

`weekly_active_growth_operator`

Definition:

- User opened Daily Growth Desk in the last 7 days.
- User generated, copied, handled, or backfilled at least 2 opportunity drafts in the last 7 days.

Stronger WAU:

`weekly_effective_growth_operator`

Definition:

- User handled at least 3 opportunity signals or content drafts in the last 7 days.
- User backfilled at least 1 published-result link or public metric.
- User created at least 1 memory, strategy, or learning signal.

## Review Actions

Track every review action:

- `queue_item_approved`
- `queue_item_edited`
- `queue_item_rejected`
- `queue_item_rewritten`
- `queue_item_copied`
- `queue_item_publish_prepared`
- `queue_item_published`
- `queue_item_skipped`

Properties:

- `user_id`
- `account_id`
- `bot_id`
- `daily_queue_run_id`
- `queue_item_id`
- `queue_item_type`
- `source_type`
- `status_before`
- `status_after`
- `risk_level`
- `feedback_signal_count`
- `created_at`

## Approved Outputs

Track approved outputs as the strongest proxy for first value:

- `approved_post_draft_count`
- `approved_reply_draft_count`
- `approved_comment_or_quote_count`
- `published_output_count`
- `copied_output_count`

Activation-quality approved output:

- Approved after no edit: acceptable generation.
- Approved after edit: useful but needs learning.
- Approved after rewrite: useful intent, weak first draft.

## Edit And Reject Learning Signals

Edit signal:

`queue_item_edit_signal_created`

Properties:

- `original_text_length`
- `edited_text_length`
- `edit_distance`
- `removed_claims`
- `added_specificity_terms`
- `changed_cta`
- `changed_tone`
- `changed_links_or_mentions`
- `manual_feedback`

Reject signal:

`queue_item_reject_signal_created`

Required reason:

- `irrelevant`
- `too_salesy`
- `wrong_tone`
- `fact_risk`
- `weak_context`
- `duplicate`
- `other`

Learning application:

`daily_queue_learning_applied`

Properties:

- `signals_applied_count`
- `learning_rules_applied_count`
- `negative_feedback_rows_used`
- `issue_verdicts_used`
- `disabled_learning_issues_count`

## Retention Metrics

Day-level retention:

- D1: user reviews another queue the day after activation.
- D3: user generates or reviews a queue within 3 days.
- D7: user generates or reviews queues on 2 separate days within 7 days.
- D14: user generates or reviews queues on 4 separate days within 14 days.

Behavioral retention:

- `queue_days_per_week`
- `review_actions_per_week`
- `approved_outputs_per_week`
- `learning_signals_per_week`
- `repeat_account_usage_days`

Quality retention:

- Approval rate improves across first 3 queues.
- Reject rate for same issue decreases.
- Average edit distance decreases.
- User disables fewer learning rules over time.

## Pay-Intent Signals

Strong pay-intent:

- User approves 5 or more outputs in a week.
- User reaches AI generation quota.
- User connects X OAuth after approving drafts.
- User prepares or requests real publishing.
- User adds a second X account.
- User adds 5 or more source material items.
- User generates queues on 3 separate days in a week.

Medium pay-intent:

- User edits drafts but keeps approving them.
- User uses rewrite multiple times on the same queue.
- User checks learning summary.
- User configures guardrails.
- User adds target accounts for reply/comment opportunities.

Weak pay-intent:

- User signs up only.
- User creates an OAF Bot only.
- User visits billing before generating a queue.
- User views marketing pages after signup.

## Metrics To Stop Overweighting

Do not treat these as success metrics by themselves:

- Accounts connected.
- OAF Bots created.
- Automations enabled.
- Planner configured.
- Page views.
- Login count.
- AI generations without review actions.
- Draft count without approvals.
- Published count without review quality.

These can support diagnosis, but they do not prove effective usage.
