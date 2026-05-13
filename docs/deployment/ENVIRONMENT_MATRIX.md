# ENVIRONMENT_MATRIX

## 目标

本文档列出 Octo-Agent 的 `local`、`test`、`prod` 三套环境矩阵。矩阵以当前四服务架构为准：

- `api`
- `admin-api`
- `api-front`
- `admin-front`

本文件只描述配置，不修改业务代码，不修改 Docker 文件。

## 四服务固定约定

| 服务 | local 端口 | test 端口 | prod 端口 | 启动入口 |
| --- | --- | --- | --- | --- |
| `api` | `10001` | `11001` | `10001` | `backend/cmd/api/main.go` |
| `admin-api` | `10002` | `11002` | `10002` | `backend/cmd/admin/main.go` |
| `api-front` | `3000` | `4200` | `3000` | Next.js |
| `admin-front` | `3001` | `4201` | `3001` | Next.js |

行为约定：

- `api` 启动 scheduler。
- `admin-api` 不启动 scheduler。
- `api-front` 请求用户 API。
- `admin-front` 请求 Admin API。

## 测试服务器审计约束

基于 `../audits/SERVER_AUDIT.md`，测试环境需要和本地默认端口区分：

- `3000` 已被测试服务器已有 `next-server` 占用，测试环境不要使用。
- `4101` 已被测试服务器已有 Vite preview 占用，测试环境不要使用。
- 测试环境采用 `api-front=4200`、`admin-front=4201`、`api=11001`、`admin-api=11002`。
- 不 kill 任何已有进程。
- 不覆盖任何已有 Nginx 配置。
- 只新增独立 Octo-Agent Nginx 配置文件。

测试服务器运行时升级要求：

| 运行时 | 当前审计版本 | 测试部署前要求 |
| --- | --- | --- |
| Go | `go1.22.2` | 使用 Octo-Agent 独立 Go `1.25+`，不覆盖系统默认 Go |
| Node.js | `v18.19.1` | 使用 Octo-Agent 独立 Node.js `20.9+`，不覆盖系统默认 Node |
| npm | `9.2.0` | 使用 Octo-Agent 独立 npm `10+`，不覆盖系统默认 npm |

## 环境文件来源

### 后端

后端通过 `APP_ENV` + `APP_SERVICE` 选择 YAML。未设置 `APP_SERVICE` 时保持兼容，继续读取旧的 `config.<env>.yaml`：

| APP_ENV | APP_SERVICE | YAML |
| --- | --- | --- |
| `local` | 空 | `backend/configs/config.local.yaml` |
| `local` | `api` | `backend/configs/config.local.api.yaml` |
| `local` | `admin` | `backend/configs/config.local.admin.yaml` |
| `test` | 空 | `backend/configs/config.test.yaml` |
| `test` | `api` | `backend/configs/config.test.api.yaml` |
| `test` | `admin` | `backend/configs/config.test.admin.yaml` |
| `prod` | 空 | `backend/configs/config.prod.yaml` |

证据：`backend/internal/config/config.go`。

### 前端

前端通过构建/启动时环境变量区分角色：

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_FRONTEND_ROLE=api` | 用户前端 |
| `NEXT_PUBLIC_FRONTEND_ROLE=admin` | 后台前端 |
| `NEXT_PUBLIC_API_BASE_URL` | 浏览器实际请求的 API base URL |

证据：

- `frontend/package.json`
- `frontend/src/lib/request.ts`
- `frontend/src/lib/frontend-role.ts`
- `frontend/next.config.ts`

## local 环境矩阵

### local 服务地址

| 服务 | URL |
| --- | --- |
| `api-front` | `http://localhost:3000` |
| `admin-front` | `http://localhost:3001` |
| `api` | `http://localhost:10001` |
| `admin-api` | `http://localhost:10002` |

### local 后端环境变量

