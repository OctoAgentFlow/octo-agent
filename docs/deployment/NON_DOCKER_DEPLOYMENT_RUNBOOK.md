# NON_DOCKER_DEPLOYMENT_RUNBOOK

## 目标

本文档描述 Octo-Agent 在测试服务器上的非 Docker 部署方案。方案以本地已经验收通过的四服务架构为准：

- `api`
- `admin-api`
- `api-front`
- `admin-front`

不使用 Docker，不修改 Docker 文件。后端和前端均由 `systemd` 托管，入口流量由 Nginx 反向代理。

## 架构边界

| 服务 | 进程类型 | 本机监听 | 对外入口 | 说明 |
| --- | --- | --- | --- | --- |
| `api` | Go/Gin | `127.0.0.1:11001` | 用户端域名 `/api/` | 用户业务 API，会启动 scheduler |
| `admin-api` | Go/Gin | `127.0.0.1:11002` | 后台域名 `/api/` | 后台 API，不启动 scheduler |
| `api-front` | Next.js | `127.0.0.1:4200` | 用户端域名 `/` | 用户前端，请求用户 API |
| `admin-front` | Next.js | `127.0.0.1:4201` | 后台域名 `/` | 后台前端，请求 Admin API |

证据：

- `Makefile`
- `frontend/package.json`
- `backend/cmd/api/main.go`
- `backend/cmd/admin/main.go`
- `backend/internal/router/router.go`
- `backend/configs/config.local.yaml`
- `../audits/SERVER_AUDIT.md`

## 测试服务器审计结论

基于 `../audits/SERVER_AUDIT.md`，测试服务器当前需要采用隔离端口组：

| 服务 | 测试环境端口 | 审计结论 |
| --- | --- | --- |
| `api-front` | `4200` | 推荐使用，当前未发现占用 |
| `admin-front` | `4201` | 推荐使用，当前未发现占用 |
| `api` | `11001` | 推荐使用，当前未发现占用 |
| `admin-api` | `11002` | 推荐使用，当前未发现占用 |

明确限制：

- 不要使用 `3000`，测试服务器上已被 `next-server` 占用。
- 不要使用 `4101`，测试服务器上已被 Vite preview 占用。
- 不 kill 任何已有进程。
- 不覆盖任何已有 Nginx 配置。
- 只新增独立的 Octo-Agent Nginx 配置文件，例如 `/etc/nginx/conf.d/octo-agent-test.conf`。
- 当前服务器 Go、Node.js、npm 版本低于项目建议，部署前需要升级运行时。

运行时升级要求：

| 运行时 | 当前审计版本 | 部署前要求 |
| --- | --- | --- |
| Go | `go1.22.2` | 需要升级，项目 `backend/go.mod` 要求 Go `1.25.0` |
| Node.js | `v18.19.1` | 需要升级到 `20+` |
| npm | `9.2.0` | 需要升级到 `10+` |

## 重要行为说明

### api 会启动 scheduler

`backend/cmd/api/main.go` 调用 `router.NewAPI(db, cfg)`。

`backend/internal/router/router.go` 的 `NewAPI` 会调用：

```go
jobs.Start(authService, postService, postRepo, autoReplyService, autoDMService)
```

因此 `api` 会启动：

- 邮箱验证码清理
- 定时发帖
- Auto Reply
- Auto DM

### admin-api 不启动 scheduler

`backend/cmd/admin/main.go` 调用 `router.NewAdmin(db, cfg)`。

`NewAdmin` 只挂载：

- `GET /health`
- `GET /admin/health`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/users/me`
- `GET /api/v1/admin/overview`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:id`

`NewAdmin` 不调用 `jobs.Start`，所以后台服务不会重复启动 scheduler。

## 推荐目录

测试服务器建议目录：

```text
/opt/octo-agent/
  runtime/
    go/
      current -> /opt/octo-agent/runtime/go/go1.25.0
    node/
      current -> /opt/octo-agent/runtime/node/node-v20.9.0-linux-x64
  current/
    backend/
      bin/
        octo-api
        octo-admin-api
      configs/
        config.test.api.yaml -> /etc/octo-agent/test/config.test.api.yaml
        config.test.admin.yaml -> /etc/octo-agent/test/config.test.admin.yaml
      logs/
    frontend/
      .next-api/
      .next-admin/
      node_modules/
      package.json
      next.config.ts

/etc/octo-agent/
  test/
    config.test.api.yaml
    config.test.admin.yaml
    backend.env
    api-front.env
    admin-front.env

/var/log/nginx/
  octo-api-front.access.log
  octo-api-front.error.log
  octo-admin-front.access.log
  octo-admin-front.error.log
```

