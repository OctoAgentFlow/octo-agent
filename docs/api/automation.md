# Automation API

Base path: `/api/v1`

本文档覆盖当前自动化相关 API：自动化总览、OAF Bot、Content Draft Planner、Content Library、Exposure Radar 手动机会草稿、Handling List 和 Publishing Pipeline。所有登录态接口均需要 Bearer Token，公开退订接口除外。

统一返回结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

## Automations Overview

### GET /api/v1/automations

- **用途**：列出当前用户的自动化模块配置。
- **数据来源**：`automation_configs`。
- **说明**：首次访问会写入默认配置行；当前页面主要把它作为自动化总览和入口，不再承载所有具体配置。

### PUT /api/v1/automations/{type}

- **Path**：`type` 为 `post` / `reply` / `dm` 等自动化类型。
- **用途**：更新对应自动化配置。

### POST /api/v1/automations/{type}/toggle

- **用途**：切换自动化开关。

### PATCH /api/v1/automations/{type}/execution-mode

- **用途**：更新某个场景的执行模式。
- **模式**：`manual` / `review` / `autopilot`。
- **说明**：Content Draft 与 Exposure Radar 手动机会草稿会根据执行模式进入 `draft`、`pending_review` 或 `ready_to_publish`。

### GET /api/v1/automations/runtime-status

- **用途**：控制台运行状态展示。
- **指标来源**：数据库与配置推导，包括待审核、失败重试、最近成功、队列深度等。

## OAF Bot

### GET /api/v1/oaf-bots

- **用途**：列出当前用户 OAF Bot。
- **规则**：当前阶段为 one bot per account：一个 OAF Bot 最多绑定一个 X 账号，一个 X 账号同一时间最多绑定一个 active OAF Bot。

### POST /api/v1/oaf-bots

- **用途**：创建 OAF Bot。
- **核心字段**：`name`、`twitter_account_id`、职业/行业、性格、话题、禁聊、增长目标、`primary_language`、`language_strategy`、`safety_mode`。
- **限制**：受当前套餐 `max_bots` 和 one bot per account 规则限制。

### GET /api/v1/oaf-bots/:id

- **用途**：查看 OAF Bot 详情。

### PUT /api/v1/oaf-bots/:id

- **用途**：更新 OAF Bot。
- **说明**：如果更新 `twitter_account_id`，必须校验账号属于当前用户且未被其他 active Bot 占用。

### POST /api/v1/oaf-bots/:id/test-generate

- **用途**：按指定 scene 生成一条示例内容。
- **scene**：`tweet` / `reply` / `comment` / `dm`。
- **计量**：每次成功生成消耗 1 次 `monthly_ai_generations`，记录 `scene=test_generate`。
- **输出**：应优先返回纯文本 `content`，前端不展示原始 JSON。

### GET /api/v1/oaf-bots/:id/generation-usages

- **用途**：展示该 Bot 本月 AI 生成用量分布。
- **说明**：这是用量分布，不是 scene 独立额度；所有场景共享套餐 AI 生成总额度。

## Content Drafts

> 旧 `/api/v1/auto-post/*` 路由已下线。当前产品接口使用 `/api/v1/content-drafts/*`，底层 JSON 字段仍保持历史兼容。

### GET /api/v1/content-drafts/plans

- **用途**：列出当前用户 Content Draft Planner 配置。

### POST /api/v1/content-drafts/plans

- **用途**：创建 Planner。
- **核心字段**：`twitter_account_id`、`enabled`、`execution_mode`、`daily_limit`、`min_interval_minutes`、`posting_windows`、`timezone`。

### GET /api/v1/content-drafts/plans/:id

- **用途**：查看单个 Planner。

### PUT /api/v1/content-drafts/plans/:id

- **用途**：更新 Planner。

### POST /api/v1/content-drafts/plans/:id/generate

- **用途**：手动生成一条 Content Draft。
- **输入**：可传 `content_library_item_id` 或 `content_direction`。
- **生成规则**：读取 X 账号绑定的 OAF Bot、人设、语言配置和内容素材；输出纯文本单条推文。
- **状态流转**：
  - `manual` -> `draft`
  - `review` -> `pending_review`
  - `autopilot` 且安全 -> `ready_to_publish`
  - 命中风险 -> `pending_review`
- **计量**：成功生成记录 `scene=auto_post`，AI 用量 +1。

### POST /api/v1/content-drafts/plans/:id/run-now

