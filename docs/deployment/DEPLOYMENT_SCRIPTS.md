# Script Deployment Runbook

当前项目部署方式以 `scripts/` 下的脚本为准，参考 `diamond-swap` 的服务拆分方式：每个服务一个部署脚本，`deploy-all-*.sh` 串行编排四个服务。

本阶段不使用 Docker、Docker Compose、systemd 或项目内 Nginx 模板。Nginx 可在服务器上按实际域名单独维护，仓库内不再保留旧模板，避免和当前脚本部署方式混淆。

## 服务与端口

| 环境 | 服务 | 脚本 | 默认端口 | 说明 |
| --- | --- | --- | --- | --- |
| test | API | `scripts/deploy-backend-api-test.sh` | `11001` | `APP_ENV=test APP_SERVICE=api`，读取 `backend/configs/config.test.api.yaml` |
| test | Admin API | `scripts/deploy-backend-admin-test.sh` | `11002` | `APP_ENV=test APP_SERVICE=admin`，读取 `backend/configs/config.test.admin.yaml` |
| test | API Front | `scripts/deploy-api-front-test.sh` | `4200` | 请求 `https://test.octo-agent.com/api/v1` |
| test | Admin Front | `scripts/deploy-admin-front-test.sh` | `4201` | 请求 `https://testadmin.octo-agent.com/api/v1` |
| prod | API | `scripts/deploy-backend-api-prod.sh` | `12001` | `APP_ENV=prod APP_SERVICE=api`，读取 `backend/configs/config.prod.api.yaml` |
| prod | Admin API | `scripts/deploy-backend-admin-prod.sh` | `12002` | `APP_ENV=prod APP_SERVICE=admin`，读取 `backend/configs/config.prod.admin.yaml` |
| prod | API Front | `scripts/deploy-api-front-prod.sh` | `4300` | 默认请求 `https://octo-agent.com/api/v1` |
| prod | Admin Front | `scripts/deploy-admin-front-prod.sh` | `4301` | 默认请求 `https://admin.octo-agent.com/api/v1` |

生产环境域名和端口目前是预配置值，正式部署前如果服务器规划不同，需要同时调整：

- `scripts/deploy-*-prod.sh`
- `backend/configs/config.prod.api.yaml`
- `backend/configs/config.prod.admin.yaml`
- Nginx 服务器配置

## 部署命令

测试环境：

```bash
./scripts/deploy-all-test.sh
```

生产环境：

```bash
./scripts/deploy-all-prod.sh
```

单服务部署：

```bash
./scripts/deploy-backend-api-test.sh
./scripts/deploy-backend-admin-test.sh
./scripts/deploy-api-front-test.sh
./scripts/deploy-admin-front-test.sh
```

## 日志与 PID

脚本运行后会在项目根目录生成运行时文件：

- 部署日志：`logs/deploy/*.log`
- 服务 PID：`logs/pid/*.pid`

`logs/` 已加入 `.gitignore`，不要提交运行时日志和 PID 文件。

## 进程保护规则

脚本默认只停止 PID 文件中记录的旧服务进程。

如果目标端口已被其他进程占用，脚本会失败并输出占用 PID，不会默认 kill 未知进程。确认该端口上的进程就是旧的同服务进程后，可以显式执行：

```bash
ALLOW_KILL_PORT=1 ./scripts/deploy-backend-api-test.sh
```

## 生产配置 TODO

生产配置文件已拆分为：

- `backend/configs/config.prod.api.yaml`
- `backend/configs/config.prod.admin.yaml`

正式部署前必须替换以下占位符：

- `TODO_MYSQL_USER`
- `TODO_MYSQL_PASSWORD`
- `TODO_MYSQL_HOST`
- `TODO_X_CLIENT_ID`
- `TODO_X_CLIENT_SECRET`
- `TODO_X_STATE_SECRET`
- `TODO_BILLING_WEBHOOK_SECRET`
- `TODO_BSC_RPC_URL`
- `TODO_PROD_RECEIVER_ADDRESS`

Resend API Key 不写入 YAML，建议放在 `backend/configs/.env` 或服务器环境变量中：

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=<your_resend_api_key>
RESEND_FROM_EMAIL="Octo Agent <no-reply@mail.octo-agent.com>"
```

## 运行时要求

- Go 1.25+
- Node.js 20+
- npm 10+
- MySQL 8+

脚本不会安装运行时，也不会改系统默认 Go / Node / npm。
