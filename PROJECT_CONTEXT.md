# PROJECT_CONTEXT

## 1. 项目目标

Octo-Agent 是一个面向 Web3 团队、创作者和轻量增长团队的 AI 社交内容运营平台。项目目标是把 X/Twitter 账号连接、内容发布、自动化回复、自动化配置、活动日志、订阅计费和钱包绑定整合到一个全栈控制台中。

当前产品形态包括：

- Landing page：介绍 Auto Post / Auto Reply / Auto DM 等能力。
- 用户系统：邮箱验证码、注册、登录、刷新 token、当前用户资料。
- 工作台：Dashboard、X 账号管理、自动化配置、活动日志、帖子管理、订阅计费、个人中心。
- 后端 API：统一挂载在 `/api/v1`，健康检查为 `/health`。
- 链上支付：MVP 使用 YAML 配置的 USDT/BEP20 支付方式，后端通过 EVM RPC 校验交易。

## 2. 已完成模块

### 前端

- Next.js App Router 项目结构已搭建。
- 登录/注册页面：`frontend/src/app/(auth)/login/page.tsx`。
- Dashboard 页面：展示概览、钱包连接状态、自动化状态、近期活动。
- X 账号页面：账号列表、OAuth 绑定入口、解绑。
- 自动化页面：位于 `/agents`，实际使用 `/automations` API 管理 Auto Post / Auto Reply / Auto DM 配置。
- Activity 页面：活动日志列表，支持类型、状态、时间范围、账号和失败原因筛选；失败/待审核记录可展开查看详情并复制错误。
- Billing 页面：订阅、套餐、支付方式、下单、支付状态轮询、订单历史与异常订单补交 tx hash。
- Posts 页面：帖子列表、创建、详情、编辑、删除、执行。
- Analytics 页面：真实接口驱动的活动概览、7/30 日趋势、账号筛选、账号对比、自动化拆分、失败原因、待处理项与内容状态；可跳转 Activity 排查。
- Settings 页面：当前用户资料编辑、通知偏好持久化、语言偏好、本地安全/快捷入口。
- Profile 页面：通过 `/users/me` 展示当前用户资料。
- 多语言字典：`frontend/src/i18n/dictionaries`。
- 钱包连接：Reown AppKit、wagmi、viem 相关封装位于 `frontend/src/lib/web3` 与 `frontend/src/components/web3`。

### 后端

- Gin API 服务入口：`backend/cmd/api/main.go`。
- Admin 健康检查服务入口：`backend/cmd/admin/main.go`。
- 配置加载：`APP_ENV` 选择 `backend/configs/config.<env>.yaml`，默认 `local`。
- MySQL + GORM：模型在 `backend/internal/model`，AutoMigrate 在 `backend/internal/database/migrate.go`。
- Auth：邮箱验证码、注册、登录、刷新 token、`/users/me`、通知偏好设置。
- Wallet：challenge、签名绑定、解绑。
- Accounts：X OAuth 2.0 PKCE 授权、账号列表、解绑；账号会记录授权 scope，Auto DM 需要 `dm.read` / `dm.write`。
- Dashboard：概览聚合。
- Automations：自动化配置 CRUD 风格接口、开关、runtime status。
- Posts：CRUD、手动执行、定时发布。
- Auto Reply：已有调度入口和执行服务，使用 `reply_reservations` 防止并发重复回复。
- Auto DM：已有调度入口和 pre-send/audit 执行服务，会写入 `auto_dm_tasks` 与 `activity_logs type=dm` 的待审核或失败记录；支持审核/拦截，真实私信发送待 X DM 权限和风控规则确认。
- Activity：活动日志分页列表、时间范围筛选、账号筛选、失败原因筛选、失败详情展开。
- Analytics：7/30 日活动窗口、账号筛选、账号对比、自动化拆分、失败原因、待处理项、内容状态聚合。
- Billing：套餐、支付方式、订单创建、订单列表、订单查询、用户补交 tx hash、自动过期、失败原因记录、链上 webhook 确认。
- Email：AWS SES 邮件发送。
- Deploy 模板：Docker、Docker Compose、Nginx、部署脚本。

## 3. 未完成模块