- **用途**：手动触发一次 scheduler 同等逻辑，用于测试 Planner。
- **说明**：可忽略 `next_run_at`，但仍校验 planner enabled、X 账号 connected、订阅、AI 额度、daily limit、内容素材和重复内容。

### GET /api/v1/content-drafts/runs

- **用途**：查看最近 Content Draft scheduler / run-now 运行记录。
- **查询参数**：`status=completed|skipped|failed`、`x_account_id`、`range=24h|7d|30d`、`date_from`、`date_to`、`page`、`page_size`。
- **返回**：`items` 和 `pagination`，用于后台按状态/账号分页排查。
- **状态**：`completed` / `skipped` / `failed`。
- **skip_reason**：如 `no_active_content_source`、`ai_generation_quota_exceeded`、`daily_auto_post_limit_exceeded`、`duplicate_content`。

### GET /api/v1/content-drafts/drafts

- **用途**：查看 Content Draft 草稿。

### PATCH /api/v1/content-drafts/drafts/:id

- **用途**：编辑 Content Draft 内容或状态。

### POST /api/v1/content-drafts/drafts/:id/approve

- **用途**：批准 review 模式生成的草稿。批准后可创建发布任务。

### POST /api/v1/content-drafts/drafts/:id/prepare-publish

- **用途**：为 ready/approved 的 Content Draft 创建 `publish_job`。

### POST /api/v1/content-drafts/drafts/:id/reject

- **用途**：拒绝草稿。

## Content Library

### GET /api/v1/content-library/items

- **用途**：列出内容池素材。
- **筛选**：可按 X 账号、Bot、状态等筛选（以当前 controller 为准）。

### POST /api/v1/content-library/items

- **用途**：新增内容素材。
- **item_type**：`idea`、`product_update`、`faq`、`case_study`、`announcement`、`link`、`thread_seed`。
- **状态**：`active` / `paused` / `archived`。

### GET /api/v1/content-library/items/:id

- **用途**：查看素材详情。

### PUT /api/v1/content-library/items/:id

- **用途**：编辑素材或切换状态。

### DELETE /api/v1/content-library/items/:id

- **用途**：删除素材。

## Downlined Legacy Automation APIs

以下需要登录的旧自动化 API 已下线，不再作为产品接口注册：

- `/api/v1/auto-replies/*`
- `/api/v1/auto-comment/*`
- `/api/v1/auto-comments/*`
- authenticated `/api/v1/auto-dm/*`

当前替代路径：

- 评论/回复机会：`/api/v1/exposure-radar/drafts` + `/api/v1/exposure-radar/manual-records*`
- 队列聚合：`/api/v1/review-queue`
- 内容草稿：`/api/v1/content-drafts/*`

## Public DM Unsubscribe

### GET /api/v1/auto-dm/unsubscribe/:token

- **鉴权**：不需要。
- **用途**：公开偏好中心读取当前 token 状态。

### POST /api/v1/auto-dm/unsubscribe/:token

- **鉴权**：不需要。
- **用途**：公开退订。

## Execution Queue

### GET /api/v1/review-queue

- **用途**：统一聚合待审核、待发布、已发布、失败内容。
- **当前类型**：`post` / `comment` / `reply`，预留 `dm`。
- **筛选**：`type`、`status`、`execution_mode`、分页参数。
- **说明**：页面叫 Execution Queue，接口仍保留 `/review-queue`。

## Publishing Pipeline

### GET /api/v1/publishing/status

- **用途**：只读查看当前发布器模式。
- **返回**：`real_publish_enabled`、`manual_publish_enabled`、`dry_run`、每日限流、冷却时间、当前用户连接账号数、缺少 `tweet.write` 的账号数。
- **安全**：不返回 access token。

### GET /api/v1/publishing/jobs

- **用途**：查看发布任务。
- **source_type**：`post` / `comment` / `reply`，预留 `dm`。

### POST /api/v1/publishing/jobs/:id/retry

- **用途**：重试失败发布任务。

### POST /api/v1/publishing/jobs/:id/cancel

- **用途**：取消未完成发布任务。

### POST /api/v1/publishing/jobs/:id/publish-now

- **用途**：手动触发 dry-run 或真实 X 发布。
- **真实发布前置条件**：
  - job 属于当前用户。
  - X 账号 connected 且 access token 存在。
  - OAuth scopes 包含 `tweet.write`。
  - `manual_publish_enabled=true`。
  - `dry_run=false` 时必须 `real_publish_enabled=true`。
  - 通过 per-account daily limit 和 cooldown。
- **重要边界**：scheduler 不会自动真实发布；真实发布只能由用户手动触发。
