# Tables

> 以下表均在 `backend/internal/database/migrate.go` 的 `AutoMigrate` 中注册；以 **GORM model** 为权威定义。表级 COMMENT 由 `ApplyTableComments` 在迁移时写入 MySQL。

## 用户、认证、钱包

### users

- 用途：用户主表。
- 核心字段：邮箱、密码哈希、展示名、状态、角色、试用/订阅字段。
- 角色：`user` / `owner` / `admin`。首个注册用户或迁移兜底用户会成为 `owner`。

### email_verification_codes

- 用途：邮箱验证码，支持注册、登录等 purpose。

### user_notification_settings

- 用途：用户通知偏好。

### wallet_challenges

- 用途：钱包绑定签名 challenge。

### user_wallets

- 用途：用户钱包绑定，按 address + chain_id 唯一。

## X 账号与活动

### twitter_accounts

- 用途：用户绑定的 X 账号。
- 核心字段：`user_id`、`twitter_user_id`、`username`、`access_token`、`refresh_token`、`oauth_scopes`、`status`。
- 说明：真实发布灰度要求账号 `status=connected` 且 scopes 包含 `tweet.write`。

### activity_logs

- 用途：活动/任务执行记录，支撑 Dashboard、Activity、Analytics 和发布器可观测性。
- 覆盖：post、reply、comment、dm、billing、publishing、名单变更、AI 生成等场景。

### reply_reservations

- 用途：自动回复并发占位，避免重复处理同一评论。

## OAF Bot 与 AI 用量

### oaf_bots

- 用途：OAF Bot 社交人格机器人配置。
- 核心字段：`user_id`、`twitter_account_id`、`name`、职业/行业、年龄段、性别表达、学历、MBTI、性格标签、身份摘要、语气、话题、禁聊话题、增长目标、安全模式、`primary_language`、`language_strategy`。
- 当前规则：one bot per account。一个 OAF Bot 最多绑定一个 X 账号，一个 X 账号同一时间最多绑定一个 active OAF Bot。

### ai_generation_usages

- 用途：AI 生成次数月度聚合。
- 维度：`user_id`、`bot_id`、`scene`、`month`。
- scene：`test_generate`、`auto_post`、`auto_reply`、`auto_comment`、预留 `auto_dm`。
- 说明：这是套餐级 `monthly_ai_generations` 的消耗分布，不是 scene 独立额度。

## 自动化配置

### automation_configs

- 用途：每用户、每自动化类型的配置和执行模式。
- 类型：`post` / `reply` / `dm` 等。
- 执行模式：`manual` / `review` / `autopilot`，用于决定生成内容进入草稿、审核或待发布。

## Auto Post Planner

### auto_post_plans

- 用途：Auto Post Planner 配置。
- 核心字段：`user_id`、`twitter_account_id`、`enabled`、`execution_mode`、`daily_limit`、`min_interval_minutes`、`posting_windows`、`timezone`、`last_run_at`、`next_run_at`。
- 说明：scheduler 只负责到点生成草稿，不直接真实发布到 X。

### content_library_items

- 用途：Auto Post 轻量内容池。
- 核心字段：`user_id`、`twitter_account_id`、`bot_id`、`title`、`item_type`、`body`、`source_url`、`topics`、`growth_goal`、`cta_preference`、`priority`、`status`、`usage_count`、`last_used_at`。
- item_type：`idea`、`product_update`、`faq`、`case_study`、`announcement`、`link`、`thread_seed`。
- status：`active` / `paused` / `archived`。

### auto_post_drafts

- 用途：Auto Post 生成出的草稿、审核和发布状态。
- 核心字段：`user_id`、`twitter_account_id`、`bot_id`、`plan_id`、`content_library_item_id`、`content`、`content_hash`、`status`、`execution_mode`、风险字段、失败字段、发布时间字段。
- 状态：`draft` / `pending_review` / `approved` / `ready_to_publish` / `published` / `rejected` / `failed`。
- 说明：`ready_to_publish` 或 `approved` 后由 Publishing Pipeline 创建 `publish_jobs`。

### auto_post_generation_runs

- 用途：Auto Post scheduler / run-now 的运行记录。
- 状态：`completed` / `skipped` / `failed`。
- skip_reason：`no_active_content_source`、`ai_generation_quota_exceeded`、`daily_auto_post_limit_exceeded`、`duplicate_content` 等。

## Auto Reply / Auto Comment

### auto_reply_drafts

- 用途：Auto Reply 生成、编辑、审核和发布状态。
- 核心字段：用户、X 账号、Bot、评论上下文、生成内容、执行模式、状态、风险和失败字段。
- 状态：`draft` / `pending_review` / `approved` / `ready_to_publish` / `published` / `rejected` / `failed`。

### auto_comment_targets

- 用途：Auto Comment 目标推文/目标账号。
- 核心字段：`user_id`、`twitter_account_id`、目标推文 ID/URL、作者 handle、目标文本、状态。

### auto_comment_tasks

- 用途：Auto Comment 生成、审核、待发布和失败记录。
- 核心字段：`user_id`、`bot_id`、`twitter_account_id`、`target_id`、`generated_content`、`status`、`execution_mode`、风险字段、失败字段。

## Publishing Pipeline

### publish_jobs

- 用途：统一发布任务。
- source_type：`post` / `comment` / `reply`，预留 `dm`。
- 状态：`pending` / `processing` / `published` / `failed` / `cancelled`。
- 发布模式：`simulated` / `dry_run` / `real`。
- 核心字段：用户、X 账号、Bot、source_type、source_id、content、attempt_count、max_attempts、next_attempt_at、last_error、external_id、external_url、published_at。
- 说明：scheduler 只 simulated publish；真实 X 发布只能通过手动 `publish-now` 且配置允许后触发。

## Auto DM

### auto_dm_tasks

- 用途：Auto DM 候选、能力检查、审批、真实发送结果和审计记录。

### auto_dm_recipient_rules

- 用途：Auto DM 收件人准入/退出规则。
- status：`allowlisted` / `blocked` / `unsubscribed`。

### auto_dm_recipient_imports

- 用途：Auto DM allowlist CSV 导入批次审计。

## Posts / Legacy Agent

### posts

- 用途：传统帖子草稿、定时发布和手动发布。
- 说明：Auto Post 新工作流优先使用 `auto_post_plans` / `auto_post_drafts`，`posts` 仍保留传统创建和执行能力。

### agents / tasks

- 用途：历史 scaffold 实体；当前 `GET /agents` 作为兼容接口读取自动化状态，尚未作为新 OAF Bot 主实体。

## Billing

### billing_orders

- 用途：链上 USDT 支付订单，含 pending / paid / failed / expired 状态、校验失败原因、对账/审核字段。

### billing_order_audits

- 用途：Billing 运营操作审计。

### billing_chain_txs

- 用途：已消费链上交易哈希，防重复确认。

## 说明

- 当前没有独立 `subscriptions` 表，订阅字段在 `users` 上维护。
- 当前仍使用 `twitter_accounts` 表名，不使用 `x_accounts`。
- 仓库没有智能合约工程；链上能力主要是 EVM/USDT 支付校验和钱包绑定。
