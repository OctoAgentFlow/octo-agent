# LOCAL_RUNBOOK

## 审计范围

本运行手册基于当前仓库的本地启动链路审计生成，只覆盖本地开发运行，不修改业务代码。

已读取的关键文件：

- `Makefile`
- `backend/cmd/api/main.go`
- `backend/cmd/admin/main.go`
- `frontend/package.json`
- `backend/configs/config.local.yaml`
- `backend/internal/router/router.go`
- `backend/internal/router/*_router.go`
- `frontend/src/lib/request.ts`
- `frontend/src/lib/frontend-role.ts`

## 本地前置条件

- Node.js 20+
- npm 10+
- Go 1.25+
- MySQL 8+
- 本地数据库需要存在：`octo_dev`

证据：

- `README.md`
- `backend/configs/config.local.yaml`
- `frontend/package.json`
- `backend/go.mod`

## 四个本地服务

| 服务 | 启动命令 | 端口 | 入口文件/脚本 | 说明 |
| --- | --- | --- | --- | --- |
| 用户前端 API Front | `make api-front-local` | `3000` | `frontend/package.json` -> `npm run dev:api-front` | 用户端页面，连接用户 API |
| 后台前端 Admin Front | `make admin-front-local` | `3001` | `frontend/package.json` -> `npm run dev:admin-front` | 后台管理页面，连接 Admin API |
| 用户后端 API | `make api-local` | `10001` | `backend/cmd/api/main.go` | 用户端业务 API，启动自动化调度 |
| 后台后端 Admin API | `make admin-api-local` | `10002` | `backend/cmd/admin/main.go` | 后台 API，只挂载登录和后台管理相关接口 |

证据：

- `Makefile`
- `frontend/package.json`
- `backend/configs/config.local.yaml`
- `backend/cmd/api/main.go`
- `backend/cmd/admin/main.go`

## 推荐启动顺序

1. 启动 MySQL，并确保 `octo_dev` 数据库存在。
2. 启动用户 API：

```bash
make api-local
```

3. 启动 Admin API：

```bash
make admin-api-local
```

4. 启动用户前端：

```bash
make api-front-local
```

5. 启动后台前端：

```bash
make admin-front-local
```

也可以先查看命令提示：

```bash
make local
```

## 停止本地服务

```bash
make stop
```

该命令会尝试停止以下端口监听：

- `10001`
- `10002`
- `3000`
- `3001`

证据：`Makefile` 中 `STOP_PORTS := 10001 10002 3000 3001`。

## 服务端口来源

### 后端端口

`backend/configs/config.local.api.yaml`：

- `api.port: 10001`

`backend/configs/config.local.admin.yaml`：

- `admin.port: 10002`

`backend/internal/config/config.go` 会读取 `APP_ENV` 和 `APP_SERVICE`。`APP_SERVICE=api` 时加载 `configs/config.local.api.yaml`，`APP_SERVICE=admin` 时加载 `configs/config.local.admin.yaml`；未设置 `APP_SERVICE` 时兼容加载 `configs/config.local.yaml`。

### 前端端口

`frontend/package.json`：

- `dev:api-front` 使用 `next dev -p 3000`
- `dev:admin-front` 使用 `next dev -p 3001`

## 用户端和后台端 API 指向

### 用户前端

启动命令：

```bash
make api-front-local
```

实际脚本：

```bash
NEXT_PUBLIC_FRONTEND_ROLE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:10001/api/v1 next dev -p 3000
```

用户前端请求：

- Base URL：`http://localhost:10001/api/v1`
- 默认兜底：`frontend/src/lib/request.ts` 中 `http://localhost:10001/api/v1`
- 前端角色：`api`

### 后台前端

启动命令：

```bash
make admin-front-local
```

实际脚本：

```bash
NEXT_PUBLIC_FRONTEND_ROLE=admin NEXT_PUBLIC_API_BASE_URL=http://localhost:10002/api/v1 next dev -p 3001
```

后台前端请求：

- Base URL：`http://localhost:10002/api/v1`
- 前端角色：`admin`
- 根路径会跳转 `/admin`

证据：

- `frontend/package.json`
- `frontend/src/lib/request.ts`
- `frontend/src/lib/frontend-role.ts`
- `frontend/src/app/page.tsx`

## 用户 API 挂载范围

用户 API 入口：`backend/cmd/api/main.go`。

路由构建：`router.NewAPI(db, cfg)`。

健康检查：

- `GET http://localhost:10001/health`

API 前缀：

