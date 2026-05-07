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
  - `/wallet/*`

## PATCH /api/v1/users/me

- **用途**：更新当前用户资料（MVP：显示名）。
- **Body**：`{ "name": "Display Name" }`
- **响应**：同 `GET /users/me`，包含 `id`、`email`、`name`、`status`、`wallet_address`（若已绑定）。

## 邮件发送说明

- Provider 由 `backend/configs/config.*.yaml` 的 `email.provider` 指定。
- 当前已切换为 Amazon SES（`provider: ses`）。
- SES 配置位于 `email.ses`：
  - `region`
  - `access_key_id`
  - `secret_access_key`
  - `from_email`
- `/auth/email-code/send` 保持原协议不变，但底层发送已由 SES 实现。
- 发送失败返回更明确状态码：
  - `429`：频控限制
  - `502`：SES 调用失败
  - `500`：邮件发送成功后验证码落库失败

---

## Frontend Integration Status

以下模块在前端已对接 **真实 API**（具体页面以代码为准；未列出的接口可能仍为占位或未接）：

- **Auth**：`POST /auth/email-code/send`、`/verify`、`/register`、`/login`、`/refresh`；`GET/PATCH /users/me`
- **Wallet**：`POST /wallet/challenge`、`POST /wallet/bind`、`DELETE /wallet/bind`
- **Accounts**：`GET /accounts`、`POST /accounts/oauth/x/start`、`GET /accounts/oauth/x/callback`（浏览器跳转）、`DELETE /accounts/{id}`
- **Dashboard**：`GET /dashboard/overview`
- **Automations**：`GET /automations`、`PUT /automations/{type}`、`POST /automations/{type}/toggle`、`GET /automations/runtime-status`
- **Activities**：`GET /activities`（分页 query）
- **Billing**：`GET /billing/subscription`、`/plans`、`/payment-methods`、`POST /billing/orders`、`GET /billing/orders/{id}`；链上确认见 `POST /billing/webhooks/onchain`（[billing.md](./billing.md)）

仍为 **后端占位** 的接口：

- `GET /agents`（见 [agent.md](./agent.md)）

帖子接口见 [post.md](./post.md)（CRUD、execute 与定时调度均已实现）。

关键实现点：

- 前端请求层默认 Base URL 为 `http://localhost:10001/api/v1`（可被 `NEXT_PUBLIC_API_BASE_URL` 覆盖）。
- `Authorization` 由前端请求拦截器自动附带 `Bearer access_token`。
- 登录/注册成功后会将 `access_token` 与 `refresh_token` 写入本地会话。
- 登录页与 Dashboard 的钱包绑定流程统一为：`challenge -> signMessage -> bind`。
- Accounts 页面支持 OAuth 回调（含弹窗 `postMessage` 同步）并在绑定/解绑后触发 Dashboard 概览刷新。
