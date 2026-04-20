# Automation API

Base path: `/api/v1`

统一返回结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

## GET /api/v1/automations

- **鉴权**：需要（Bearer Token）
- **用途**：列出当前用户的自动化模块（`post` / `reply` / `dm`）。首次访问会为该用户 **EnsureDefaults** 写入默认配置行。
- **数据来源**：数据库表 `automation_configs`（真实持久化）。首次对该用户访问时会 **EnsureDefaults** 插入三条默认模块行（若尚未存在）。

响应 `data.modules` 为数组，元素字段与 `PUT` 请求体结构对应，并包含 `state`、`last_run_at`、`next_run_at`（若有）等。

## PUT /api/v1/automations/{type}

- **鉴权**：需要
- **Path**：`type` 为 `post` | `reply` | `dm`
- **用途**：更新对应模块配置（频率、语气、安全项等）
- **请求体**（JSON，`frequency` / `safety` 为必填块）：

```json
{
  "enabled": true,
  "frequency": {
    "interval_minutes": 180,
    "daily_limit": 3
  },
  "tone": "Friendly",
  "safety": {
    "require_approval": false,
    "max_per_hour": 2,
    "blocked_keywords": ["airdrop", "giveaway"]
  }
}
```

## POST /api/v1/automations/{type}/toggle

- **鉴权**：需要
- **Path**：`type` 同上
- **请求体**：`{ "enabled": true }`
- **用途**：仅切换开关，并据此调整 `state` / `next_run_at`。

## GET /api/v1/automations/runtime-status

- **鉴权**：需要
- **用途**：供控制台「运行时」类展示。

响应示例：

```json
{
  "queue_depth": 6,
  "last_success_at": "2026-04-19T09:29:23Z",
  "retries_last_24h": 1,
  "needs_review": 0
}
```

### 字段与实现说明（以代码为准）

| 字段 | 含义 | 是否来自真实业务指标 |
| --- | --- | --- |
| `needs_review` | 当前用户各模块中 `state == "Needs Review"` 的个数 | **是**（由 DB 模块行统计） |
| `queue_depth` | 当前实现为 `enabled_module_count * 6` | **否**（占位算法） |
| `last_success_at` | 当前实现为「请求时刻 − 2 分钟」的 RFC3339 字符串 | **否**（占位） |
| `retries_last_24h` | 当前实现为 `needs_review + 1` | **否**（占位） |

后续接入真实任务队列/执行流水后，应替换上述占位字段的实现。