- `http://localhost:10001/api/v1`

用户 API 已挂载模块：

- Auth：`/auth/email-code/send`、`/auth/email-code/verify`、`/auth/register`、`/auth/login`、`/auth/refresh`、`/users/me`、`/users/me/password`、`/users/me/notification-settings`
- Wallet：`/wallet/challenge`、`/wallet/bind`
- Dashboard：`/dashboard/overview`
- Accounts：`/accounts`、`/accounts/oauth/x/start`、`/accounts/oauth/x/callback`
- Automations：`/automations`、`/automations/:type`、`/automations/:type/toggle`、`/automations/runtime-status`
- Auto DM：`/auto-dm/tasks`、`/auto-dm/recipients`、`/auto-dm/recipient-rules/*`、`/auto-dm/unsubscribe/:token`
- Activity：`/activities`
- Analytics：`/analytics/overview`
- Billing：`/billing/*`、`/billing/webhooks/onchain`
- Posts：`/posts`、`/posts/:id`、`/posts/:id/execute`
- Agents：`/agents`

用户 API 会启动后台调度：

- 邮箱验证码清理
- 定时发帖
- Auto Reply
- Auto DM

证据：

- `backend/internal/router/router.go`
- `backend/internal/router/*_router.go`
- `backend/internal/jobs/scheduler.go`

## Admin API 挂载范围

Admin API 入口：`backend/cmd/admin/main.go`。

路由构建：`router.NewAdmin(db, cfg)`。

健康检查：

- `GET http://localhost:10002/health`
- `GET http://localhost:10002/admin/health`

API 前缀：

- `http://localhost:10002/api/v1`

Admin API 已挂载模块：

- 登录：`POST /auth/login`
- 刷新 token：`POST /auth/refresh`
- 当前用户：`GET /users/me`
- 后台概览：`GET /admin/overview`
- 用户列表：`GET /admin/users`
- 用户角色/状态更新：`PATCH /admin/users/:id`

Admin API 不挂载用户端业务路由，也不启动自动化调度任务。

证据：

- `backend/internal/router/router.go`
- `backend/internal/router/auth_router.go`
- `backend/internal/router/admin_router.go`
- `backend/cmd/admin/main.go`

## 配置说明

本地后端配置来自：

- `backend/configs/config.local.yaml`

主要配置项：

- `api.host` / `api.port`
- `admin.host` / `admin.port`
- `mysql.data_source`
- `email.provider`
- `app.frontend_base_url`
- `x_oauth.*`
- `billing.*`

本地邮件默认：

- `email.provider: local`
- `email.local.expose_code: true`

这意味着本地验证码可以直接验收，不依赖 Resend 或 SES。

## 快速健康检查

```bash
curl -i http://localhost:10001/health
curl -i http://localhost:10002/health
curl -i http://localhost:10002/admin/health
curl -I http://localhost:3000
curl -I http://localhost:3001
```

## 路由隔离检查

用户 API 不应暴露 Admin 管理接口：

```bash
curl -i http://localhost:10001/api/v1/admin/overview
```

预期：`404`。

Admin API 的后台接口未登录时应拒绝：

```bash
curl -i http://localhost:10002/api/v1/admin/overview
```

预期：`401`。

Admin API 不应暴露用户注册/验证码接口：

```bash
curl -i -X POST http://localhost:10002/api/v1/auth/email-code/send
```

预期：`404`。

## 常见本地问题

### API 启动失败：数据库连接失败

检查：

- MySQL 是否启动
- `octo_dev` 是否已创建
- `backend/configs/config.local.yaml` 中 `mysql.data_source` 是否匹配本机账号密码

### 用户端 X OAuth 失败

X OAuth 依赖外部平台配置，重点检查：

- X Developer Portal callback URL 是否等于 `backend/configs/config.local.yaml` 的 `x_oauth.redirect_uri`
- 本地回调地址是否为 `http://localhost:10001/api/v1/accounts/oauth/x/callback`
- X OAuth scope 是否满足发帖/读回复/DM 的需要

### 邮件验证码无法真实发送

本地默认 `local` provider，不会调用真实邮件服务。若要验收真实邮件发送，需要改用 Resend，并通过环境变量或私有 `.env` 提供 `RESEND_API_KEY`。

### 后台前端仍打开用户端页面

检查启动命令是否为：

```bash
make admin-front-local
```

后台前端必须带：

- `NEXT_PUBLIC_FRONTEND_ROLE=admin`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:10002/api/v1`
