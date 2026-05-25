# MVP_ACCEPTANCE_CHECKLIST

> 历史快照：本文档是早期 MVP 本地验收清单，保留用于追溯。当前继续开发和调试请使用 `CURRENT_ACCEPTANCE_CHECKLIST.md`。

## 验收状态定义

- `可直接验收`：只依赖本地 MySQL、本地 API、本地前端即可完成。
- `需要外部密钥/外部服务`：依赖 X Developer、Resend、钱包链上交易、BSC RPC 或真实社交平台权限。
- `当前无法完整验收`：当前仓库没有对应工程、CI、生产部署或必要功能仍未完整落地。

## 启动链路验收

### 1. 本地四服务启动

状态：可直接验收。

涉及文件：

- `Makefile`
- `frontend/package.json`
- `backend/cmd/api/main.go`
- `backend/cmd/admin/main.go`
- `backend/configs/config.local.yaml`

步骤：

1. 启动 MySQL，确认 `octo_dev` 存在。
2. 运行 `make api-local`。
3. 运行 `make admin-api-local`。
4. 运行 `make api-front-local`。
5. 运行 `make admin-front-local`。

验收标准：

- `http://localhost:10001/health` 返回成功。
- `http://localhost:10002/health` 返回成功。
- `http://localhost:10002/admin/health` 返回成功。
- `http://localhost:3000` 可访问用户端。
- `http://localhost:3001` 可访问后台端。

### 2. 前后端 API 指向

状态：可直接验收。

涉及文件：

- `frontend/package.json`
- `frontend/src/lib/request.ts`
- `frontend/src/lib/frontend-role.ts`
- `frontend/src/app/page.tsx`

验收标准：

- 用户前端请求 `http://localhost:10001/api/v1`。
- 后台前端请求 `http://localhost:10002/api/v1`。
- `http://localhost:3001` 根路径进入 `/admin`。
- 用户前端不展示后台专用导航入口。

### 3. API 路由隔离

状态：可直接验收。

涉及文件：

- `backend/internal/router/router.go`
- `backend/internal/router/auth_router.go`
- `backend/internal/router/admin_router.go`

步骤：

```bash
curl -i http://localhost:10001/api/v1/admin/overview
curl -i http://localhost:10002/api/v1/admin/overview
curl -i -X POST http://localhost:10002/api/v1/auth/email-code/send
```

验收标准：

- 用户 API 上 `/admin/overview` 返回 `404`。
- Admin API 上 `/admin/overview` 未登录返回 `401`。
- Admin API 上 `/auth/email-code/send` 返回 `404`。

## Auth 与用户账户

### 4. 邮箱验证码注册

状态：可直接验收。

涉及文件：

- `backend/internal/router/auth_router.go`
- `backend/internal/service/auth_service.go`
- `backend/internal/email/local.go`
- `frontend/src/components/forms/login-form.tsx`
- `backend/configs/config.local.yaml`

接口：

- `POST /api/v1/auth/email-code/send`
- `POST /api/v1/auth/register`

数据表：

- `users`
- `email_verification_codes`
- `user_notification_settings`

验收标准：

- 本地 `email.provider=local` 时发送验证码成功。
- local 模式响应或日志可获得验证码。
- 使用验证码可注册用户。
- 首个用户角色为 `owner`。
- 注册后自动登录并进入用户端。

### 5. 登录、刷新、当前用户

状态：可直接验收。

涉及文件：

- `backend/internal/service/auth_service.go`
- `backend/internal/router/auth_router.go`
- `frontend/src/services/auth.service.ts`
- `frontend/src/lib/auth-session.ts`

