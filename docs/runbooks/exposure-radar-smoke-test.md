# Exposure Radar Smoke Test Runbook

Last updated: 2026-06-11

## Purpose

Validate Exposure Radar in prod-like conditions without auto-publishing. This runbook checks data sources, draft generation, review queue routing, performance metrics, and learning controls.

## Safety Rules

- Do not enable automatic real publishing for this test.
- Use a known internal account or a controlled operator account.
- Generate at most a small number of review drafts.
- Publish nothing unless a separate publishing gray-release runbook explicitly approves it.
- Treat TL1 as fallback only.

## Prerequisites

- Backend API is running with prod config.
- Frontend is deployed and can reach the prod API.
- A user can log in and has at least one connected X account.
- At least one OAF Bot exists for the user.
- `x_trends.enabled=true`.
- X bearer token is configured and has recent-search access.
- `exposure_tweet_signals` table exists.
- `auto_comment_tasks` has `source_type`, `source_ref`, and `source_region` columns.

## API Smoke Checks

Set:

```bash
BASE_URL="https://<prod-domain>/api/v1"
JWT="<user jwt>"
```

### 1. Check English Radar

```bash
curl -sS -H "Authorization: Bearer $JWT" \
  "$BASE_URL/trends/exposure-radar?region=en&limit=20" | jq .
```

Expected:

- `region = "en"`
- `source_type` is one of:
  - `owned_collector`
  - `x_trends_cache`
- `data_quality = "tweet_level"` when owned signals are present.
- `learning_controls` exists.
- No publishing action occurs.

### 2. Check Chinese Radar

```bash
curl -sS -H "Authorization: Bearer $JWT" \
  "$BASE_URL/trends/exposure-radar?region=zh&limit=20" | jq .
```

Expected:

- `region = "zh"`
- `source_type` is one of:
  - `owned_collector`
  - `tl1_fallback`
- `source_notice` clearly identifies fallback behavior if TL1 is used.
- No publishing action occurs.

### 3. Check Bot/Account-Scoped Radar

```bash
BOT_ID="<bot id>"
X_ACCOUNT_ID="<x account id>"

curl -sS -H "Authorization: Bearer $JWT" \
  "$BASE_URL/trends/exposure-radar?region=en&bot_id=$BOT_ID&x_account_id=$X_ACCOUNT_ID&limit=20" | jq .
```

Expected:

- `filters.bot_id` and `filters.x_account_id` match the request.
- `learning_controls.ranking_scope` is explainable:
  - `selected_bot_account`
  - `workspace`
  - `no_memory`
  - `disabled`

### 4. Check Performance Summary

```bash
curl -sS -H "Authorization: Bearer $JWT" \
  "$BASE_URL/trends/exposure-radar/performance?region=en&bot_id=$BOT_ID&x_account_id=$X_ACCOUNT_ID&days=7" | jq .
```

Expected:

- `range_days = 7`
- `learning_controls` exists.
- Counts are numeric.
- `top_topics` is an array.
- No publishing action occurs.

## UI Smoke Checks

### 1. Open Exposure Radar

Open:

```text
https://<prod-domain>/exposure-radar
```

Expected:

- Page loads without a blank screen.
- Region selector shows Chinese and English.
- Source Health panel is visible.
- Performance panel is visible.
- Review draft setup shows X account and OAF Bot selectors.

### 2. Verify Source Health

Switch between Chinese and English.

Expected:

- Data source changes consistently with region.
- `Last collected` is visible when cache/owned data exists.
- Fallback notices are explicit.
- Data quality is visible.

### 3. Verify Learning Controls

In the Performance panel, confirm:

- Ranking learning on/off matches prod config.
- Collector learning on/off matches prod config.
- Mode matches prod config.
- Window matches prod config.
- Ranking scope changes when selecting a Bot/account.

### 4. Generate One Review Draft

Pick a tweet-level Radar card.

Actions:

1. Select an X account.
2. Select an OAF Bot.
3. Click generate draft.

Expected:

- Toast confirms draft generation.
- Card shows review status.
- The draft appears in Execution Queue / Review Queue.
- The draft is `pending_review`.
- No post/reply is published automatically.

### 5. Review Queue Verification

Open:

```text
/execution-queue?type=comment&status=pending_review
```

Expected:

- The generated item is a comment task.
- Source is Exposure Radar.
- Status is pending review.
- It can be approved, rejected, or marked handled through existing review flows.

## Learning Behavior Checks

### Ranking Learning

After approving or rejecting a Radar draft:

1. Refresh Exposure Radar.
2. Inspect cards with the same `topic_name`.

Expected:

- If matching memory exists, cards may show `ranking_delta`.
- `ranking_reason` explains whether memory came from selected Bot/account or workspace.
- If ranking is disabled, no score adjustment should appear.

### Collector Learning

After enough positive review memory exists:

1. Wait for the next collector refresh window.
2. Check Source Health freshness.
3. Inspect performance topic memory.

Expected:

- High-performing topics can enter the owned collector topic pool.
- High-risk topics remain excluded.
- If collector learning is disabled, review-memory topics do not seed collection.

## Fallback Checks

### Missing X Bearer Token

Only perform in a controlled non-prod or maintenance window.

Expected if bearer token is unavailable:

- English Radar falls back to X Trends cache or empty topic-level state.
- Chinese Radar falls back to TL1 when owned signals are unavailable.
- Source Health clearly indicates fallback/cache.

### TL1 Failure

If TL1 is unavailable and no owned Chinese signals exist:

- Chinese Radar request may fail with upstream error.
- This is acceptable only during fallback outage; owned Chinese collector should be restored or bearer token fixed.

## Pass Criteria

- Both regions load.
- Source Health accurately identifies owned, fallback, or cache source.
- Performance panel loads with learning controls.
- One tweet-level Radar card can generate a pending review draft.
- Draft appears in review queue.
- No automatic real publishing occurs.
- Tests/build pass for the release artifact.

## Fail And Escalate

Escalate before broad release if:

- Page fails to load.
- Owned collector never produces data despite valid X bearer token.
- Source Health is missing or misleading.
- Draft generation publishes automatically.
- Review queue does not show generated drafts.
- X API errors indicate quota or permission failures.
- Learning controls show unexpected prod state.