- Auto DM：已具备调度器、发送前审计任务、权限 scope 检测、审核/拦截与 Activity 闭环，但尚未接入真实私信发送链路。
- Admin：后端 admin 当前主要提供健康检查，没有完整后台管理功能。
- 合约工程：仓库内没有 `contracts/`、Hardhat、Foundry 或 Solidity 源码；只有钱包连接和 EVM 支付校验。
- Billing 扩展：当前已支持下单、订单历史、用户补交 tx hash、异常原因记录、自动过期与链上确认；对账、退款/人工审核等仍可继续产品化。
- Analytics 扩展：当前支持 7/30 日窗口、账号维度、账号对比、失败原因、待处理项和 Activity 排查跳转，转化指标、内容效果指标仍可继续补齐。

## 4. 本地启动方式

### 前置依赖

- Node.js 20+
- npm 10+
- Go 1.25+
- MySQL 8+

### 后端

1. 确保 MySQL 正在运行，并创建本地数据库，例如 `octo_dev`。
2. 检查 `backend/configs/config.local.yaml` 中的 MySQL DSN、邮件、X OAuth、Billing 配置。
3. 启动 API 服务：

```bash
make api-local
```

默认 API 地址：

```text
http://localhost:10001
```

健康检查：

```text
GET http://localhost:10001/health
```

API 前缀：

```text
http://localhost:10001/api/v1
```

启动 Admin 服务：

```bash
make admin-local
```

默认 Admin 地址：

```text
http://localhost:10002
```

### 前端

1. 安装依赖：

```bash
cd frontend
npm install
```

2. 创建 `frontend/.env.local`：

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:10001/api/v1
```

注意：当前 `frontend/.env.example` 写的是 `http://localhost:8080/api/v1`，但 README 和 `backend/configs/config.local.yaml` 的本地 API 端口是 `10001`，本地联调建议以 `10001` 为准。

3. 启动前端：

```bash
make api-front-local
```

默认前端地址：

```text
http://localhost:3000
```

Admin Front 命令：

```bash
make admin-front-local
```

默认端口：

```text
http://localhost:3001
```

### 常用命令

```bash
make install
make lint
cd backend && go test ./...
cd frontend && npm run lint
```

## 5. 环境变量

### 前端环境变量

- `NEXT_PUBLIC_API_BASE_URL`
  - 用途：前端请求后端 API 的 base URL。
  - 本地建议值：`http://localhost:10001/api/v1`。

### 后端环境变量

- `APP_ENV`
  - 用途：选择加载 `backend/configs/config.<APP_ENV>.yaml`。
  - 默认值：`local`。
  - 本地建议值：`local`。

后端主要配置不再通过大量环境变量覆盖，而是集中写在 YAML 中：

- 服务端口：`api`、`admin`
- MySQL：`mysql`
- 日志：`log`
- 邮件：`email`
- OAuth 回调前端地址：`app.frontend_base_url`
- X OAuth：`x_oauth`
- Billing：`billing`

### YAML 配置重点

`backend/configs/config.local.yaml` 中包含以下配置块：

- `api.host` / `api.port`
- `admin.host` / `admin.port`
- `mysql.data_source`
- `log.*`
- `email.provider` / `email.ses.*`
- `app.frontend_base_url`
- `x_oauth.client_id`
- `x_oauth.client_secret`
- `x_oauth.redirect_uri`
- `x_oauth.state_secret`
- `billing.order_ttl_minutes`
- `billing.webhook_secret`
- `billing.rpc_urls`
- `billing.payment_methods`
- `billing.plans`

注意：本地配置文件中可能包含真实或敏感凭据，提交或分享前应检查并替换为安全占位值。

## 6. 数据库/合约/前端之间的关系

### 前端与后端

前端通过 `frontend/src/lib/request.ts` 和 `frontend/src/services/*` 调用后端 API。典型关系如下：

