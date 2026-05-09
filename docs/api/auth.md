# Auth & Wallet API

Base path: `/api/v1`

统一返回结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

## Auth

### POST /api/v1/auth/register
- 用途：邮箱注册并返回 token（必须先完成邮箱验证码校验）
- 请求体：
```json
{
  "email": "user@example.com",
  "password": "123456",
  "name": "demo",
  "verification_code": "123456"
}
```

### POST /api/v1/auth/email-code/send
- 用途：发送邮箱验证码（仅 API 服务提供）
- 请求体：
```json
{
  "email": "user@example.com",
  "purpose": "register"
}
```
- 规则：
  - `purpose` 默认 `register`，支持：`register`、`admin_login`
  - 同邮箱 + 同用途 60 秒内限流
  - 验证码 6 位数字，有效期 10 分钟
  - 本地环境会返回 `data.code` 便于联调；非本地不返回

### POST /api/v1/auth/email-code/verify
- 用途：校验邮箱验证码（成功后立即删除，单次使用）
- 请求体：
```json
{
  "email": "user@example.com",
  "purpose": "register",
  "code": "123456"
}
```

### POST /api/v1/auth/login
- 用途：邮箱登录并返回 token
- 请求体：
```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

### POST /api/v1/auth/refresh
- 用途：刷新 access token（MVP 简化实现）
- 请求体：
```json
{
  "refresh_token": "<refresh_token>"
}
```

### GET /api/v1/users/me
- 用途：获取当前用户
- 鉴权：`Authorization: Bearer <access_token>`

---

## Wallet

### POST /api/v1/wallet/challenge
- 用途：生成绑定钱包 challenge
- 鉴权：需要
- 请求体：
```json
{
  "address": "0xabc123",
  "chain_id": 1
}
```

### POST /api/v1/wallet/bind
- 用途：绑定钱包（基于 challenge message 的 EVM 签名校验）
- 鉴权：需要
- 请求体：
```json
{
  "challenge_id": "<challenge_id>",
  "address": "0xabc123",
  "signature": "0xdeadbeef",
  "chain_id": 1
}
```

- 服务端校验要点：
  - challenge 必须有效、未过期、未使用
  - challenge 必须属于当前登录用户（JWT user_id）
  - `address`、`chain_id` 必须与 challenge 一致
  - 使用 `personal_sign` 风格签名恢复地址并与 `address` 比对
  - 同一钱包地址不允许跨用户绑定

### DELETE /api/v1/wallet/bind
- 用途：解绑钱包
- 鉴权：需要
- 请求体（可选，建议传）：
```json
{
  "address": "0xabc123",
  "chain_id": 1
}
```

---

## 鉴权说明

- Public：
  - `POST /auth/email-code/send`
  - `POST /auth/email-code/verify`
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh`
- Protected：
  - `GET /users/me`
  - `PATCH /users/me`
  - `PATCH /users/me/password`
  - `GET /users/me/notification-settings`
  - `PATCH /users/me/notification-settings`
  - `/wallet/*`

## PATCH /api/v1/users/me

- **用途**：更新当前用户资料（MVP：显示名）。
- **Body**：`{ "name": "Display Name" }`
- **响应**：同 `GET /users/me`，包含 `id`、`email`、`name`、`status`、`wallet_address`（若已绑定）。

## PATCH /api/v1/users/me/password

- **用途**：当前登录用户修改密码。
- **Body**：`{ "current_password": "old-password", "new_password": "new-password-123" }`
- **规则**：当前密码必须正确；新密码至少 8 位，最长 128 位，且不能与当前密码相同。
- **响应**：`{ "changed": true }`。前端会在修改成功后清理本地会话并跳转登录页。

## GET /api/v1/users/me/notification-settings

- **用途**：读取当前用户通知偏好；首次读取会为老用户创建默认配置。
- **响应字段**：`email_enabled`、`in_app_enabled`、`automation_failure`、`billing_alerts`、`review_required`、`subscription_alerts`、`weekly_summary`。

## PATCH /api/v1/users/me/notification-settings

- **用途**：更新当前用户通知偏好。请求体支持部分字段更新，未传字段保持不变。
- **Body 示例**：`{ "email_enabled": true, "automation_failure": true, "weekly_summary": false }`
- **响应**：同 `GET /users/me/notification-settings`。

## 邮件发送说明

- Provider 由 `backend/configs/config.*.yaml` 的 `email.provider` 指定。
- 本地开发默认使用 `provider: local`：不会调用外部邮件服务，验证码会写入 API 日志；`APP_ENV=local` 时接口响应也会返回验证码，方便本地注册闭环。
- 生产建议使用 `provider: resend`，配置位于 `email.resend`：
  - `api_key`
  - `from_email`
- 仍保留 `provider: ses` 作为兼容选项，配置位于 `email.ses`。
- `/auth/email-code/send` 保持原协议不变，底层发送由 provider 决定。
- 发送失败返回更明确状态码：
  - `429`：频控限制
  - `502`：邮件 provider 调用失败
  - `500`：邮件发送成功后验证码落库失败

---

## Frontend Integration Status

以下模块在前端已对接 **真实 API**（具体页面以代码为准；未列出的接口可能仍为占位或未接）：

- **Auth**：`POST /auth/email-code/send`、`/verify`、`/register`、`/login`、`/refresh`；`GET/PATCH /users/me`；`PATCH /users/me/password`；`GET/PATCH /users/me/notification-settings`
- **Wallet**：`POST /wallet/challenge`、`POST /wallet/bind`、`DELETE /wallet/bind`
- **Accounts**：`GET /accounts`、`POST /accounts/oauth/x/start`、`GET /accounts/oauth/x/callback`（浏览器跳转）、`DELETE /accounts/{id}`
- **Dashboard**：`GET /dashboard/overview`
- **Automations**：`GET /automations`、`PUT /automations/{type}`、`POST /automations/{type}/toggle`、`GET /automations/runtime-status`
- **Activities**：`GET /activities`（分页 query）
- **Billing**：`GET /billing/subscription`、`/plans`、`/payment-methods`、`POST /billing/orders`、`GET /billing/orders/{id}`；链上确认见 `POST /billing/webhooks/onchain`（[billing.md](./billing.md)）

Agent 兼容列表见 [agent.md](./agent.md)。

帖子接口见 [post.md](./post.md)（CRUD、execute 与定时调度均已实现）。

关键实现点：

- 前端请求层默认 Base URL 为 `http://localhost:10001/api/v1`（可被 `NEXT_PUBLIC_API_BASE_URL` 覆盖）。
- `Authorization` 由前端请求拦截器自动附带 `Bearer access_token`。
- 登录/注册成功后会将 `access_token` 与 `refresh_token` 写入本地会话。
- 登录页与 Dashboard 的钱包绑定流程统一为：`challenge -> signMessage -> bind`。
- Accounts 页面支持 OAuth 回调（含弹窗 `postMessage` 同步）并在绑定/解绑后触发 Dashboard 概览刷新。
