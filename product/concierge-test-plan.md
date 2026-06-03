# Daily X Queue Concierge Test Plan

## Goal

Validate whether Daily X Queue creates real product pull for users who personally operate an X account.

This test is about first value and repeat use, not feature breadth. The core question is: will users come back to generate, review, edit, approve, or copy a daily queue without needing publishing, replies, automation, or analytics?

## Target Users

Test with 5 users who actively run or directly manage an X account.

Best profiles:

- AI SaaS founder
- Web3 project founder or growth operator
- indie builder
- SocialFi operator
- small agency operator

Prioritize people who already have source material, product updates, notes, or positioning they need to turn into X content.

## Test Duration

7 days.

Each user should try Daily X Queue at least once. Strong signal requires use on at least 3 separate days.

## Test Environment URL

Use the test environment:

https://test.octo-agent.com/daily-x-queue

Do not use local as the acceptance source of truth.

## Onboarding Flow

1. Invite the user and explain this is a test environment, not final production.
2. Create or confirm their test login.
3. Ask them to bring one real source item, such as a product note, launch note, customer insight, changelog, FAQ, or rough positioning.
4. Have them open `/daily-x-queue`.
5. Ask them to enter:
   - X handle
   - product description or website context
   - target audience
   - voice preference
   - guardrails
6. Ask them to paste one source material item.
7. Ask them to generate the queue.
8. Ask them to review all 3 drafts and use edit, reject, approve, or copy.
9. Ask them to generate another queue on a later day and notice whether learning improved.

## Daily Test Routine

Each test day:

1. User brings one source material item.
2. User generates today's Daily X Queue.
3. User reviews exactly 3 draft cards.
4. User completes at least 3 review actions across the cards.
5. User approves or copies at least 1 draft if any draft is useful.
6. User edits or rejects at least 1 draft so the system receives a learning signal.
7. User records quick feedback using the feedback form.

## Minimum Activation Target Per User

A user is activated if they:

- generate at least 1 Daily X Queue
- get exactly 3 draft cards
- complete at least 3 review actions
- approve or copy at least 1 draft
- create at least 1 edit or reject learning signal

## Strong Success Target

Strong success means the user:

- uses Daily X Queue on at least 3 days
- approves or copies at least 3 drafts total
- edits or rejects at least 3 drafts total
- says they would miss the workflow if it disappeared

## Success Metrics

Track:

- users activated
- days used per user
- queues generated per user
- drafts generated per queue, expected exactly 3
- review actions per queue
- approved or copied drafts
- edit and reject learning signals
- second-generation learning summary shown
- user-rated draft quality
- user-rated willingness to use tomorrow
- user pay-intent or continued-test intent

## Failure Metrics

Watch for:

- user cannot reach first value without help
- user does not generate a queue
- fewer or more than 3 drafts appear
- user reviews fewer than 3 drafts
- user approves or copies 0 drafts
- user edits or rejects 0 drafts
- drafts ignore source material
- drafts violate guardrails
- drafts feel generic or unusable
- user does not return after day 1
- user asks for broad feature additions before using the core queue

## Decision Rules After 7 Days

Greenlight P1 only if:

- at least 3 of 5 users activate
- at least 2 of 5 users use it on 3 separate days
- at least 2 of 5 users say they would miss it if removed
- draft quality is rated 4/5 or higher by at least 3 users

If users activate but complain about missing context:

- improve source material intake and prompt quality first

If users like posts but ask for replies:

- then build reply opportunities as P1

If users do not copy or approve drafts:

- do not build P1
- improve generation quality, source usage, guardrails, and onboarding first

## What Not To Build During The Test

Do not build:

- reply opportunities
- Auto DM
- scheduler
- autopilot
- publishing
- multi-account flow
- analytics dashboard
- advanced opportunity scoring
- marketing or video changes
- broad platform redesign

Only fix real concierge-test blockers that prevent users from completing the P0 workflow.
