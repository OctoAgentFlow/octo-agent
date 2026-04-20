# Tables

> 以下表均在 `backend/internal/database/migrate.go` 的 `AutoMigrate` 中注册；以 **GORM model** 为权威定义。

## 已落地（当前代码）

### users

- 用途：用户主表（邮箱注册/登录）
- 核心字段：`id`、`email`（unique）、`password_hash`、`display_name`、`status`、`created_at`、`updated_at`

### email_verification_codes

- 用途：邮箱验证码（注册等流程）
- 与 `users` 无强制外键；按 `email` + `purpose` 查询

### wallet_challenges

- 用途：钱包绑定 challenge（防重放）
- 核心字段：`challenge_id`（unique）、`user_id`、`address`、`chain_id`、`nonce`、`message`、`expired_at`、`used_at`

### user_wallets

- 用途：用户钱包绑定
- 约束：`unique(address, chain_id)`（全表）；`is_primary` 等见 model

### twitter_accounts

- 用途：用户绑定的 X（Twitter）账号
- 核心字段：`user_id`、`twitter_user_id`、`username`、`access_token`、`refresh_token`、`status` 等
- 列表接口排除 `status = disconnected`；`DELETE` 解绑为将状态置为 `disconnected`（软断开）

### automation_configs

- 用途：每用户、每类型（`post` / `reply` / `dm`）的自动化配置与状态

### activity_logs

- 用途：活动/任务执行记录（Dashboard 统计与 Activity 列表）

### posts

- 用途：用户待发/已计划/已发布等内容；字段含 `x_account_id`、`content`、`status`、`scheduled_at`、`published_at` 等（见 `model.Post`）

### agents / tasks

- 用途：历史 scaffold 实体；**`GET /agents` 仍为占位**；任务表供后续执行器使用

---

## 规划中（未在 migrate 中出现则未实现）

以下若未出现在 `migrate.go` 中，则 **尚未落地**：

- 独立 `subscriptions` / `billing_orders` / `payment_records` 等计费表（当前 Billing 多为服务层静态/MVP 逻辑）
- `x_accounts` 更名迁移（当前仍使用 `twitter_accounts` 表名）
