# APP_SERVICE 配置拆分后本地四服务验收结果

> 历史快照：本文档记录 APP_SERVICE 配置拆分后的本地四服务验收结果，保留用于追溯，不代表当前 OAF Bot / Auto Post Planner / Publishing Pipeline 阶段的最新验收清单。继续开发请优先参考 `CURRENT_ACCEPTANCE_CHECKLIST.md`。

验收时间：2026-05-13 15:51 Asia/Shanghai

结论：通过。四个本地服务均可启动，`APP_SERVICE=api` / `APP_SERVICE=admin` 的配置拆分链路生效，Health Check、API 路由隔离、用户端最小业务回归、后台登录与用户管理回归均通过。

## 验收范围

- 不开发新功能。
- 使用新的启动方式：
  - `make api-local`
  - `make admin-api-local`
  - `make api-front-local`
  - `make admin-front-local`
- 验证用户 API 实际走 `config.local.api.yaml`。
- 验证 Admin API 实际走 `config.local.admin.yaml`。
- 执行 Health Check、路由隔离、最小业务回归。

## 启动结果

| 服务 | 启动命令 | 实际监听 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 用户 API | `make api-local` | `http://localhost:10001` | 通过 | `<repo>/Makefile:20` 设置 `APP_ENV=local APP_SERVICE=api`；进程命令为 `cd backend && APP_ENV=local APP_SERVICE=api go run ./cmd/api`；`<repo>/backend/configs/config.local.api.yaml:1` 配置 `api.port: 10001` |
| Admin API | `make admin-api-local` | `http://localhost:10002` | 通过 | `<repo>/Makefile:23` 设置 `APP_ENV=local APP_SERVICE=admin`；进程命令为 `cd backend && APP_ENV=local APP_SERVICE=admin go run ./cmd/admin`；`<repo>/backend/configs/config.local.admin.yaml:1` 配置 `admin.port: 10002` |
| 用户前端 | `make api-front-local` | `http://localhost:3000` | 通过 | 进程命令为 `next dev -p 3000`，访问 `/` 返回 200 |
| 后台前端 | `make admin-front-local` | `http://localhost:3001` | 通过 | 进程命令为 `next dev -p 3001`，访问 `/` 返回 307，符合后台入口重定向行为 |

配置拆分加载规则证据：`<repo>/backend/internal/config/config.go:270` 中 `configFilePath(env, service)` 会在 `APP_SERVICE=api` 时加载 `configs/config.local.api.yaml`，在 `APP_SERVICE=admin` 时加载 `configs/config.local.admin.yaml`。

观察项：`<repo>/backend/internal/config/config.go:146` 会读取 `configs/.env`，并在 `<repo>/backend/internal/config/config.go:227` 开始用环境变量覆盖邮箱配置。本次本地环境存在 `EMAIL_PROVIDER=resend`，所以邮箱发送链路实际使用 Resend；接口仍返回验证码，原因是 YAML 中保留了 `email.local.expose_code: true`。

## Health Check

| 检查项 | URL | 期望 | 实际 | 结果 |
| --- | --- | --- | --- | --- |
| 用户 API health | `GET http://localhost:10001/health` | 200 | 200 | 通过 |
| Admin API health | `GET http://localhost:10002/health` | 200 | 200 | 通过 |
| Admin 专用 health | `GET http://localhost:10002/admin/health` | 200 | 200 | 通过 |

日志摘要：
- 用户 API 日志 `<repo>/backend/logs/api.log` 记录 `/health` 返回 200。
- Admin API 日志 `<repo>/backend/logs/admin.log` 记录 `/health` 和 `/admin/health` 返回 200。

## API 路由隔离

| 检查项 | 请求 URL | 期望 | 实际 | 结果 |
| --- | --- | --- | --- | --- |
| 用户 API 不暴露 Admin overview | `GET http://localhost:10001/api/v1/admin/overview` | 404 | 404 | 通过 |
| Admin API overview 未登录 | `GET http://localhost:10002/api/v1/admin/overview` | 401 | 401 | 通过 |
| Admin API 不暴露用户验证码发送接口 | `POST http://localhost:10002/api/v1/auth/email-code/send` | 404 | 404 | 通过 |

## 最小业务回归

本次创建了本地验收账号：

- 主验收账号：`split-20260513155129@example.com`，用户 ID `7`
- 被后台管理账号：`split-target-20260513155129@example.com`，用户 ID `8`
- 本地测试 X 账号 ID：`3`
- 本地测试订单 ID：`9`

为满足现有业务规则，本次在本地 `octo_dev` 中补充了测试数据：将主验收账号设为 `owner` 并插入一个 connected X 账号。未修改业务代码。

