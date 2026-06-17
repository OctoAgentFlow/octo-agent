# Post API

Base path: `/api/v1`

所有路由需 **Bearer Token**（除健康检查外）。

统一响应：`{ "code", "message", "data" }`。

## 与 Content Draft Planner 的边界

`posts` 是传统帖子 CRUD / 手动执行 / 定时发布接口，仍然可用。

新版 OAF Bot 内容草稿闭环优先使用：

- `/api/v1/content-drafts/plans`
- `/api/v1/content-library/items`
- `/api/v1/content-drafts/drafts`
- `/api/v1/review-queue`
- `/api/v1/publishing/jobs`

也就是说：

- `posts` 适合用户手动创建固定内容。
- Content Draft Planner 适合让 OAF Bot 根据人设、内容池和发布规则生成草稿。
- Content Draft Planner 生成的内容通过 Handling List / Publishing Pipeline 处理，不直接复用 `POST /posts/:id/execute`。

## 数据模型（`posts` 表）

| 字段 | 说明 |
| --- | --- |
| `user_id` | 所属用户 |
| `x_account_id` | 绑定的 X 账号（`twitter_accounts.id`），须为当前用户已连接账号 |
| `content` | 正文（1～5000 字符） |
| `status` | `draft` \| `scheduled` \| `processing` \| `published` \| `failed`（`processing` 仅服务端在调度/执行过程中写入，客户端创建/更新不可设为该值） |
| `scheduled_at` | 计划时间（RFC3339，可空） |
| `published_at` | 发布时间（可空；`published` 创建时未传则服务端填当前 UTC） |
| `last_attempt_at` | 最近一次发布尝试时间（可空） |
| `last_error_message` | 最近一次发布失败原因（成功发布后清空） |
| `created_at` / `updated_at` | 由 GORM `Base` 维护 |

**规则摘要**

- `status = scheduled` 时 **必须** 提供未来的 `scheduled_at`（创建与更新均会校验）。
- `x_account_id` 必须存在且 `status <> disconnected`。
- 手动执行支持 `draft`、`scheduled`、`failed`，失败内容可在修正后重试。

## GET /api/v1/posts

- **Query**：`page`（默认 1）、`page_size`（默认 20，最大 100）
- **响应 `data`**：`{ "items": [...], "pagination": { "page", "page_size", "total" } }`

## POST /api/v1/posts

**Body（JSON）**

```json
{
  "x_account_id": 1,
  "content": "Hello",
  "status": "draft",
  "scheduled_at": "2026-04-20T10:00:00Z",
  "published_at": null
}
```

- `content`、`x_account_id` 必填；`status` 默认 `draft`。
- 用户端创建页只开放 `draft` / `scheduled`，避免手工创建 `published` / `failed` 状态。

## GET /api/v1/posts/{id}

- 仅可访问 **当前用户** 的帖子；否则 **404**。

## PUT /api/v1/posts/{id}

- **Body**：字段均可选（部分更新）；传 `scheduled_at` / `published_at` 为空字符串可清空（若业务允许）。

## DELETE /api/v1/posts/{id}

- 硬删除；成功 `data` 为 `{}`。

## POST /api/v1/posts/{id}/execute

手动将帖子发布到 X（单次执行，无调度/重试/队列）。

**校验**

- 帖子属于当前用户。
- `status` 必须为 `draft`、`scheduled` 或 `failed`（`published` / `processing` 等会返回 **400**）。
- `x_account_id` 对应的 `twitter_accounts` 行须为当前用户且非 `disconnected`，且具备可用的 `access_token`（否则 **400**）。

**行为**

- 使用 X API v2 `POST /2/tweets`，`Authorization: Bearer {access_token}`，正文为帖子的 `content`。
- **成功**：`status` → `published`，`published_at` / `last_attempt_at` → 当前 UTC，`last_error_message` 清空；写入 `activity_logs`（`type=post`，`status=success`，`preview_key=activity.preview.postExecuteSuccess`）。
- **失败**（X API 报错等）：`status` → `failed`，写入 `last_attempt_at` / `last_error_message`；写入 `activity_logs`（`status=failed`，`preview_key=activity.preview.postExecuteFailed`）；HTTP **502**，`message` 为上游错误摘要。

**响应 `data`**

```json
{
  "post": { "...": "与 PostItem 一致" },
  "tweet_id": "可选，X 返回的推文 id"
}
```

**OAuth 范围**：绑定 X 账号时需包含 `tweet.write`（与发帖一致）。

## 传统 Posts 自动调度（服务端）

- API 进程内 **每分钟** 扫描一次（与分布式/队列无关）。
- 条件：`status = scheduled` 且 `scheduled_at <=` 当前 UTC，且该用户在 `automation_configs` 中 **`type = post` 且 `enabled = true`**。
- 每次最多处理 **10** 条（按计划时间升序）。
- 对每条帖子：先更新为 **`processing`**（防止重复执行），再调用与手动执行相同的 X 发帖与 Activity 写入逻辑；成功 → `published`，一般失败 → `failed`（`activity_logs.error_message` 记录原因）。
- **processing 超时**：若 `status = processing` 且 **`updated_at` 早于约 5 分钟前**，调度器会将其 **恢复为 `scheduled`**（避免进程崩溃导致长期卡住）。
- **限流（与 `automation_configs` 中 Post 模块一致）**：调度执行前会检查当日已成功发帖数（`frequency_daily_limit`）与最近 1 小时成功数（`safety_max_per_hour`），超出则 **推迟 1 分钟再试**（不写失败 Activity）。
- **X 频率限制（429 等）**：帖子 **改回 `scheduled`**，并按 `Retry-After`（缺省约 15 分钟，有上限）延后 `scheduled_at`；Activity 记一条失败说明（含 `error_message`），帖子记录 `last_error_message`。
- 若 **Post 自动化未启用**，该用户的计划帖 **不会** 被自动执行。

## Content Draft Planner 调度

Content Draft Planner 的 scheduler 使用历史表 `auto_post_plans`、`content_library_items` 和 `auto_post_drafts`，不写入 `posts` 表。当前产品接口是 `/api/v1/content-drafts/*`，详见 [automation.md](./automation.md)。
