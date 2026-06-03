# Activation Metrics

## Effective User Definition

An effective user is not someone who signs up, creates a bot, or visits automation settings. An effective user is someone who uses OctoAgentFlow to operate an X account through a daily review workflow.

Effective user:

- Has a Daily X Queue generated from account and product context.
- Reviews generated outputs.
- Approves, edits, rejects, or publishes at least one useful item.
- Produces learning signals that improve the next queue.

## Activation Event

Primary activation event:

`daily_x_queue_activated`

Definition:

- User creates or confirms an OAF Bot profile.
- User adds at least one source material item or product context.
- User generates a Daily X Queue.
- Queue contains at least 3 items.
- User performs at least 3 review actions.
- At least 1 item is approved or copied/published.

Minimum activation threshold:

- `daily_queue_generated_count >= 1`
- `queue_items_generated >= 3`
- `review_actions_count >= 3`
- `approved_outputs_count >= 1`

## Weekly Active Usage

Primary WAU metric:

`weekly_active_queue_operator`

Definition:

- User generated or reviewed a Daily X Queue in the last 7 days.
- User performed at least 2 review actions in the last 7 days.

Stronger WAU:

`weekly_effective_queue_operator`

Definition:

- User generated at least 1 queue in the last 7 days.
- User approved, edited, copied, published, or rejected at least 3 items.
- User created at least 1 learning signal.

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
