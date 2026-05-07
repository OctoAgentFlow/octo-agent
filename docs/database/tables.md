# Tables

> 以下表均在 `backend/internal/database/migrate.go` 的 `AutoMigrate` 中注册；以 **GORM model** 为权威定义。表级 COMMENT 由 `ApplyTableComments` 在迁移时写入 MySQL。

## 已落地（当前代码）

### users

- 用途：用户主表（邮箱注册/登录）
- 核心字段：`id`、`email`（unique）、`password_hash`、`display_name`、`status`、`created_at`、`updated_at`；订阅相关字段见 model（试用/到期等）

### email_verification_codes

- 用途：邮箱验证码（注册等流程）
- 与 `users` 无强制外键；按 `email` + `purpose` 查询

### wallet_challenges

- 用途：钱包绑定 challenge（防重放）
- 核心字段：`challenge_id`（unique）、`user_id`、`address`、`chain_id`、`nonce`、`message`、`expired_at`、`used_at`

### user_wallets

- 用途：用户钱包绑定
- 约束：`unique(address, chain_id)`（全表）；`is_primary` 等见 model

### user_notification_settings

- 用途：用户通知偏好；字段含邮件/站内总开关、自动化失败、计费提醒、待审核、订阅提醒、每周摘要等
- 约束：`user_id` 唯一；老用户首次读取 `/users/me/notification-settings` 时自动创建默认配置

### twitter_accounts

- 用途：用户绑定的 X（Twitter）账号
- 核心字段：`user_id`、`twitter_user_id`、`username`、`access_token`、`refresh_token`、`status` 等
- 列表接口排除 `status = disconnected`；`DELETE` 解绑为将状态置为 `disconnected`（软断开）

### automation_configs

- 用途：每用户、每类型（`post` / `reply` / `dm`）的自动化配置与状态

### activity_logs

- 用途：活动/任务执行记录（Dashboard 统计与 Activity 列表）
- `type=reply` 时可含 `reply_*` 预览字段；成功回复对同一评论去重依赖 `ref_tweet_id` 与唯一索引（见 model）

### reply_reservations

- 用途：自动回复 **并发占位**（`user_id` + `comment_tweet_id`），防止重复回复同一评论

### auto_dm_tasks

- 用途：Auto DM 候选、能力检查、审批、真实发送结果和审计记录；真实发送器只能消费已通过权限与审批的任务
- 核心字段：`user_id`、`x_account_id`、`recipient_source`、`recipient_user_id`、`recipient_username`、`status`、`capability_status`、`failure_reason`、`approval_required`、`activity_log_id`、`dm_conversation_id`、`dm_event_id`

### posts

- 用途：用户待发/已计划/已发布等内容；字段含 `x_account_id`、`content`、`status`、`scheduled_at`、`published_at` 等（见 `model.Post`）

### agents / tasks

- 用途：历史 scaffold 实体；当前 `GET /agents` 已作为兼容接口读取 `automation_configs` 的真实状态，尚未使用独立 `agents` 表；任务表供后续执行器使用

### billing_orders

- 用途：链上 USDT 支付订单（`pending`/`paid`/`failed`/`expired`）；与 `users` 关联；记录最近一次校验失败原因和检查时间，支持用户补交 tx hash 恢复异常订单

### billing_chain_txs

- 用途：已消费的链上交易哈希（按 `chain_id`+`tx_hash` 唯一），防止重复确认

---

## 说明

- 独立 `subscriptions` 表：**当前未使用**；订阅字段在 `users` 上维护（以 model 为准）。
- `x_accounts` 更名迁移：当前仍使用 **`twitter_accounts`** 表名。