| 变量 | 推荐值 | 是否可提交 | 说明 |
| --- | --- | --- | --- |
| `APP_ENV` | `local` | 可以 | 选择 local 环境 |
| `APP_SERVICE` | `api` 或 `admin` | 可以 | 分别选择 `config.local.api.yaml` / `config.local.admin.yaml` |
| `EMAIL_PROVIDER` | 空或 `local` | 可以 | 空值时本地默认 local |
| `RESEND_API_KEY` | 空 | 不可提交真实值 | 本地默认不需要 |
| `RESEND_FROM_EMAIL` | 空或测试发件人 | 不可提交真实敏感组合 | 本地默认可用 YAML 值 |

### local 前端环境变量

| 服务 | 变量 | 推荐值 |
| --- | --- | --- |
| `api-front` | `NEXT_PUBLIC_FRONTEND_ROLE` | `api` |
| `api-front` | `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:10001/api/v1` |
| `admin-front` | `NEXT_PUBLIC_FRONTEND_ROLE` | `admin` |
| `admin-front` | `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:10002/api/v1` |

### local YAML 配置

| 配置 | 推荐值/说明 | 是否可提交 |
| --- | --- | --- |
| `api.host` | `0.0.0.0` | 可以 |
| `api.port` | `10001` | 可以 |
| `admin.host` | `0.0.0.0` | 可以 |
| `admin.port` | `10002` | 可以 |
| `mysql.data_source` | 本机 MySQL DSN | 不应提交真实个人密码 |
| `email.provider` | `local` | 可以 |
| `email.local.expose_code` | `true` | 仅 local/test 可以 |
| `app.frontend_base_url` | `http://localhost:3000` | 可以 |
| `x_oauth.*` | 本地 OAuth 测试配置 | 不可提交真实 secret |
| `billing.webhook_secret` | 本地测试值 | 不可复用到 test/prod |
| `billing.rpc_urls` | 可公开 RPC 或测试 RPC | 私有 key 不可提交 |
| `billing.payment_methods` | 本地测试收款地址 | 生产地址不可混用 |

## test 环境矩阵

### test 推荐域名

| 服务 | 推荐域名/URL |
| --- | --- |
| `api-front` | `https://test.octo-agent.com` |
| `admin-front` | `https://testadmin.octo-agent.com` |
| `api` | `https://test.octo-agent.com/api/v1` |
| `admin-api` | `https://testadmin.octo-agent.com/api/v1` |

说明：

- Nginx 将 `https://test.octo-agent.com/` 代理到 `127.0.0.1:4200`。
- Nginx 将 `https://test.octo-agent.com/api/` 代理到 `127.0.0.1:11001/api/`。
- Nginx 将 `https://testadmin.octo-agent.com/` 代理到 `127.0.0.1:4201`。
- Nginx 将 `https://testadmin.octo-agent.com/api/` 代理到 `127.0.0.1:11002/api/`。

### test 后端环境变量

| 变量 | 推荐值 | 是否可提交 | 说明 |
| --- | --- | --- | --- |
| `APP_ENV` | `test` | 可以 | 选择 test 环境 |
| `APP_SERVICE` | `api` 或 `admin` | 可以 | 分别选择 `config.test.api.yaml` / `config.test.admin.yaml` |
| `EMAIL_PROVIDER` | `local` 或 `resend` | 可以 | 测试真实邮件时改为 resend |
| `RESEND_API_KEY` | 服务器私有值 | 不可提交 | 仅 provider=resend 时需要 |
| `RESEND_FROM_EMAIL` | 测试已验证发件人 | 不可提交敏感组合 | 必须来自 Resend 已验证域名 |

### test 前端环境变量

| 服务 | 变量 | 推荐值 | 是否可提交 |
| --- | --- | --- | --- |
| `api-front` | `NODE_ENV` | `production` | 可以 |
| `api-front` | `NEXT_PUBLIC_FRONTEND_ROLE` | `api` | 可以 |
| `api-front` | `NEXT_PUBLIC_API_BASE_URL` | `https://test.octo-agent.com/api/v1` | 可以，按实际域名调整 |
| `admin-front` | `NODE_ENV` | `production` | 可以 |
| `admin-front` | `NEXT_PUBLIC_FRONTEND_ROLE` | `admin` | 可以 |
| `admin-front` | `NEXT_PUBLIC_API_BASE_URL` | `https://testadmin.octo-agent.com/api/v1` | 可以，按实际域名调整 |

