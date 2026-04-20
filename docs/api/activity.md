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

- **数据来源**：数据库表 `activity_logs`（如发帖成功/失败等操作写入的真实记录）。失败类记录可含 **`error_message`**（上游或系统原因摘要）。

### 示例响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": 1,
        "type": "post",
        "status": "success",
        "preview_key": "activity.preview.postQueued",
        "account_handle": "octo_agent_flow",
        "executed_at": "2026-04-19T08:00:00Z"
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

非法 `type` / `status` 会返回 **400** 及错误信息。
