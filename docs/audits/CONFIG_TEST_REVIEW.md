# CONFIG_TEST_REVIEW

Deprecated: test environment servers have been released. This audit is retained as historical context for the old `config.test*.yaml` split; do not use these paths for current server deployment.

本文档是当前测试环境配置结构审计说明。为避免泄露敏感信息，本文只记录字段结构、用途和安全结论，不记录真实 secret。

## 配置拆分

当前后端配置按 `APP_ENV + APP_SERVICE` 拆分：

| 服务 | 测试配置 |
| --- | --- |
| 用户 API | `backend/configs/config.test.api.yaml` |
| Admin API | `backend/configs/config.test.admin.yaml` |
| 兼容旧配置 | `backend/configs/config.test.yaml` |

用户 API 启动 scheduler，Admin API 不启动 scheduler。

## 必要配置块

用户 API 配置应包含：

- `api`
- `mysql`
- `log`
- `jwt`
- `email`
- `app`
- `x_oauth`
- `x_publisher`
- `llm`
- `billing`
- `site_links`

Admin API 配置应包含：

- `admin`
- `mysql`
- `log`
- `jwt`
- `email`
- `admin_auth`

## 当前测试环境关键规则

### JWT

- `config.test.api.yaml` 与 `config.test.admin.yaml` 必须使用稳定 secret。
- API 与 Admin API 的 JWT secret 应保持一致，避免服务重启后用户被迫重新登录。
- 非 local 环境如果 secret 为空，应启动失败，不应生成随机 secret。

### X OAuth

测试环境 callback：

```text
https://test.octo-agent.com/api/v1/accounts/oauth/x/callback
```

scope 至少应包含：

```text
tweet.read tweet.write users.read offline.access
```

如需 Auto DM 真实发送，还需要 X App 和用户授权包含 DM 相关 scope。

### X Publisher

测试环境默认安全配置：

```yaml
x_publisher:
  real_publish_enabled: false
  manual_publish_enabled: true
  per_account_daily_limit: 1
  per_account_min_interval_seconds: 300
  dry_run: true
```

结论：

- 默认不会真实调用 X API。
- scheduler 不会自动真实发布。
- 用户手动发布入口最多执行 dry-run。
- 单账号真实发布灰度必须按 `docs/deployment/x-publisher-gray-release.md` 执行，并在完成后恢复 dry-run。

### LLM

- `llm.default_provider` 当前用于 OAF Bot test-generate、Auto Post、Auto Reply、Auto Comment。
- API key 不应写入公开文档。
- 如果 provider 未配置，接口应明确返回错误或 fallback 来源，避免测试误判。

### Billing

- 测试环境不能使用生产库。
- 链上 RPC、收款地址、webhook secret 均属于敏感配置。
- Billing 仍使用套餐级 AI 生成总额度，不存在 scene 独立额度。

## 结论

当前结构满足测试环境继续开发和调试：

- API/Admin 配置拆分清晰。
- 用户 API 与 Admin API 职责隔离。
- Publishing Pipeline 默认安全，不会自动真实发布。
- 真实发布灰度有独立 Runbook。

后续如果引入新的外部服务或 secret，应同步更新：

- `backend/internal/config/config.go`
- `backend/configs/config.*.api.yaml`
- `backend/configs/config.*.admin.yaml`
- `docs/deployment/env.md`
- 本审计文档
