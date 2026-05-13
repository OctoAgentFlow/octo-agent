# CONFIG_SPLIT_AUDIT

## 审计范围

本次只做 APP_SERVICE 配置拆分专项审计，未修改代码，未执行部署，未连接服务器。

审计文件：

- `backend/internal/config/config.go`
- `Makefile`
- `deploy/systemd/octo-api.service`
- `deploy/systemd/octo-admin-api.service`
- `deploy/systemd/octo-api-front.service`
- `deploy/systemd/octo-admin-front.service`
- `scripts/deploy-test-non-docker.sh`
- `backend/configs/config.test.api.yaml`
- `backend/configs/config.test.admin.yaml`
- `frontend/package.json`
- `docs/deployment/ENVIRONMENT_MATRIX.md`
- `docs/deployment/NON_DOCKER_DEPLOYMENT_RUNBOOK.md`

## 总体结论

APP_SERVICE 配置拆分链路可用，可以继续测试服部署。

不需要先修复配置拆分问题。建议后续增加二进制与 APP_SERVICE 的防误启动校验，但这不是当前部署链路的阻塞项。

## 1. 配置加载规则

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| `APP_ENV + APP_SERVICE` 加载规则是否正确 | 通过 | `config.Load()` 读取 `APP_ENV`，再读取 `APP_SERVICE` 并调用 `configFilePath(env, service)`。 |
| `APP_SERVICE=api` 是否加载 `config.{env}.api.yaml` | 通过 | `normalizeConfigService("api") -> "api"`，`configFilePath("test", "api") -> configs/config.test.api.yaml`。 |
| `APP_SERVICE=admin` 是否加载 `config.{env}.admin.yaml` | 通过 | `normalizeConfigService("admin") -> "admin"`；`admin-api` 也会被规范化为 `admin`。 |
| 不设置 `APP_SERVICE` 是否兼容旧配置 | 通过 | `normalizeConfigService("") -> ""`，`configFilePath("test", "") -> configs/config.test.yaml`。 |
| 文件不存在时错误是否清晰 | 通过 | 未设置 service 时错误包含 `APP_ENV` 和路径；设置 service 时错误包含 `APP_ENV`、`APP_SERVICE` 和路径。 |
| 不支持的 APP_SERVICE 是否清晰报错 | 通过 | 返回 `unsupported APP_SERVICE=..., expected api or admin`。 |

审计结论：加载规则符合预期。

## 2. Makefile

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| `make api-local` 是否设置 `APP_SERVICE=api` | 通过 | `cd backend && APP_ENV=local APP_SERVICE=api go run ./cmd/api`。 |
| `make admin-api-local` 是否设置 `APP_SERVICE=admin` | 通过 | `cd backend && APP_ENV=local APP_SERVICE=admin go run ./cmd/admin`。 |
| 是否仍使用正确端口 | 通过 | 本地拆分配置中 `config.local.api.yaml` 为 `10001`，`config.local.admin.yaml` 为 `10002`。 |

审计结论：本地四服务启动链路已切到拆分配置。

## 3. systemd

| 服务 | APP_SERVICE | 结论 |
| --- | --- | --- |
| `octo-api.service` | `api` | 通过 |
| `octo-admin-api.service` | `admin` | 通过 |
| `octo-api-front.service` | 未设置 | 通过，前端服务不需要 APP_SERVICE |
| `octo-admin-front.service` | 未设置 | 通过，前端服务不需要 APP_SERVICE |

四个 service 均仍通过 `PATH` 使用 `/opt/octo-agent/runtime` 下的独立 Go/Node。

