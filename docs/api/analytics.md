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
- top failed execution reasons
- recent failed or review items that need attention

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
        "type": "post",
        "status": "failed",
        "account_handle": "@octo_agent_flow",
        "preview_key": "activity.preview.postExecuteFailed",
        "executed_at": "2026-05-07T05:15:00Z",
        "error_message": "Rate limited by X"
      }
    ]
  }
}
```

### Notes

- `daily_activity` always returns one bucket per selected day, including empty days.
- `automation_breakdown` always includes `post`, `reply`, and `dm`.
- `failure_reasons` returns up to 5 failed-execution groups for the selected window.
- `attention_items` returns up to 6 recent `failed` or `review` activity rows for the selected window.
- `account_id` filters `posts.x_account_id` directly. For activity rows, new logs use `activity_logs.x_account_id`; older rows are also matched by `account_handle` for compatibility.
- `success_rate_pct` uses successful and failed rows only; review rows do not count in the denominator.
- `total_7d`, `success_7d`, `failed_7d`, and `review_7d` are retained as compatibility fields. New UI code should use the range-neutral `total`, `success`, `failed`, and `review` fields.