| 模块 | 操作 | 请求 URL | 实际状态 | 结果 |
| --- | --- | --- | --- | --- |
| Auth | 发送主账号验证码 | `POST http://localhost:10001/api/v1/auth/email-code/send` | 200 | 通过 |
| Auth | 注册主账号 | `POST http://localhost:10001/api/v1/auth/register` | 200 | 通过 |
| Auth | 用户端登录 | `POST http://localhost:10001/api/v1/auth/login` | 200 | 通过 |
| Auth | 发送被管理账号验证码 | `POST http://localhost:10001/api/v1/auth/email-code/send` | 200 | 通过 |
| Auth | 注册被管理账号 | `POST http://localhost:10001/api/v1/auth/register` | 200 | 通过 |
| Dashboard | 用户 Dashboard 概览 | `GET http://localhost:10001/api/v1/dashboard/overview` | 200 | 通过 |
| Posts | Posts 列表 | `GET http://localhost:10001/api/v1/posts?page=1&page_size=10` | 200 | 通过 |
| Posts | 创建草稿 Post | `POST http://localhost:10001/api/v1/posts` | 200 | 通过 |
| Posts | Post 详情 | `GET http://localhost:10001/api/v1/posts/5` | 200 | 通过 |
| Posts | 更新 Post | `PUT http://localhost:10001/api/v1/posts/5` | 200 | 通过 |
| Posts | 删除 Post | `DELETE http://localhost:10001/api/v1/posts/5` | 200 | 通过 |
| Automations | 配置列表 | `GET http://localhost:10001/api/v1/automations` | 200 | 通过 |
| Automations | 更新 Auto Post 配置 | `PUT http://localhost:10001/api/v1/automations/post` | 200 | 通过 |
| Automations | 关闭 Auto Post | `POST http://localhost:10001/api/v1/automations/post/toggle` | 200 | 通过 |
| Automations | 开启 Auto Post | `POST http://localhost:10001/api/v1/automations/post/toggle` | 200 | 通过 |
| Automations | 执行器运行状态 | `GET http://localhost:10001/api/v1/automations/runtime-status` | 200 | 通过 |
| Billing | 当前订阅 | `GET http://localhost:10001/api/v1/billing/subscription` | 200 | 通过 |
| Billing | 套餐列表 | `GET http://localhost:10001/api/v1/billing/plans` | 200 | 通过 |
| Billing | 支付方式 | `GET http://localhost:10001/api/v1/billing/payment-methods` | 200 | 通过 |
| Billing | 创建订单 | `POST http://localhost:10001/api/v1/billing/orders` | 200 | 通过 |
| Billing | 订单详情 | `GET http://localhost:10001/api/v1/billing/orders/9` | 200 | 通过 |
| Billing | 订单列表 | `GET http://localhost:10001/api/v1/billing/orders?limit=10` | 200 | 通过 |
| Admin | 后台登录 owner 账号 | `POST http://localhost:10002/api/v1/auth/login` | 200 | 通过 |
| Admin | 后台当前用户 | `GET http://localhost:10002/api/v1/users/me` | 200 | 通过 |
| Admin | 后台概览 | `GET http://localhost:10002/api/v1/admin/overview` | 200 | 通过 |
| Admin | 用户列表搜索 | `GET http://localhost:10002/api/v1/admin/users?page=1&page_size=20&query=split-target-20260513155129@example.com` | 200 | 通过 |
| Admin | 停用用户 | `PATCH http://localhost:10002/api/v1/admin/users/8` | 200 | 通过 |
| Admin | 调整用户角色 | `PATCH http://localhost:10002/api/v1/admin/users/8` | 200 | 通过 |
| Admin | 恢复用户 | `PATCH http://localhost:10002/api/v1/admin/users/8` | 200 | 通过 |

## 失败项

无。32 个接口验收记录全部通过。

## 外部依赖观察

- X OAuth / X API 真实联调不在本次验收范围内。用户 API 日志中存在 scheduler 访问 X API 超时记录，来源是既有本地测试账号的自动回复任务，不影响本次 APP_SERVICE 配置拆分验收结论。
- 本地 `.env` 覆盖了邮箱 provider，本次验证码发送实际触发 Resend。若后续希望纯本地验收，应临时移除或调整本机私有 `.env` 中的邮箱覆盖项。

## 结论

- 本地四服务启动链路通过。
- `api-local` 已按 `APP_SERVICE=api` 走用户 API 配置文件，监听 10001。
- `admin-api-local` 已按 `APP_SERVICE=admin` 走后台 API 配置文件，监听 10002。
- 用户 API 与 Admin API 的路由隔离通过。
- 用户端核心 MVP 回归通过。
- 后台登录与用户管理回归通过。