说明：

- `backend/configs/config.test.api.yaml` 和 `backend/configs/config.test.admin.yaml` 分别承载用户 API 与 Admin API 配置。测试服务器上应使用服务器私有文件生成或覆盖，不要把真实密钥提交到 git。
- 部署时 `backend/configs/config.test.api.yaml` 应软链接到 `/etc/octo-agent/test/config.test.api.yaml`，`backend/configs/config.test.admin.yaml` 应软链接到 `/etc/octo-agent/test/config.test.admin.yaml`，保证仓库内模板和服务器私有配置分离。
- `backend.env` 目前主要用于 `APP_ENV`、`EMAIL_PROVIDER`、`RESEND_API_KEY`、`RESEND_FROM_EMAIL` 等可被当前代码读取的环境变量。
- MySQL DSN、X OAuth secret、Billing webhook secret 当前代码主要从 YAML 读取；部署时要用服务器私有 YAML，而不是提交真实值到仓库。
- systemd 必须通过 `PATH` 优先使用 `/opt/octo-agent/runtime/go/current/bin` 和 `/opt/octo-agent/runtime/node/current/bin`，不改变服务器系统默认 Go/Node/npm。

## `config.test.*.yaml` 端口示例

测试服务器用户 API 私有配置 `/etc/octo-agent/test/config.test.api.yaml` 应使用：

```yaml
api:
  host: "0.0.0.0"
  port: 11001
```

后台 Admin API 私有配置 `/etc/octo-agent/test/config.test.admin.yaml` 应使用：

```yaml
admin:
  host: "0.0.0.0"
  port: 11002
```

用户 API 配置还应包含：

```yaml
app:
  frontend_base_url: "https://test.octo-agent.com"

x_oauth:
  redirect_uri: "https://test.octo-agent.com/api/v1/accounts/oauth/x/callback"
```

说明：

- 上例只展示端口和公开 URL 形态。
- MySQL DSN、X OAuth secret、Billing webhook secret、RPC 私有 key 等必须保存在服务器私有配置中，不能提交到 git。

## 构建后端

在发布目录执行：

```bash
cd /opt/octo-agent/current/backend
go mod download
go build -o bin/octo-api ./cmd/api
go build -o bin/octo-admin-api ./cmd/admin
```

构建检查：

```bash
./bin/octo-api --help || true
./bin/octo-admin-api --help || true
```

Go 服务本身没有 CLI help，命令可能直接尝试启动；实际以 `go build` 成功和 systemd 启动检查为准。

## 构建前端

前端需要分别构建用户前端和后台前端。当前 `frontend/next.config.ts` 会根据 `NEXT_PUBLIC_FRONTEND_ROLE` 选择不同构建目录：

- `api` -> `.next-api`
- `admin` -> `.next-admin`

### api-front 构建

```bash
cd /opt/octo-agent/current/frontend
npm ci
NEXT_PUBLIC_FRONTEND_ROLE=api \
NEXT_PUBLIC_API_BASE_URL=https://test.octo-agent.com/api/v1 \
npm run build
```

### admin-front 构建

```bash
cd /opt/octo-agent/current/frontend
NEXT_PUBLIC_FRONTEND_ROLE=admin \
NEXT_PUBLIC_API_BASE_URL=https://testadmin.octo-agent.com/api/v1 \
npm run build
```

注意：

- `NEXT_PUBLIC_API_BASE_URL` 会进入前端构建产物。测试环境必须使用测试域名，不要使用本地 `localhost`。
- `frontend/package.json` 中的 `start:api-front`、`start:admin-front` 当前是本地开发脚本，内置了 localhost API 地址。服务器 systemd 推荐直接调用 `next start`，并通过 `EnvironmentFile` 注入环境变量。

## systemd 环境文件

### `/etc/octo-agent/test/backend.env`

```ini
APP_ENV=test
# octo-api.service uses APP_SERVICE=api
# octo-admin-api.service uses APP_SERVICE=admin
EMAIL_PROVIDER=local
# 测试真实邮件时再启用：
# EMAIL_PROVIDER=resend
# RESEND_API_KEY=<set-on-server-only>
# RESEND_FROM_EMAIL=Octo Agent <no-reply@mail.octo-agent.com>
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

## systemd 服务

### `octo-api.service`

文件路径：

```text
/etc/systemd/system/octo-api.service
```

内容：

```ini
[Unit]
Description=Octo Agent API
After=network.target

