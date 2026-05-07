# Analytics API

Analytics endpoints require `Authorization: Bearer <access_token>` and use the common response envelope.

## Overview

- **Method**: `GET`
- **Path**: `/api/v1/analytics/overview`
- **Purpose**: Returns a small real-data analytics summary for the current user.

The MVP aggregates:

- activity totals for the current 7-day UTC window
- success / failed / review counts
- automation breakdown by `post` / `reply` / `dm`
- daily activity buckets
- current post counts by workflow status

### Response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "range_days": 7,
    "generated_at": "2026-05-07T05:40:00Z",
    "activity_summary": {
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
    ]
  }
}
```

### Notes

- `daily_activity` always returns 7 buckets, including empty days.
- `automation_breakdown` always includes `post`, `reply`, and `dm`.
- `success_rate_pct` uses successful and failed rows only; review rows do not count in the denominator.