- Auth 页面 -> `/auth/email-code/send`、`/auth/register`、`/auth/login`、`/auth/refresh`、`/users/me`
- Wallet 组件 -> 钱包 challenge / bind / unbind 接口
- Accounts 页面 -> `/accounts`、`/accounts/oauth/x/start`、OAuth callback
- Dashboard 页面 -> `/dashboard/overview`、`/activities`、`/automations/runtime-status`
- Agents/Automations 页面 -> `/automations`、`/automations/:type`、`/automations/:type/toggle`；兼容列表 `/agents`
- Activity 页面 -> `/activities?type=...&status=...&range=...&account_id=...&error_reason=...`
- Billing 页面 -> `/billing/subscription`、`/billing/plans`、`/billing/payment-methods`、`/billing/orders`、`/billing/orders/:id/confirm`
- Posts 页面 -> `/posts`、`/posts/:id`、`/posts/:id/execute`
- Analytics 页面 -> `/analytics/overview?range=7d|30d&account_id=...`
- Settings 页面 -> `/users/me`、`/users/me/notification-settings`、本地语言偏好
- Profile 页面 -> `/users/me`

### 后端与数据库

后端使用 GORM 访问 MySQL，核心表由 `backend/internal/database/migrate.go` AutoMigrate 注册。当前主要表包括：

- `users`
- `email_verification_codes`
- `user_notification_settings`
- `wallet_challenges`
- `user_wallets`
- `twitter_accounts`
- `automation_configs`
- `activity_logs`
- `reply_reservations`
- `auto_dm_tasks`
- `posts`
- `agents`
- `tasks`
- `billing_orders`
- `billing_chain_txs`

数据库承担：

- 用户、钱包、订阅状态存储。
- 通知偏好存储：邮件/站内开关、自动化失败、计费提醒、待审核、订阅提醒、每周摘要。
- X 账号 OAuth token 和账号状态存储。
- 自动化配置和运行状态记录。
- Auto DM 发送前候选、能力检查、审批/拦截和审计记录。
- 帖子草稿、计划发布时间、发布状态。
- 活动日志、自动回复去重记录；新活动日志写入 `x_account_id`，旧日志仍可按 `account_handle` 兼容筛选。
- 计费订单、异常校验原因、最近检查时间和已确认链上交易哈希防重复。

### 合约/链上关系

当前仓库没有智能合约工程，也没有 Solidity 合约源码。链上能力主要是支付校验：

- 前端使用钱包连接库获取用户钱包地址并完成绑定。
- Billing 页面创建订单后，用户按配置的 USDT/BEP20 支付方式转账。
- 后端通过 `billing.rpc_urls` 中配置的 EVM RPC 查询交易。
- 后端校验交易的 chain id、token address、receiver address、金额、tx hash 等。
- 已确认交易写入 `billing_chain_txs`，避免同一链上交易重复确认。
- 支付成功后更新 `billing_orders` 和用户订阅状态。
- 如果 webhook 缺失或用户提交错误哈希，订单会记录失败原因；用户可在未过期前补交正确 tx hash 重新校验。

## 7. 后续开发建议

建议优先继续沿着可观测的小闭环推进，避免直接做无边界群发。

### 当前建议任务：Auto DM 真实发送接入

目标：在已有 pre-send/audit 基础上，只消费已审批且具备 DM scope 的任务，接入真实 X DM 发送。

建议范围：

- 接入 X DM 发送 endpoint，并处理成功/失败响应。
- 真实发送器只消费 `auto_dm_tasks.status=approved` 且 capability 满足的任务。
- 补充收件人来源：优先只支持明确互动或导入白名单。
- 发送成功后更新 `auto_dm_tasks.status=sent`、`sent_at`，并写 Activity success。
- 发送失败记录失败原因并保持可追溯。
- 补充 API 文档、运行说明和测试。

这类任务覆盖 controller、service、repository、DTO、前端 service、页面渲染，但业务风险较低，适合持续迭代。

### 后续优先级

1. 修正前端 `.env.example` 与本地后端端口不一致的问题。
2. Auto DM 真实发送接入：只消费已审批、权限满足、收件人规则合法的任务。
3. Settings 安全和工作区级配置。
4. Billing 对账、退款/人工审核与支付筛选。
5. 扩展 Analytics 的内容效果和转化指标。
6. 若后续需要独立 Agent 实体，将 `agents` 表与自动化配置建立关联。
7. 真实 Auto DM 发送接入：在权限、风控策略、限流、用户授权范围和审计日志确认后实现。
8. 如果未来需要自有链上合约，再独立新增 contracts 工程，并明确它与 Billing 当前 EVM 支付校验的边界。
