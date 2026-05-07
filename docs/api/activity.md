# Activity API

Base path: `/api/v1`

## GET /api/v1/activities

- **鉴权**：需要（Bearer Token）
- **用途**：分页查询当前用户的活动日志。
- **Query 参数**：

| 参数 | 说明 |
| --- | --- |
| `page` | 页码，默认 `1` |
| `page_size` | 每页条数，默认 `20`，最大 `100` |
| `type` | 可选：`post` \| `reply` \| `dm` |
| `status` | 可选：`success` \| `review` \| `failed` |
| `range` | 可选：`24h` \| `7d` \| `30d`；不传则不限制时间 |
| `account_id` | 可选：按当前用户已连接的 X 账号过滤；非法账号返回 `400` |
| `error_reason` | 可选：按失败原因精确过滤；主要用于从 Analytics 的 Top Failure Reasons 跳转排查 |

- **数据来源**：数据库表 `activity_logs`（发帖/自动回复/Auto DM dry-run 等写入的真实记录）。失败类记录可含 **`error_message`**。`type=reply` 且成功时可能含 **`reply_*`** 字段（被回复用户、原文与回复预览），供前端拼叙事文案。`type=dm` 当前由 Auto DM dry-run / capability-check 写入 `review` 或 `failed` 记录，用于观测权限、账号配置和人工审核状态。新活动日志使用 `x_account_id`，旧活动日志仍可通过 `account_handle` 兼容账号筛选。

### 示例响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": 1,
        "x_account_id": 1,
        "type": "post",
        "status": "success",
        "preview_key": "activity.preview.postQueued",
        "account_handle": "octo_agent_flow",
        "executed_at": "2026-04-19T08:00:00Z"
      },
      {
        "id": 2,
        "type": "reply",
        "status": "success",
        "preview_key": "activity.preview.replySuccess",
        "account_handle": "octo_agent_flow",
        "executed_at": "2026-04-19T09:00:00Z",
        "reply_comment_tweet_id": "1234567890",
        "reply_to_username": "someone",
        "reply_to_text_preview": "Nice post!",
        "reply_text_preview": "Thanks for your comment!"
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 1
    }
  }
}
```

非法 `type` / `status` / `range` / `account_id` / `error_reason` 会返回 **400** 及错误信息。