[Service]
Type=simple
User=octo
Group=octo
WorkingDirectory=/opt/octo-agent/current/backend
EnvironmentFile=/etc/octo-agent/test/backend.env
Environment=APP_SERVICE=api
Environment=PATH=/opt/octo-agent/runtime/go/current/bin:/opt/octo-agent/runtime/node/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/octo-agent/current/backend/bin/octo-api
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

端口：

- `11001`

应用日志：

- `/opt/octo-agent/current/backend/logs/api.log`

systemd 日志：

```bash
journalctl -u octo-api -f
```

健康检查：

```bash
curl -i http://127.0.0.1:11001/health
```

### `octo-admin-api.service`

文件路径：

```text
/etc/systemd/system/octo-admin-api.service
```

内容：

```ini
[Unit]
Description=Octo Agent Admin API
After=network.target

[Service]
Type=simple
User=octo
Group=octo
WorkingDirectory=/opt/octo-agent/current/backend
EnvironmentFile=/etc/octo-agent/test/backend.env
Environment=APP_SERVICE=admin
Environment=PATH=/opt/octo-agent/runtime/go/current/bin:/opt/octo-agent/runtime/node/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/octo-agent/current/backend/bin/octo-admin-api
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

端口：

- `11002`

应用日志：

- `/opt/octo-agent/current/backend/logs/admin.log`

systemd 日志：

```bash
journalctl -u octo-admin-api -f
```

健康检查：

```bash
curl -i http://127.0.0.1:11002/health
curl -i http://127.0.0.1:11002/admin/health
```

### `octo-api-front.service`

文件路径：

```text
/etc/systemd/system/octo-api-front.service
```

内容：

```ini
[Unit]
Description=Octo Agent API Front
After=network.target octo-api.service

[Service]
Type=simple
User=octo
Group=octo
WorkingDirectory=/opt/octo-agent/current/frontend
EnvironmentFile=/etc/octo-agent/test/api-front.env
Environment=PATH=/opt/octo-agent/runtime/node/current/bin:/opt/octo-agent/runtime/go/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/octo-agent/current/frontend/node_modules/.bin/next start -p 4200
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

端口：

- `4200`

日志：

```bash
journalctl -u octo-api-front -f
```

健康检查：

```bash
curl -I http://127.0.0.1:4200
```

### `octo-admin-front.service`

文件路径：

```text
/etc/systemd/system/octo-admin-front.service
```

内容：

```ini
[Unit]
Description=Octo Agent Admin Front
After=network.target octo-admin-api.service

[Service]
Type=simple
User=octo
Group=octo
WorkingDirectory=/opt/octo-agent/current/frontend
EnvironmentFile=/etc/octo-agent/test/admin-front.env
Environment=PATH=/opt/octo-agent/runtime/node/current/bin:/opt/octo-agent/runtime/go/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/octo-agent/current/frontend/node_modules/.bin/next start -p 4201
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

端口：

- `4201`

日志：

```bash
journalctl -u octo-admin-front -f
```

健康检查：

```bash
curl -I http://127.0.0.1:4201
curl -I http://127.0.0.1:4201/admin
```

## 启动 systemd 服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable octo-api octo-admin-api octo-api-front octo-admin-front
sudo systemctl start octo-api
sudo systemctl start octo-admin-api
sudo systemctl start octo-api-front
sudo systemctl start octo-admin-front
```

查看状态：

```bash
systemctl status octo-api --no-pager
systemctl status octo-admin-api --no-pager
systemctl status octo-api-front --no-pager
systemctl status octo-admin-front --no-pager
```

重启：

```bash
sudo systemctl restart octo-api
sudo systemctl restart octo-admin-api
sudo systemctl restart octo-api-front
sudo systemctl restart octo-admin-front
```

## Nginx 反向代理

推荐测试服务器使用两个域名：

- 用户端：`test.octo-agent.com`
- 后台端：`testadmin.octo-agent.com`

这样用户端和后台端都可以使用同域 `/api/v1`，避免浏览器跨域复杂度。

### 用户端 Nginx server