### test YAML 配置

| 配置 | 推荐值/说明 | 是否可提交 |
| --- | --- | --- |
| `api.host` | `0.0.0.0` 或 `127.0.0.1` | 可以 |
| `api.port` | `11001` | 可以 |
| `admin.host` | `0.0.0.0` 或 `127.0.0.1` | 可以 |
| `admin.port` | `11002` | 可以 |
| `mysql.data_source` | 测试库 DSN | 不可提交真实账号密码 |
| `email.provider` | `local` 或 `resend` | 可以 |
| `email.local.expose_code` | `true` 仅限内部测试 | 可以，但生产必须 false |
| `email.resend.api_key` | 空，改用环境变量 | 不可提交真实值 |
| `app.frontend_base_url` | `https://test.octo-agent.com` | 可以 |
| `x_oauth.client_id` | 测试 OAuth Client ID | 可提交前需确认是否敏感，建议不提交 |
| `x_oauth.client_secret` | 测试 OAuth Secret | 不可提交 |
| `x_oauth.redirect_uri` | `https://test.octo-agent.com/api/v1/accounts/oauth/x/callback` | 可以 |
| `x_oauth.state_secret` | 测试随机长字符串 | 不可提交 |
| `billing.webhook_secret` | 测试 webhook secret | 不可提交 |
| `billing.rpc_urls` | 测试 RPC URL | 私有 key 不可提交 |
| `billing.payment_methods.receiver_address` | 测试收款地址 | 不建议提交真实地址 |

`config.test.api.yaml` 端口示例：

```yaml
api:
  host: "0.0.0.0"
  port: 11001
```

`config.test.admin.yaml` 端口示例：

```yaml
admin:
  host: "0.0.0.0"
  port: 11002
```

用户 API 配置还需要：

```yaml
app:
  frontend_base_url: "https://test.octo-agent.com"

x_oauth:
  redirect_uri: "https://test.octo-agent.com/api/v1/accounts/oauth/x/callback"
```

## prod 环境矩阵

### prod 推荐域名

| 服务 | 推荐域名/URL |
| --- | --- |
| `api-front` | `https://app.example.com` |
| `admin-front` | `https://admin.example.com` |
| `api` | `https://app.example.com/api/v1` |
| `admin-api` | `https://admin.example.com/api/v1` |

### prod 后端环境变量

| 变量 | 推荐值 | 是否可提交 | 说明 |
| --- | --- | --- | --- |
| `APP_ENV` | `prod` | 可以 | 选择 prod 环境 |
| `APP_SERVICE` | 空，或部署前补齐 `api/admin` 拆分配置后设置 | 可以 | 当前保留 `config.prod.yaml` 兼容路径 |
| `EMAIL_PROVIDER` | `resend` | 可以 | 生产推荐 Resend |
| `RESEND_API_KEY` | 生产私有值 | 不可提交 | 必须来自 secret 管理 |
| `RESEND_FROM_EMAIL` | 生产已验证发件人 | 不可提交敏感组合 | 必须来自已验证域名 |

### prod 前端环境变量

| 服务 | 变量 | 推荐值 | 是否可提交 |
| --- | --- | --- | --- |
| `api-front` | `NODE_ENV` | `production` | 可以 |
| `api-front` | `NEXT_PUBLIC_FRONTEND_ROLE` | `api` | 可以 |
| `api-front` | `NEXT_PUBLIC_API_BASE_URL` | `https://app.example.com/api/v1` | 可以，按实际域名调整 |
| `admin-front` | `NODE_ENV` | `production` | 可以 |
| `admin-front` | `NEXT_PUBLIC_FRONTEND_ROLE` | `admin` | 可以 |
| `admin-front` | `NEXT_PUBLIC_API_BASE_URL` | `https://admin.example.com/api/v1` | 可以，按实际域名调整 |