## 4. deploy-test-non-docker.sh

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 是否检查 `/etc/octo-agent/test/config.test.api.yaml` | 通过 | `require_file "${PRIVATE_DIR}/config.test.api.yaml"`。 |
| 是否检查 `/etc/octo-agent/test/config.test.admin.yaml` | 通过 | `require_file "${PRIVATE_DIR}/config.test.admin.yaml"`。 |
| 是否分别软链接到 release 内 api/admin 配置 | 通过 | 分别链接到 `backend/configs/config.test.api.yaml` 和 `backend/configs/config.test.admin.yaml`。 |
| 是否不再错误依赖 `config.test.yaml` | 通过 | 脚本未再引用 `config.test.yaml`。 |
| 是否不会覆盖已有 Nginx 配置 | 通过 | `/etc/nginx/conf.d/octo-agent-test.conf` 已存在且内容不同时直接退出。 |
| 是否仍使用 `4200/4201/11001/11002` | 通过 | 默认端口为 `API_FRONT_PORT=4200`、`ADMIN_FRONT_PORT=4201`、`API_PORT=11001`、`ADMIN_API_PORT=11002`。 |
| 是否仍使用测试域名 | 通过 | 默认域名为 `test.octo-agent.com`、`testadmin.octo-agent.com`。 |
| 是否仍有 health check 和路由隔离检查 | 通过 | 内部 health、外部 Nginx health、用户/后台 API 路由隔离均存在。 |

审计结论：部署脚本已正确切到拆分配置。

## 5. config.test.api.yaml

| 检查项 | 结论 |
| --- | --- |
| `api.port` 是否为 `11001` | 通过 |
| 是否包含用户 API 需要的配置 | 通过，包含 MySQL、log、email、app、x_oauth、billing |
| 是否包含 admin-only 配置 | 未包含 `admin` 块，符合拆分目标 |
| 是否使用测试库名 | 通过，DSN 指向 `octo_test` 占位 |
| 是否写死生产 secret | 未发现，敏感项为 TODO |

注意：如果误用 `APP_SERVICE=api` 启动 admin 二进制，`admin.port` 会走默认值 `8081`。当前 systemd 和 Makefile 不存在这种误用，但建议后续在 `cmd/api` / `cmd/admin` 增加服务类型校验，降低人工误操作风险。

## 6. config.test.admin.yaml

| 检查项 | 结论 |
| --- | --- |
| `admin.port` 是否为 `11002` | 通过 |
| 是否包含 Admin API 需要的配置 | 通过，包含 MySQL、log、email，以及 Admin Overview 展示所需的 app/x_oauth/billing 摘要配置 |
| 是否不会启动 scheduler | 通过，scheduler 由 `router.NewAPI()` 调用 `jobs.Start()`，Admin 入口调用 `router.NewAdmin()`，不调用 `jobs.Start()` |
| 是否使用测试库名 | 通过，DSN 指向 `octo_test` 占位 |
| 是否写死生产 secret | 未发现，敏感项为 TODO |

说明：`config.test.admin.yaml` 仍保留 `app/x_oauth/billing`，这是因为 Admin Overview 会展示配置健康摘要，包括邮件、X OAuth、Billing、FrontendBaseURL 等状态。它不是启动 scheduler 的触发条件。

## 7. 前端 env

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| api-front 是否请求用户 API | 通过 | 部署脚本和文档均设置 `NEXT_PUBLIC_API_BASE_URL=https://test.octo-agent.com/api/v1`。 |
| admin-front 是否请求 Admin API | 通过 | 部署脚本和文档均设置 `NEXT_PUBLIC_API_BASE_URL=https://testadmin.octo-agent.com/api/v1`。 |
| 本地前端脚本是否仍正确 | 通过 | `frontend/package.json` 中用户前端指向 `localhost:10001`，后台前端指向 `localhost:10002`。 |

## 风险与建议

### P2：建议增加二进制与 APP_SERVICE 防误启动校验

当前配置加载层允许任意二进制读取任意 service 配置。例如人工执行：

```bash
APP_ENV=test APP_SERVICE=api ./octo-admin-api
```

这种情况下 admin 二进制会加载 API 配置，因 `admin.port` 不存在而使用默认 `8081`。当前正式部署文件不会这样做，所以不阻塞测试服部署。

建议后续增强：

- `cmd/api` 启动时要求 `APP_SERVICE` 为空或 `api`。
- `cmd/admin` 启动时要求 `APP_SERVICE` 为空或 `admin`。
- 或在 `config.Load()` 返回配置来源，启动日志打印实际加载的配置文件。

## 最终判断

可以继续测试服部署。

不需要先修复配置拆分问题。
