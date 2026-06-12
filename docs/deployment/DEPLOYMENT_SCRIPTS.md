# Script Deployment Runbook

当前项目部署方式以 `scripts/` 下的脚本为准。新 prod 服务器推荐使用轻量部署脚本：本地构建 Go/Next.js，上传 runtime artifact 到 t3.micro 后只做解包、依赖安装和进程切换。完整流程见 [prod-lite-deployment.md](./prod-lite-deployment.md)。

旧部署脚本参考 `diamond-swap` 的服务拆分方式：每个服务一个部署脚本，`deploy-all-*.sh` 串行编排四个服务。

Test 环境服务器已释放。所有 `*-test.sh` 部署脚本和 `https://test*.octo-agent.com` 路径均已废弃，仅保留为历史引用；当前服务器部署请使用 prod 脚本。

本阶段不使用 Docker、Docker Compose、systemd 或项目内 Nginx 模板。Nginx 可在服务器上按实际域名单独维护，仓库内不再保留旧模板，避免和当前脚本部署方式混淆。

## 服务与端口

| 环境 | 服务 | 脚本 | 默认端口 | 说明 |
| --- | --- | --- | --- | --- |
| test | API | `scripts/deploy-backend-api-test.sh` | `11001` | Deprecated; test server released, script exits without deploying |
| test | Admin API | `scripts/deploy-backend-admin-test.sh` | `11002` | Deprecated; test server released, script exits without deploying |
| test | API Front | `scripts/deploy-api-front-test.sh` | `4200` | Deprecated; test server released, script exits without deploying |
| test | Admin Front | `scripts/deploy-admin-front-test.sh` | `4201` | Deprecated; test server released, script exits without deploying |
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

测试环境（已废弃，会直接退出）：

```bash
./scripts/deploy-all-test.sh
```

生产环境：

```bash
./scripts/deploy-all-prod.sh
```

当前新 prod 轻量部署：

```bash
./scripts/prod-lite-build-upload.sh <your-server-ip>
./scripts/prod-lite-health-check.sh <your-server-ip>
```

`prod-lite-build-upload.sh` packages the current commit, activates it on the server, and the remote activator removes old release directories and upload archives after health checks pass. Default retention is 3 releases; set `PROD_LITE_KEEP_RELEASES=5` when you want extra rollback points.

当前单服务部署：

```bash
./scripts/deploy-backend-api-prod.sh
./scripts/deploy-backend-admin-prod.sh
./scripts/deploy-api-front-prod.sh
./scripts/deploy-admin-front-prod.sh
```

测试服务器常用流程（已废弃）：

```bash
cd /home/ubuntu/octo/octo-agent
git checkout test
git pull --ff-only origin test
bash scripts/deploy-backend-api-test.sh
bash scripts/deploy-api-front-test.sh
```

如果改动涉及 Admin API 或后台前端，旧 test 部署也已废弃：

```bash
bash scripts/deploy-backend-admin-test.sh
bash scripts/deploy-admin-front-test.sh
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
ALLOW_KILL_PORT=1 ./scripts/deploy-backend-api-prod.sh
```

## 生产配置 TODO

生产配置文件已拆分为：

- `backend/configs/config.prod.api.yaml`
- `backend/configs/config.prod.admin.yaml`

正式部署前必须替换以下占位符：

- `TODO_MYSQL_USER`
- `TODO_MYSQL_PASSWORD`
- `TODO_MYSQL_HOST`
- `TODO_PROD_JWT_SECRET`
- `TODO_X_CLIENT_ID`
- `TODO_X_CLIENT_SECRET`
- `TODO_X_STATE_SECRET`
- `TODO_BILLING_WEBHOOK_SECRET`
- `TODO_BSC_RPC_URL`
- `TODO_PROD_RECEIVER_ADDRESS`

## X Publisher 灰度配置

旧测试环境默认配置（已废弃）：

```yaml
x_publisher:
  real_publish_enabled: false
  manual_publish_enabled: true
  per_account_daily_limit: 1
  per_account_min_interval_seconds: 300
  dry_run: true
```

这表示：

- Execution Queue 可以展示人工发布入口。
- `publish-now` 只能执行发布演练，不会真实发 X。
- scheduler 只执行 simulated publish，不会自动真实发布。

单账号真实发布灰度时，才临时把 API 私有配置改为：

```yaml
x_publisher:
  real_publish_enabled: true
  manual_publish_enabled: true
  per_account_daily_limit: 1
  per_account_min_interval_seconds: 300
  dry_run: false
```

完成灰度后必须恢复 `dry_run=true` 或 `real_publish_enabled=false`。完整流程见 [x-publisher-gray-release.md](./x-publisher-gray-release.md)。

部署后检查：

```bash
curl -fsS http://127.0.0.1:11001/health
curl -sS -o /dev/null -w "%{http_code}" https://test.octo-agent.com/api/v1/publishing/status
curl -sS -X POST -o /dev/null -w "%{http_code}" https://test.octo-agent.com/api/v1/publishing/jobs/1/publish-now
```

未登录访问 publishing 接口应返回 `401`。

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