### prod YAML 配置

| 配置 | 推荐值/说明 | 是否可提交 |
| --- | --- | --- |
| `api.host` | `0.0.0.0` 或 `127.0.0.1` | 可以 |
| `api.port` | `10001` | 可以 |
| `admin.host` | `0.0.0.0` 或 `127.0.0.1` | 可以 |
| `admin.port` | `10002` | 可以 |
| `mysql.data_source` | 生产库 DSN | 不可提交 |
| `email.provider` | `resend` | 可以 |
| `email.local.expose_code` | `false` | 可以 |
| `email.resend.api_key` | 空，改用环境变量 | 不可提交真实值 |
| `app.frontend_base_url` | `https://app.example.com` | 可以 |
| `x_oauth.client_id` | 生产 OAuth Client ID | 建议不提交 |
| `x_oauth.client_secret` | 生产 OAuth Secret | 不可提交 |
| `x_oauth.redirect_uri` | `https://app.example.com/api/v1/accounts/oauth/x/callback` | 可以 |
| `x_oauth.state_secret` | 生产随机长字符串 | 不可提交 |
| `billing.webhook_secret` | 生产 webhook secret | 不可提交 |
| `billing.rpc_urls` | 生产 RPC URL | 私有 key 不可提交 |
| `billing.payment_methods.token_address` | 生产 USDT token 地址 | 可以，但上线前必须复核 |
| `billing.payment_methods.receiver_address` | 生产收款地址 | 建议服务器私有配置，至少上线前双人复核 |

## systemd EnvironmentFile 矩阵

### `/etc/octo-agent/local/backend.env`

```ini
APP_ENV=local
# Local Makefile targets set APP_SERVICE=api or APP_SERVICE=admin.
EMAIL_PROVIDER=local
```

### `/etc/octo-agent/test/backend.env`

```ini
APP_ENV=test
# octo-api.service uses APP_SERVICE=api
# octo-admin-api.service uses APP_SERVICE=admin
EMAIL_PROVIDER=local
# EMAIL_PROVIDER=resend
# RESEND_API_KEY=<server-only>
# RESEND_FROM_EMAIL=Octo Agent <no-reply@mail.octo-agent.com>
```

### `/etc/octo-agent/prod/backend.env`

```ini
APP_ENV=prod
EMAIL_PROVIDER=resend
RESEND_API_KEY=<server-only>
RESEND_FROM_EMAIL=Octo Agent <no-reply@mail.octo-agent.com>
```

### `/etc/octo-agent/test/api-front.env`

```ini
NODE_ENV=production
NEXT_PUBLIC_FRONTEND_ROLE=api
NEXT_PUBLIC_API_BASE_URL=https://test.octo-agent.com/api/v1
```

### `/etc/octo-agent/test/admin-front.env`

```ini
NODE_ENV=production
NEXT_PUBLIC_FRONTEND_ROLE=admin
NEXT_PUBLIC_API_BASE_URL=https://testadmin.octo-agent.com/api/v1
```

### `/etc/octo-agent/prod/api-front.env`

```ini
NODE_ENV=production
NEXT_PUBLIC_FRONTEND_ROLE=api
NEXT_PUBLIC_API_BASE_URL=https://app.example.com/api/v1
```

### `/etc/octo-agent/prod/admin-front.env`

```ini
NODE_ENV=production
NEXT_PUBLIC_FRONTEND_ROLE=admin
NEXT_PUBLIC_API_BASE_URL=https://admin.example.com/api/v1
```

## Git 提交安全规则

不能提交：