```nginx
server {
    listen 80;
    server_name test.octo-agent.com;

    access_log /var/log/nginx/octo-api-front.access.log;
    error_log  /var/log/nginx/octo-api-front.error.log;

    location /api/ {
        proxy_pass http://127.0.0.1:11001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:4200;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 后台端 Nginx server

```nginx
server {
    listen 80;
    server_name testadmin.octo-agent.com;

    access_log /var/log/nginx/octo-admin-front.access.log;
    error_log  /var/log/nginx/octo-admin-front.error.log;

    location /api/ {
        proxy_pass http://127.0.0.1:11002/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:4201;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

检查 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Nginx 外部健康检查

```bash
curl -i http://test.octo-agent.com/api/v1/dashboard/overview
curl -i http://testadmin.octo-agent.com/api/v1/admin/overview
curl -I http://test.octo-agent.com
curl -I http://testadmin.octo-agent.com
```

预期：

- 未登录访问用户业务接口返回 `401`，说明代理到 `api`。
- 未登录访问后台接口返回 `401`，说明代理到 `admin-api`。
- 两个前端域名均可返回页面响应。

## 路由隔离检查

```bash
curl -i http://test.octo-agent.com/api/v1/admin/overview
curl -i http://testadmin.octo-agent.com/api/v1/auth/email-code/send
```

预期：

- 用户端域名的 Admin API 返回 `404`。
- 后台端域名的用户验证码接口返回 `404`。

## 测试服务器部署步骤

0. 安装 Octo-Agent 独立运行时：

```bash
bash scripts/install-runtime-test.sh
```

该步骤只安装到 `/opt/octo-agent/runtime`，不覆盖系统默认 Go/Node/npm。

1. 创建系统用户：

```bash
sudo useradd --system --create-home --home-dir /opt/octo-agent --shell /usr/sbin/nologin octo
```

2. 准备目录：

```bash
sudo mkdir -p /opt/octo-agent/current
sudo mkdir -p /etc/octo-agent/test
sudo chown -R octo:octo /opt/octo-agent
```

3. 拉取或发布代码到 `/opt/octo-agent/current`。

4. 准备服务器私有配置：

```bash
/etc/octo-agent/test/config.test.api.yaml
/etc/octo-agent/test/config.test.admin.yaml
/etc/octo-agent/test/backend.env
/etc/octo-agent/test/api-front.env
/etc/octo-agent/test/admin-front.env
```

部署脚本会把 `/opt/octo-agent/current/backend/configs/config.test.api.yaml` 指向 `/etc/octo-agent/test/config.test.api.yaml` 的软链接，并把 `/opt/octo-agent/current/backend/configs/config.test.admin.yaml` 指向 `/etc/octo-agent/test/config.test.admin.yaml` 的软链接。

5. 构建后端：

```bash
cd /opt/octo-agent/current/backend
go mod download
go build -o bin/octo-api ./cmd/api
go build -o bin/octo-admin-api ./cmd/admin
```

6. 构建前端：

```bash
cd /opt/octo-agent/current/frontend
npm ci
NEXT_PUBLIC_FRONTEND_ROLE=api NEXT_PUBLIC_API_BASE_URL=https://test.octo-agent.com/api/v1 npm run build
NEXT_PUBLIC_FRONTEND_ROLE=admin NEXT_PUBLIC_API_BASE_URL=https://testadmin.octo-agent.com/api/v1 npm run build
```

7. 安装 Octo-Agent 独立 systemd unit，不修改已有服务。

8. 新增 Octo-Agent 独立 Nginx 配置文件并 reload，不覆盖已有 Nginx 配置。

9. 按顺序启动四服务。

10. 执行健康检查和路由隔离检查。

也可以使用仓库内测试部署脚本串联上述步骤：

```bash
bash scripts/deploy-test-non-docker.sh
```

回滚上一版发布：

```bash
bash scripts/rollback-test-non-docker.sh
```

## 本次生成的部署资产

| 文件 | 用途 |
| --- | --- |
| `RUNTIME_INSTALL_RUNBOOK.md` | 独立 Go/Node/npm 安装说明 |
| `scripts/install-runtime-test.sh` | 安装 Octo-Agent 测试环境专用 runtime |
| `scripts/deploy-test-non-docker.sh` | 测试环境非 Docker 部署脚本 |
| `scripts/rollback-test-non-docker.sh` | 测试环境回滚脚本 |
| `deploy/systemd/octo-api.service` | 用户 API systemd unit |
| `deploy/systemd/octo-admin-api.service` | Admin API systemd unit |
| `deploy/systemd/octo-api-front.service` | 用户前端 systemd unit |
| `deploy/systemd/octo-admin-front.service` | 后台前端 systemd unit |
| `deploy/nginx/octo-test.conf` | 独立 Nginx 测试环境配置 |

## 不能提交到 git 的配置

以下配置只能存在于服务器私有文件、CI/CD secret 或系统环境中：

- MySQL / RDS DSN、账号、密码
- Resend API Key
- SES Access Key / Secret Access Key
- X OAuth `client_secret`
- X OAuth `state_secret`
- Billing `webhook_secret`
- EVM RPC 私有 API Key
- 收款钱包私钥
- 任何 `.env` 文件
- 任何包含真实生产域名密钥组合的临时配置文件

当前代码可通过环境变量覆盖：

- `APP_ENV`
- `EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `NEXT_PUBLIC_FRONTEND_ROLE`
- `NEXT_PUBLIC_API_BASE_URL`

当前代码主要从 YAML 读取，部署时必须使用服务器私有 YAML 或发布时模板渲染：

- `mysql.data_source`
- `x_oauth.client_id`
- `x_oauth.client_secret`
- `x_oauth.redirect_uri`
- `x_oauth.state_secret`
- `billing.webhook_secret`
- `billing.rpc_urls`
- `billing.payment_methods`

## 测试服务器部署前 checklist

- [ ] 已确认测试服务器不使用 Docker。
- [ ] 已安装 Go 1.25+。
- [ ] 已安装 Node.js 20+ 和 npm 10+。
- [ ] 已确认 Go 安装在 `/opt/octo-agent/runtime/go`，不覆盖系统默认 Go。
- [ ] 已确认 Node.js/npm 安装在 `/opt/octo-agent/runtime/node`，不覆盖系统默认 Node/npm。
- [ ] 已安装 Nginx。
- [ ] 已确认不使用 `3000`，因为测试服务器已被已有 `next-server` 占用。
- [ ] 已确认不使用 `4101`，因为测试服务器已被已有 Vite preview 占用。
- [ ] 已确认不 kill 任何已有进程。
- [ ] 已确认不覆盖任何已有 Nginx 配置。
- [ ] 已确认只新增独立 Octo-Agent Nginx 配置文件。
- [ ] 已创建 `octo` 系统用户。
- [ ] 已准备 `/opt/octo-agent/current` 发布目录。
- [ ] 已准备 `/etc/octo-agent/test/*.env`。
- [ ] 已准备服务器私有 `/etc/octo-agent/test/config.test.api.yaml`。
- [ ] 已准备服务器私有 `/etc/octo-agent/test/config.test.admin.yaml`。
- [ ] 已确认 `/opt/octo-agent/current/backend/configs/config.test.api.yaml` 软链接到 `/etc/octo-agent/test/config.test.api.yaml`。
- [ ] 已确认 `/opt/octo-agent/current/backend/configs/config.test.admin.yaml` 软链接到 `/etc/octo-agent/test/config.test.admin.yaml`。
- [ ] `config.test.api.yaml` 中 `api.port=11001`。
- [ ] `config.test.admin.yaml` 中 `admin.port=11002`。
- [ ] 两个测试配置中的 MySQL DSN 均可连接测试库。
- [ ] `config.test.api.yaml` 中 `app.frontend_base_url` 指向用户端测试域名。
- [ ] `config.test.api.yaml` 中 X OAuth callback 与 Nginx 用户端 API 域名一致。
- [ ] `api-front` 构建时 `NEXT_PUBLIC_API_BASE_URL` 指向用户端 `/api/v1`。
- [ ] `admin-front` 构建时 `NEXT_PUBLIC_API_BASE_URL` 指向后台端 `/api/v1`。
- [ ] 已确认 `api` 服务会启动 scheduler。
- [ ] 已确认 `admin-api` 服务不会启动 scheduler。
- [ ] 已执行 `go test ./...`。
- [ ] 已执行 `go build ./...` 或分别构建两个后端二进制。
- [ ] 已执行两次前端 build，分别生成 `.next-api` 和 `.next-admin`。
- [ ] 已安装 systemd unit。
- [ ] 已执行 `systemctl daemon-reload`。
- [ ] 已执行 `nginx -t`。
- [ ] 已完成 health check。
- [ ] 已完成 API 路由隔离检查。
