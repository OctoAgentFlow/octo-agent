# Analytics API

Analytics endpoints require `Authorization: Bearer <access_token>` and use the common response envelope.

## Overview

- **Method**: `GET`
- **Path**: `/api/v1/analytics/overview`
- **Purpose**: Returns a small real-data analytics summary for the current user.

### Query Parameters

| Name | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `range` | string | no | `7d` | Supported values: `7d`, `30d`. Invalid values return `400`. |
| `account_id` | number | no | all accounts | Filters activity and post counts to one connected X account owned by the current user. Invalid account ids return `400`. |

The MVP aggregates:

- activity totals for the selected UTC window
- success / failed / review counts
- automation breakdown by `post` / `reply` / `dm`
- daily activity buckets for the selected range
- current post counts by workflow status
- account comparison metrics for connected X accounts
- top failed execution reasons
- recent failed or review items that need attention
- Auto DM recipient operations summary: list health, import quality, send risk, failure categories, and recent list events
- content effect summary: post state conversion, daily publishing trend, recent posts, and post automation outcomes

### Response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "range_days": 7,
    "generated_at": "2026-05-07T05:40:00Z",
    "activity_summary": {
      "total": 12,
      "success": 9,
      "failed": 2,
      "review": 1,
      "total_7d": 12,
      "success_7d": 9,
      "failed_7d": 2,
      "review_7d": 1,
      "success_rate_pct": 82,
      "last_activity_at": "2026-05-07T05:20:00Z"
    },
    "post_summary": {
      "total": 8,
      "draft": 2,
      "scheduled": 3,
      "processing": 0,
      "published": 3,
      "failed": 0
    },
    "automation_breakdown": [
      { "type": "post", "total": 6, "success": 5, "failed": 1, "review": 0 },
      { "type": "reply", "total": 6, "success": 4, "failed": 1, "review": 1 },
      { "type": "dm", "total": 0, "success": 0, "failed": 0, "review": 0 }
    ],
    "daily_activity": [
      { "date": "2026-05-01", "total": 0, "success": 0, "failed": 0, "review": 0 }
    ],
    "failure_reasons": [
      { "reason": "Rate limited by X", "count": 2, "last_at": "2026-05-07T05:15:00Z" }
    ],
    "attention_items": [
      {
        "id": 42,
        "x_account_id": 1,
        "type": "post",
        "status": "failed",
        "account_handle": "@octo_agent_flow",
        "preview_key": "activity.preview.postExecuteFailed",
        "executed_at": "2026-05-07T05:15:00Z",
        "error_message": "Rate limited by X"
      }
    ],
    "account_breakdown": [
      {
        "account_id": 1,
        "username": "octo_agent_flow",
        "display_name": "Octo Agent",
        "avatar_url": "https://example.com/avatar.png",
        "followers": "1200",
        "activity_total": 12,
        "success": 9,
        "failed": 2,
        "review": 1,
        "success_rate_pct": 82,
        "post_total": 8,
        "last_activity_at": "2026-05-07T05:20:00Z"
      }
    ],
    "auto_dm_operations": {
      "recipients": {
        "total": 12,
        "allowlisted": 8,
        "blocked": 2,
        "unsubscribed": 2
      },
      "imports": {
        "batches": 3,
        "imported": 24,
        "skipped": 2,
        "error_batches": 1,
        "recent_errors": [
          {
            "id": 7,
            "x_account_id": 1,
            "errors": ["line 3: recipient_user_id must be numeric"],
            "imported_at": "2026-05-07T05:10:00Z"
          }
        ]
      },
      "tasks": {
        "total": 9,
        "review": 2,
        "approved": 1,
        "sending": 0,
        "sent": 4,
        "failed": 1,
        "blocked": 1,
        "retryable": 1,
        "needs_attention": 5
      },
      "failure_categories": [
        { "category": "recipient_rule_blocked", "count": 2, "last_at": "2026-05-07T05:15:00Z" }
      ],
      "recent_events": [
        {
          "id": 50,
          "x_account_id": 1,
          "status": "success",
          "account_handle": "@octo_agent_flow",
          "preview_key": "activity.preview.dmRecipientRuleUpdated",
          "executed_at": "2026-05-07T05:20:00Z",
          "message": "Recipient 123 marked blocked."
        }
      ]
    },
    "content_effect": {
      "conversion": {
        "total": 8,
        "draft": 2,
        "scheduled": 3,
        "processing": 0,
        "published": 3,
        "failed": 0,
        "ready": 5,
        "active": 3,
        "publish_rate_pct": 38
      },
      "daily": [
        {
          "date": "2026-05-07",
          "draft": 1,
          "scheduled": 1,
          "processing": 0,
          "published": 2,
          "failed": 0,
          "total": 4
        }
      ],
      "recent_posts": [
        {
          "id": 10,
          "x_account_id": 1,
          "content": "GM builders...",
          "status": "published",
          "published_at": "2026-05-07T05:18:00Z",
          "updated_at": "2026-05-07T05:18:00Z"
        }
      ],
      "post_activity": {
        "success": 5,
        "failed": 1,
        "review": 0,
        "total": 6
      }
    }
  }
}
```

### Notes

- `daily_activity` always returns one bucket per selected day, including empty days.
- `automation_breakdown` always includes `post`, `reply`, and `dm`.
- `failure_reasons` returns up to 5 failed-execution groups for the selected window.
- `attention_items` returns up to 6 recent `failed` or `review` activity rows for the selected window.
- `account_breakdown` returns one row per connected account, or the selected account when `account_id` is provided.
- `auto_dm_operations.recipients` reflects current recipient rule state and is filtered by `account_id` when provided.
- `auto_dm_operations.imports`, `tasks`, `failure_categories`, and `recent_events` use the selected time window.
- `content_effect.conversion` reflects current post workflow state; `content_effect.daily` and `recent_posts` use the selected time window.
- `content_effect.post_activity` is derived from `activity_logs type=post` in the selected window.
- `account_id` filters `posts.x_account_id` directly. For activity rows, new logs use `activity_logs.x_account_id`; older rows are also matched by `account_handle` for compatibility.
- `success_rate_pct` uses successful and failed rows only; review rows do not count in the denominator.
- `total_7d`, `success_7d`, `failed_7d`, and `review_7d` are retained as compatibility fields. New UI code should use the range-neutral `total`, `success`, `failed`, and `review` fields.
