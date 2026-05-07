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
- **数据来源**：数据库表 `automation_configs`（真实持久化）。

响应 `data.modules` 为数组。除与 `PUT` 对齐的 `type`、`name`、`state`、`config`、`last_run_at`、`next_run_at` 外，还包含：

| 字段 | 说明 |
| --- | --- |
| `executed_today` | 当日 **成功** 活动数（按模块 `type` 统计 `activity_logs`） |
| `reply_usage` | **仅 `type=reply` 时**：当日回复成功数、日限额、剩余额度、最近一次回复活动执行时间（RFC3339） |

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
- **用途**：供控制台「运行时」类展示；**指标均来自数据库与配置推导**（非固定假数据）。

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

| 字段 | 含义 | 实现要点 |
| --- | --- | --- |
| `needs_review` | 待审核活动条数 | `activity_logs` 中 `status=review` 的总数 |
| `retries_last_24h` | 近 24 小时失败次数 | `activity_logs` 中 `status=failed` 且 `executed_at` 在 24h 内 |
| `last_success_at` | 最近一次任意成功活动 | 全类型成功记录的 `executed_at` 最大值（RFC3339）；无则空字符串 |
| `queue_depth` | 队列深度估计 | `scheduled`+`processing` 帖子数 + `needs_review` + **已启用模块数**（`enabledCount` 作为轻量 worker 基线） |

后台任务说明（与配置开关有关，非本接口字段）：

- **Auto Post**：调度器每分钟扫描 `scheduled` 且到期帖子（需 `post` 模块 `enabled`）。
- **Auto Reply**：调度器每分钟对开启 `reply` 的用户拉取评论并回复（固定模板，无 AI）。
- **Auto DM**：调度器每分钟先消费已审批或到期重试的发送任务，再扫描到期 `dm` 配置生成候选；候选来自近期明确互动用户，写入 `auto_dm_tasks` 与 `activity_logs type=dm`，审批后通过 X DM API 真实发送，并回写 `sent` / `failed`。rate limit、X 5xx、网络类失败会进入 retry queue；权限、scope、收件人规则、屏蔽词类失败会归类为不可重试。

## GET /api/v1/auto-dm/tasks

- **鉴权**：需要
- **用途**：返回当前用户最近的 Auto DM 发送前审计任务。
- **响应字段**：`status`（`review` / `approved` / `sending` / `blocked` / `failed` / `sent`）、`recipient_source`、`recipient_user_id`、`recipient_username`、`capability_status`、`failure_category`、`failure_reason`、`retryable`、`retry_after_at`、`attempt_count`、`last_attempt_at`、`message_preview`、`dm_conversation_id`、`dm_event_id`、`activity_log_id` 等。

## POST /api/v1/auto-dm/tasks/{id}/approve

- **鉴权**：需要
- **用途**：将 `review` 状态的 DM 审计任务标记为 `approved`。后台真实发送器只消费已批准、具备 `recipient_user_id`、OAuth DM scope 满足、收件人来源为 `interaction_only` 且未触发限流/屏蔽词的任务。

## POST /api/v1/auto-dm/tasks/{id}/block

- **鉴权**：需要
- **Body**：`{ "reason": "..." }`
- **用途**：在真实发送前拦截任务，写入阻断原因。

## POST /api/v1/auto-dm/tasks/{id}/retry

- **鉴权**：需要
- **用途**：将 `failed + retryable=true` 且未超过重试上限的任务重新放回 approved 队列。后台 scheduler 随后会再次按真实发送校验执行。