接口：

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/users/me`

数据表：

- `users`
- `user_wallets`

验收标准：

- 正确邮箱密码可以登录。
- 错误密码被拒绝。
- 登录后请求自动携带 Bearer token。
- `/users/me` 返回 id、email、name、status、role。

## Dashboard 与新手引导

### 6. Dashboard 概览

状态：可直接验收。

涉及文件：

- `backend/internal/router/dashboard_router.go`
- `backend/internal/service/dashboard_service.go`
- `frontend/src/app/(dashboard)/dashboard/page.tsx`
- `frontend/src/components/onboarding/user-onboarding-card.tsx`

接口：

- `GET /api/v1/dashboard/overview`
- `GET /api/v1/activities`
- `GET /api/v1/automations`
- `GET /api/v1/posts`

数据表：

- `users`
- `twitter_accounts`
- `activity_logs`
- `automation_configs`
- `posts`

验收标准：

- 新用户能看到试用、钱包、X 账号、活动等状态。
- 空数据状态不会报错。
- 页面刷新按钮能重新拉取数据。

## X 账号

### 7. X OAuth 绑定

状态：需要外部密钥/外部服务。

涉及文件：

- `backend/internal/router/account_router.go`
- `backend/internal/service/account_service.go`
- `frontend/src/services/account.service.ts`
- `frontend/src/components/accounts/accounts-client.tsx`
- `backend/configs/config.local.yaml`

接口：

- `POST /api/v1/accounts/oauth/x/start`
- `GET /api/v1/accounts/oauth/x/callback`
- `GET /api/v1/accounts`
- `DELETE /api/v1/accounts/:id`

数据表：

- `twitter_accounts`

验收标准：

- OAuth start 返回 X 授权地址。
- X Developer Portal callback 与本地 `x_oauth.redirect_uri` 一致。
- 授权成功后账号写入 `twitter_accounts`。
- 账号列表展示用户名、昵称、头像、状态。
- 解绑后账号不再出现在连接列表。

注意：

- 若没有有效 X Developer 配置或本地 callback 无法被浏览器完成授权，只能验收 start 接口和错误提示，不能验收完整 OAuth 回调。

## 钱包绑定

### 8. 钱包 challenge、签名、绑定

状态：需要外部密钥/外部服务。

涉及文件：

- `backend/internal/router/wallet_router.go`
- `backend/internal/service/wallet_service.go`
- `frontend/src/hooks/use-wallet-binding.ts`
- `frontend/src/components/web3/connect-wallet-button.tsx`

接口：

- `POST /api/v1/wallet/challenge`
- `POST /api/v1/wallet/bind`
- `DELETE /api/v1/wallet/bind`

数据表：

- `wallet_challenges`
- `user_wallets`

验收标准：

- 登录后连接钱包会创建 challenge。
- 钱包签名通过后写入 `user_wallets`。
- `/users/me` 返回 `wallet_address`。
- 解绑后钱包不再作为 primary wallet。

注意：

- 需要浏览器钱包或 Reown/AppKit 可用环境。

## Posts

### 9. 帖子 CRUD

状态：可直接验收。

涉及文件：

- `backend/internal/router/post_router.go`
- `backend/internal/service/post_service.go`
- `frontend/src/services/post.service.ts`
- `frontend/src/components/posts/*`

接口：

- `GET /api/v1/posts`
- `POST /api/v1/posts`
- `GET /api/v1/posts/:id`
- `PUT /api/v1/posts/:id`
- `DELETE /api/v1/posts/:id`

数据表：

- `posts`
- `twitter_accounts`

验收标准：

- 有 X 账号时可创建草稿或定时帖。
- 列表显示状态、内容、时间。
- 详情页可查看帖子。
- 可编辑内容和状态。
- 可删除自己的帖子。

### 10. 手动发布到 X

状态：需要外部密钥/外部服务。

涉及文件：

- `backend/internal/service/post_service.go`
- `backend/internal/integration/twitter/post.go`
- `frontend/src/components/posts/post-detail-client.tsx`

接口：

- `POST /api/v1/posts/:id/execute`

数据表：

- `posts`
- `twitter_accounts`
- `activity_logs`

验收标准：

- 绑定的 X 账号具备 `tweet.write` scope。
- 发布成功后帖子状态变为 `published`。
- `published_at` 有值。
- `activity_logs` 写入 `type=post,status=success`。
- X API 失败时帖子状态和失败原因可追踪。

## Automations / Agents

### 11. 自动化配置

状态：可直接验收。

涉及文件：

- `backend/internal/router/automation_router.go`
- `backend/internal/service/automation_service.go`
- `frontend/src/app/(dashboard)/agents/page.tsx`
- `frontend/src/components/automation/*`

接口：

- `GET /api/v1/automations`
- `PUT /api/v1/automations/:type`
- `POST /api/v1/automations/:type/toggle`
- `GET /api/v1/automations/runtime-status`
- `GET /api/v1/agents`

数据表：

- `automation_configs`
- `activity_logs`
- `posts`

验收标准：

- 新用户自动生成 post/reply/dm 默认配置。
- 可修改频率、日上限、语气、安全配置。
- 可启用/停用单个自动化模块。
- runtime-status 返回队列、成功时间、重试、待审核数量。

### 12. Auto Reply 调度执行

状态：需要外部密钥/外部服务。

涉及文件：

- `backend/internal/jobs/scheduler.go`
- `backend/internal/jobs/auto_reply_job.go`
- `backend/internal/service/auto_reply_service.go`
- `backend/internal/integration/twitter/timeline.go`
- `backend/internal/integration/twitter/post.go`

接口：

- 调度任务内部执行，无单独公开执行接口。

数据表：

- `automation_configs`
- `twitter_accounts`
- `activity_logs`
- `reply_reservations`

验收标准：

- Auto Reply 启用。
- X 账号具备读取帖子/回复与发帖权限。
- 调度能找到待回复评论。
- 成功回复写入 `activity_logs type=reply,status=success`。
- 同一评论不会重复回复。

### 13. Auto DM 审核、名单、重试、退订

状态：部分可直接验收，真实发送需要外部密钥/外部服务。

涉及文件：

- `backend/internal/router/automation_router.go`
- `backend/internal/service/auto_dm_service.go`
- `backend/internal/integration/twitter/dm.go`
- `frontend/src/app/(dashboard)/agents/page.tsx`
- `frontend/src/app/unsubscribe/[token]/page.tsx`

接口：

- `GET /api/v1/auto-dm/tasks`
- `POST /api/v1/auto-dm/tasks/:id/approve`
- `POST /api/v1/auto-dm/tasks/:id/block`
- `POST /api/v1/auto-dm/tasks/:id/retry`
- `GET /api/v1/auto-dm/recipients`
- `POST /api/v1/auto-dm/recipients/import`
- `PATCH /api/v1/auto-dm/recipient-rules/:id`
- `POST /api/v1/auto-dm/recipient-rules/bulk`
- `GET /api/v1/auto-dm/unsubscribe/:token`
- `POST /api/v1/auto-dm/unsubscribe/:token`

数据表：

- `auto_dm_tasks`
- `auto_dm_recipient_rules`
- `auto_dm_recipient_imports`
- `activity_logs`
- `twitter_accounts`

可直接验收：

- 任务列表空状态。
- CSV allowlist 导入。
- 名单搜索、状态筛选、批量操作。
- 公开退订链接在已有 token 时可访问。
- block/retry/approve 对已有任务的状态流转。

需要外部服务：

- 从真实 X 互动中生成候选。
- 通过 X DM API 真实发送。
- 回写 `dm_conversation_id`、`dm_event_id`。

验收标准：

- 黑名单和退订名单不会发送。
- 可重试失败有 `retryable=true` 和 `retry_after_at`。
- 真实发送成功写入 `status=sent`。
- 失败写入 `failure_category` 和 `failure_reason`。

## Activity

### 14. 活动日志筛选和失败详情

状态：可直接验收。

涉及文件：

- `backend/internal/router/activity_router.go`
- `backend/internal/service/activity_service.go`
- `frontend/src/app/(dashboard)/activity/page.tsx`
- `frontend/src/components/activity/*`

接口：

- `GET /api/v1/activities`

数据表：

- `activity_logs`
- `twitter_accounts`

验收标准：

- 支持 `type`、`status`、`range`、`account_id`、`error_reason` 筛选。
- 失败记录展示 `error_message`。
- Reply 活动展示目标评论和回复预览字段。
- Analytics 跳转 Activity 时 query 参数生效。

## Analytics

### 15. Analytics 概览

状态：可直接验收。

涉及文件：

- `backend/internal/router/analytics_router.go`
- `backend/internal/service/analytics_service.go`
- `frontend/src/services/analytics.service.ts`
- `frontend/src/app/(dashboard)/analytics/page.tsx`

接口：

- `GET /api/v1/analytics/overview?range=7d`
- `GET /api/v1/analytics/overview?range=30d`
- `GET /api/v1/analytics/overview?account_id=...`

数据表：

- `activity_logs`
- `posts`
- `twitter_accounts`
- `auto_dm_tasks`
- `auto_dm_recipient_rules`
- `auto_dm_recipient_imports`

验收标准：

- 7 日和 30 日切换正常。
- 空数据正常展示。
- 按账号筛选正常。
- 自动化拆分、失败原因、待处理项、内容效果、Auto DM 运营摘要都有数据结构返回。

当前不验收：

- X impressions、engagement 等外部表现指标；当前代码未接外部指标数据源。

## Billing

### 16. 订阅、套餐、支付方式、下单

状态：可直接验收。

涉及文件：

- `backend/internal/router/billing_router.go`
- `backend/internal/service/billing_service.go`
- `frontend/src/services/billing.service.ts`
- `frontend/src/app/(dashboard)/billing/page.tsx`
- `backend/configs/config.local.yaml`

接口：

- `GET /api/v1/billing/subscription`
- `GET /api/v1/billing/plans`
- `GET /api/v1/billing/payment-methods`
- `POST /api/v1/billing/orders`
- `GET /api/v1/billing/orders`
- `GET /api/v1/billing/orders/:id`

数据表：

- `users`
- `billing_orders`

验收标准：

- 能读取当前订阅状态。
- 能读取 YAML 配置的套餐和 BEP20 支付方式。
- 能创建订单。
- 订单有过期时间和收款地址。
- 订单列表能看到创建记录。

### 17. 链上确认和 webhook

状态：需要外部密钥/外部服务。

涉及文件：

- `backend/internal/service/billing_service.go`
- `backend/internal/billingevm/transfer.go`
- `backend/configs/config.local.yaml`

接口：

- `POST /api/v1/billing/orders/:id/confirm`
- `POST /api/v1/billing/webhooks/onchain`

数据表：

- `billing_orders`
- `billing_chain_txs`
- `billing_order_audits`
- `users`

验收标准：

- 使用真实 BEP20 USDT 交易 hash 可确认订单。
- 重复 tx hash 不会确认多个订单。
- 金额、链 ID、token、收款地址不匹配时订单进入失败/待复核状态。
- 支付成功后用户订阅变为 active。

注意：

- 需要可访问 BSC RPC 和真实链上交易。

## Settings / Profile

### 18. 个人资料、密码、通知设置

状态：可直接验收。

涉及文件：

- `backend/internal/router/auth_router.go`
- `backend/internal/service/auth_service.go`
- `frontend/src/app/(dashboard)/settings/page.tsx`
- `frontend/src/components/profile/profile-client.tsx`

接口：

- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `PATCH /api/v1/users/me/password`
- `GET /api/v1/users/me/notification-settings`
- `PATCH /api/v1/users/me/notification-settings`

数据表：

- `users`
- `user_notification_settings`
- `user_wallets`

验收标准：

- 可修改显示名。
- 可修改密码，旧密码错误时拒绝。
- 可保存通知偏好。
- Profile 页面展示用户信息。

## Admin

### 19. 后台登录和权限

状态：可直接验收。

涉及文件：

- `backend/internal/router/auth_router.go`
- `backend/internal/router/admin_router.go`
- `backend/internal/service/admin_service.go`
- `frontend/src/app/(auth)/login/page.tsx`
- `frontend/src/app/(dashboard)/admin/page.tsx`

接口：

- `POST http://localhost:10002/api/v1/auth/login`
- `GET http://localhost:10002/api/v1/users/me`
- `GET http://localhost:10002/api/v1/admin/overview`

数据表：

- `users`
- `billing_orders`
- `activity_logs`
- `automation_configs`

验收标准：

- `owner/admin` 可进入 `/admin`。
- 普通用户访问 `/admin/overview` 返回 `403`。
- 停用用户不能访问后台。
- Admin Front 全部请求指向 `10002`。

### 20. 用户管理

状态：可直接验收。

涉及文件：

- `backend/internal/service/admin_service.go`
- `backend/internal/dto/admin_dto.go`
- `frontend/src/services/admin.service.ts`
- `frontend/src/app/(dashboard)/admin/page.tsx`

接口：

- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:id`

数据表：

- `users`

验收标准：

- 可按邮箱/名称搜索。
- 可按角色和状态筛选。
- owner 可修改用户角色。
- admin 不可修改角色。
- 不允许移除最后一个 owner。
- 不允许停用当前登录的自己。

## 当前无法完整验收项

### 21. 合约工程

状态：当前无法完整验收。

原因：

- 仓库当前没有 `contracts/`。
- 没有 Hardhat、Foundry、Truffle 或 Solidity 源码。
- 当前只有后端 EVM 转账读取校验。

相关文件：

- `backend/internal/billingevm/transfer.go`

### 22. CI/CD

状态：当前无法完整验收。

原因：

- 仓库当前没有 `.github/workflows`。
- 前端没有测试脚本，只有 `npm run lint`。
- 后端存在 placeholder 测试。

相关文件：

- `backend/test/auth_test.go`
- `backend/test/user_test.go`
- `backend/test/post_test.go`
- `frontend/package.json`

### 23. 脚本化四服务部署

状态：当前无法完整验收。

原因：

- 本地 Makefile 已拆成四服务。
- 测试/生产部署脚本已准备，但需要在目标服务器完成真实部署后验收。
- 项目当前暂不使用 Docker/Compose/Nginx 模板。

相关文件：

- `Makefile`
- `scripts/deploy-all-test.sh`
- `scripts/deploy-all-prod.sh`
- `docs/deployment/DEPLOYMENT_SCRIPTS.md`

## MVP 结论

本地 MVP 主链路可以验收：

- 注册/登录
- Dashboard
- Posts CRUD
- Automations 配置
- Activity
- Analytics 内部指标
- Billing 下单
- Settings/Profile
- Admin MVP

需要外部密钥或外部服务才能完整验收：

- X OAuth 真实绑定
- X 发帖
- Auto Reply 真实执行
- Auto DM 真实发送
- Resend 真实发信
- BEP20 链上支付确认
- 钱包签名绑定的浏览器钱包链路

当前无法完整验收：

- 合约工程
- CI/CD
- 生产级四服务部署模板
