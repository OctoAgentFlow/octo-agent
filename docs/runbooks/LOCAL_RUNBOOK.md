# LOCAL_RUNBOOK

本文档用于本地开发和调试。当前项目实际联调以测试服务器为主，但本地四服务仍可用于代码级验证、接口调试和构建检查。

## 前置条件

- Node.js 22+
- npm 10+
- Go 1.25+
- MySQL 8+
- 本地数据库：`octo_dev`

## 四服务启动

| 服务 | 命令 | 端口 | 说明 |
| --- | --- | ---: | --- |
| 用户 API | `make api-local` | 10001 | `APP_ENV=local APP_SERVICE=api`，启动用户端 API 和 scheduler |
| Admin API | `make admin-api-local` | 10002 | `APP_ENV=local APP_SERVICE=admin`，不启动 scheduler |
| 用户前端 | `make api-front-local` | 3000 | `NEXT_PUBLIC_FRONTEND_ROLE=api`，请求用户 API |
| 后台前端 | `make admin-front-local` | 3001 | `NEXT_PUBLIC_FRONTEND_ROLE=admin`，请求 Admin API |

停止本地服务：

```bash
make stop
```

## 推荐启动顺序

```bash
make api-local
make admin-api-local
make api-front-local
make admin-front-local
```

健康检查：

```bash
curl -i http://localhost:10001/health
curl -i http://localhost:10002/health
curl -i http://localhost:10002/admin/health
curl -I http://localhost:3000
curl -I http://localhost:3001
```

## 配置加载规则

后端配置由 `APP_ENV` + `APP_SERVICE` 决定：

| 环境变量 | 配置文件 |
| --- | --- |
| `APP_ENV=local APP_SERVICE=api` | `backend/configs/config.local.api.yaml` |
| `APP_ENV=local APP_SERVICE=admin` | `backend/configs/config.local.admin.yaml` |
| 未设置 `APP_SERVICE` | 兼容读取 `backend/configs/config.local.yaml` |

Admin API 只挂载后台和管理员登录相关接口，不挂载用户业务路由，不启动自动化 scheduler。

## 用户前端与后台前端 API 指向

用户前端：

```text
NEXT_PUBLIC_FRONTEND_ROLE=api
NEXT_PUBLIC_API_BASE_URL=http://localhost:10001/api/v1
```

后台前端：

```text
NEXT_PUBLIC_FRONTEND_ROLE=admin
NEXT_PUBLIC_API_BASE_URL=http://localhost:10002/api/v1
```

## 用户 API 当前主要路由

用户端 API 前缀：`http://localhost:10001/api/v1`

- Auth / User：`/auth/*`、`/users/me`
- Wallet：`/wallet/challenge`、`/wallet/bind`
- Accounts：`/accounts`、`/accounts/oauth/x/start`、`/accounts/oauth/x/callback`
- Dashboard：`/dashboard/overview`
- OAF Bot：`/oaf-bots`
- Automations：`/automations`、`/automations/:type/execution-mode`
- Auto Post：`/auto-post/plans`、`/auto-post/drafts`、`/auto-post/runs`
- Content Library：`/content-library/items`
- Auto Reply：`/auto-replies/drafts`
- Auto Comment：`/auto-comments/targets`、`/auto-comments/drafts`
- Auto DM：`/auto-dm/tasks`、`/auto-dm/recipients`、`/auto-dm/unsubscribe/:token`
- Execution Queue：`/review-queue`
- Publishing：`/publishing/status`、`/publishing/jobs`、`/publishing/jobs/:id/publish-now`
- Posts：`/posts`
- Activity：`/activities`
- Analytics：`/analytics/overview`
- Billing：`/billing/*`
- Public：`/public/site-links`

用户 API scheduler 当前负责：

- 邮箱验证码清理。
- 传统 scheduled posts。
- Auto Reply / Auto DM 既有调度。
- Auto Post Planner 到点生成。
- Publishing Pipeline simulated publish。

重要边界：scheduler 不会自动真实发布到 X。

## Admin API 当前主要路由

Admin API 前缀：`http://localhost:10002/api/v1`

- `POST /auth/email-code/send`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /users/me`
- `GET /admin/overview`
- `GET /admin/users`
- `PATCH /admin/users/:id`

## 路由隔离检查

用户 API 不暴露 Admin：

```bash
curl -i http://localhost:10001/api/v1/admin/overview
```

预期：`404`。

Admin API 未登录访问后台接口：

```bash
curl -i http://localhost:10002/api/v1/admin/overview
```

预期：`401`。

## 当前阶段手动验收重点

### OAF Bot

1. 登录用户端。
2. 绑定 X 账号。
3. 创建 OAF Bot，配置主要语言和语言策略。
4. 执行 test-generate。
5. 检查 Billing AI 用量 +1。
6. 检查 OAF Bot 本月 AI 用量分布出现 `test_generate`。

### Auto Post Planner

1. 打开 `/auto-post`。
2. 选择 X 账号。
3. 确认该账号有绑定 OAF Bot。
4. 新增 Content Library 素材。
5. 保存 Planner。
6. 点击“立即生成草稿”或“立即运行一次”。
7. 检查 AI 用量 +1。
8. 检查 Execution Queue 出现 `type=post`。

### Execution Queue / Publishing

1. 打开 `/execution-queue`。
2. 查找 post/comment/reply 内容。
3. review 模式内容应可批准/拒绝。
4. ready_to_publish 内容应关联 publish job。
5. `dry_run=true` 时按钮显示发布演练。
6. 未登录访问 `/publishing/status` 应返回 401。

本地不建议真实发布到 X。真实发布灰度以测试环境 Runbook 为准：

```text
docs/deployment/x-publisher-gray-release.md
```

## 常用构建检查

```bash
cd backend && go test ./...
cd backend && go build ./...
cd frontend && npm run lint
cd frontend && npm run build
```

## 常见问题

### 数据库连接失败

- 确认 MySQL 已启动。
- 确认 `octo_dev` 已创建。
- 检查 `backend/configs/config.local.api.yaml` 和 `config.local.admin.yaml` 的 MySQL DSN。

### X OAuth 失败

- callback URL 必须与 X Developer Portal 完全一致。
- 本地一般为：`http://localhost:10001/api/v1/accounts/oauth/x/callback`。
- 真实发布灰度要求 scope 包含 `tweet.write`。

### 邮件验证码无法真实发送

本地默认 `email.provider=local`，验证码会写入日志，通常不调用真实邮件服务。真实发信需配置 Resend。

### Publishing 状态不符合预期

检查 API YAML：

```yaml
x_publisher:
  real_publish_enabled: false
  manual_publish_enabled: true
  per_account_daily_limit: 1
  per_account_min_interval_seconds: 300
  dry_run: true
```

测试环境默认应保持 dry-run，不应默认真实发布。