- `.env`
- `backend/configs/.env`
- 包含真实 MySQL/RDS 密码的 YAML
- 包含真实 Resend API key 的 YAML 或 env 文件
- 包含真实 AWS key 的 YAML 或 env 文件
- 包含真实 X OAuth secret 的 YAML 或 env 文件
- 包含真实 Billing webhook secret 的 YAML 或 env 文件
- 包含私有 RPC key 的 URL
- 包含私钥、助记词、seed phrase 的任何文件
- 生产收款钱包私钥

可以提交：

- 端口号
- 非敏感域名模板
- 空字符串占位符
- TODO 注释
- 本地开发说明
- systemd unit 模板
- Nginx 模板

需要谨慎提交：

- OAuth Client ID
- 生产 token 合约地址
- 生产收款地址
- 真实域名

## 当前代码的配置限制

当前 `backend/internal/config/config.go` 支持通过环境变量覆盖：

- `EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

但以下配置当前主要来自 YAML：

- MySQL DSN
- X OAuth client secret
- X OAuth state secret
- Billing webhook secret
- Billing RPC URL
- Billing payment methods

因此非 Docker 部署时必须保证服务器上的 `config.test.api.yaml` / `config.test.admin.yaml` / `config.prod.yaml` 是服务器私有配置，或者在发布流程中由安全模板渲染生成。

## 测试服务器部署前 checklist

- [ ] 已确认测试服务器使用非 Docker 部署。
- [ ] 已确认测试服务器使用 Octo-Agent 独立 Go 1.25+、Node.js 20.9+、npm 10+。
- [ ] 已确认不覆盖服务器系统默认 Go/Node/npm。
- [ ] 已确认四服务端口：`11001`、`11002`、`4200`、`4201`。
- [ ] 已确认测试环境不使用 `3000`，因为测试服务器已被已有 `next-server` 占用。
- [ ] 已确认测试环境不使用 `4101`，因为测试服务器已被已有 Vite preview 占用。
- [ ] 已确认不 kill 任何已有进程。
- [ ] 已确认不覆盖任何已有 Nginx 配置。
- [ ] 已确认只新增独立 Octo-Agent Nginx 配置文件。
- [ ] 已确认 Nginx 代理用户域名 `/` 到 `4200`。
- [ ] 已确认 Nginx 代理用户域名 `/api/` 到 `11001`。
- [ ] 已确认 Nginx 代理后台域名 `/` 到 `4201`。
- [ ] 已确认 Nginx 代理后台域名 `/api/` 到 `11002`。
- [ ] 已确认 `api-front` 的 `NEXT_PUBLIC_API_BASE_URL` 指向用户域名 `/api/v1`。
- [ ] 已确认 `admin-front` 的 `NEXT_PUBLIC_API_BASE_URL` 指向后台域名 `/api/v1`。
- [ ] 已确认 X OAuth callback 为 `https://test.octo-agent.com/api/v1/accounts/oauth/x/callback`。
- [ ] 已确认 `APP_ENV=test`。
- [ ] 已确认 `octo-api.service` 设置 `APP_SERVICE=api`。
- [ ] 已确认 `octo-admin-api.service` 设置 `APP_SERVICE=admin`。
- [ ] 已准备服务器私有 `config.test.api.yaml`。
- [ ] 已准备服务器私有 `config.test.admin.yaml`。
- [ ] 已确认测试库 DSN 不提交到 git。
- [ ] 已确认 Resend API key 不提交到 git。
- [ ] 已确认 X OAuth secret 不提交到 git。
- [ ] 已确认 Billing webhook secret 不提交到 git。
- [ ] 已确认 RPC 私有 key 不提交到 git。
- [ ] 已确认 `api` 服务启动 scheduler。
- [ ] 已确认 `admin-api` 服务不启动 scheduler。
- [ ] 已完成 `go test ./...`。
- [ ] 已完成后端二进制构建。
- [ ] 已分别构建 `.next-api` 与 `.next-admin`。
- [ ] 已安装并启用四个 systemd 服务。
- [ ] 已执行 `nginx -t`。
- [ ] 已执行内部 health check。
- [ ] 已执行 Nginx 外部代理检查。
- [ ] 已执行 API 路由隔离检查。
