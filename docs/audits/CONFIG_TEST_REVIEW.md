# CONFIG_TEST_REVIEW

## 审计范围

本次只检查配置文件和配置结构，未修改业务代码。

审计文件：

- `backend/configs/config.test.yaml`
- `backend/configs/config.test.api.yaml`
- `backend/configs/config.test.admin.yaml`
- `backend/internal/config/config.go`

## 总体结论

`backend/configs/config.test.api.yaml` 与 `backend/configs/config.test.admin.yaml` 均与 `backend/internal/config/config.go` 的 `Config` 结构匹配，可以被当前配置加载逻辑正确读取。

`backend/configs/config.test.yaml` 保留为未设置 `APP_SERVICE` 时的兼容配置；新部署链路应使用 `APP_SERVICE=api/admin` 的拆分配置。

测试环境关键配置结论：

| 检查项 | 结论 |
| --- | --- |
| YAML 是否可解析 | 通过 |
| 顶层字段是否匹配 `Config` | 通过 |
| `api.port` 是否为 `11001` | 通过 |
| `admin.port` 是否为 `11002` | 通过 |
| 用户端测试域名是否为 `test.octo-agent.com` | 通过 |
| 后台端测试域名是否为 `testadmin.octo-agent.com` | 当前后端 Config 无对应字段；由后台前端环境变量和 Nginx 配置承载 |
| 是否误用生产域名 | 未发现活动配置误用 |
| 是否误用生产数据库 | 未发现活动配置误用；DSN 指向 `octo_test` 占位 |
| 是否误用生产 secret | 未发现活动配置误用；敏感项均为 TODO 占位 |

## 结构匹配检查

`Config` 顶层结构来自 `backend/internal/config/config.go`：

| Config 字段 | YAML tag | `config.test.yaml` 状态 |
| --- | --- | --- |
| `API ServerConfig` | `api` | 已配置 |
| `Admin ServerConfig` | `admin` | 已配置 |
| `MySQL MySQLConfig` | `mysql` | 已配置 |
| `Log LogConfig` | `log` | 已配置 |
| `Email EmailConfig` | `email` | 已配置 |
| `App AppConfig` | `app` | 已配置 |
| `XOAuth XOAuthConfig` | `x_oauth` | 已配置 |
| `Billing BillingConfig` | `billing` | 已配置 |

`config.test.yaml` 顶层键为：

```text
api, admin, mysql, log, email, app, x_oauth, billing
```

结论：顶层字段完全匹配当前 `Config` struct。

## 子字段检查

### api / admin

| 字段 | 当前值 | 结构来源 | 结论 |
| --- | --- | --- | --- |
| `api.host` | `0.0.0.0` | `ServerConfig.host` | 可读取 |
| `api.port` | `11001` | `ServerConfig.port` | 可读取，符合测试端口 |
| `admin.host` | `0.0.0.0` | `ServerConfig.host` | 可读取 |
| `admin.port` | `11002` | `ServerConfig.port` | 可读取，符合测试端口 |

### mysql

| 字段 | 当前值/状态 | 结构来源 | 结论 |
| --- | --- | --- | --- |
| `mysql.data_source` | `TODO_MYSQL_USER:TODO_MYSQL_PASSWORD@tcp(TODO_MYSQL_HOST:3306)/octo_test...` | `MySQLConfig.data_source` | 可读取，指向测试库名 `octo_test` |
| `mysql.max_idle_conns` | `10` | `MySQLConfig.max_idle_conns` | 可读取 |
| `mysql.max_open_conns` | `100` | `MySQLConfig.max_open_conns` | 可读取 |
| `mysql.max_lifetime` | `3600` | `MySQLConfig.max_lifetime` | 可读取 |
| `mysql.max_idletime` | `1800` | `MySQLConfig.max_idletime` | 可读取 |

未发现活动配置使用 `octo_prod`。文件注释中出现 `octo_prod` 是警告说明，不是实际 DSN。

### log

| 字段 | 结构来源 | 结论 |
| --- | --- | --- |
| `level` | `LogConfig.level` | 可读取 |
| `encoding` | `LogConfig.encoding` | 可读取 |
| `api_output_path` | `LogConfig.api_output_path` | 可读取 |
| `admin_output_path` | `LogConfig.admin_output_path` | 可读取 |
| `max_size` | `LogConfig.max_size` | 可读取 |
| `max_backups` | `LogConfig.max_backups` | 可读取 |
| `max_age` | `LogConfig.max_age` | 可读取 |
| `compress` | `LogConfig.compress` | 可读取 |

### email

| 字段 | 当前值/状态 | 结构来源 | 结论 |
| --- | --- | --- | --- |
| `email.provider` | `local` | `EmailConfig.provider` | 可读取，符合测试要求 |
| `email.local.expose_code` | `true` | `LocalConfig.expose_code` | 可读取，符合测试要求 |
| `email.resend.api_key` | 空字符串 | `ResendConfig.api_key` | 可读取，未写死密钥 |
| `email.resend.from_email` | `Octo Agent <no-reply@mail.octo-agent.com>` | `ResendConfig.from_email` | 可读取，非密钥 |
| `email.ses.*` | 空 key + 默认区域/发件人 | `SESConfig` | 可读取，未写死 AWS key |

### app / x_oauth

| 字段 | 当前值 | 结构来源 | 结论 |
| --- | --- | --- | --- |
| `app.frontend_base_url` | `https://test.octo-agent.com` | `AppConfig.frontend_base_url` | 可读取，符合用户端测试域名 |
| `x_oauth.client_id` | `TODO_X_CLIENT_ID` | `XOAuthConfig.client_id` | 可读取，待替换 |
| `x_oauth.client_secret` | `TODO_X_CLIENT_SECRET` | `XOAuthConfig.client_secret` | 可读取，未写死真实 secret |
| `x_oauth.redirect_uri` | `https://test.octo-agent.com/api/v1/accounts/oauth/x/callback` | `XOAuthConfig.redirect_uri` | 可读取，符合测试回调域名 |
| `x_oauth.state_secret` | `TODO_X_STATE_SECRET` | `XOAuthConfig.state_secret` | 可读取，未写死真实 secret |

说明：当前 `Config` 结构没有后台前端域名字段，因此 `testadmin.octo-agent.com` 不应出现在 `config.test.yaml` 中。后台域名应由后台前端环境变量和 Nginx 配置承载。

### billing

| 字段 | 当前值/状态 | 结构来源 | 结论 |
| --- | --- | --- | --- |
| `billing.order_ttl_minutes` | `30` | `BillingConfig.order_ttl_minutes` | 可读取 |
| `billing.webhook_secret` | `TODO_BILLING_WEBHOOK_SECRET` | `BillingConfig.webhook_secret` | 可读取，未写死真实 secret |
| `billing.rpc_urls."56"` | `TODO_BSC_RPC_URL` | `BillingConfig.rpc_urls` | 可读取，待替换 |
| `billing.payment_methods[].method` | `USDT` | `PaymentMethodConfig.method` | 可读取 |
| `billing.payment_methods[].network` | `BEP20` | `PaymentMethodConfig.network` | 可读取 |
| `billing.payment_methods[].chain_id` | `56` | `PaymentMethodConfig.chain_id` | 可读取 |
| `billing.payment_methods[].token_address` | `0x11F5...ECF2` | `PaymentMethodConfig.token_address` | 可读取 |
| `billing.payment_methods[].receiver_address` | `TODO_TEST_RECEIVER_ADDRESS` | `PaymentMethodConfig.receiver_address` | 可读取，未写死真实收款地址 |
| `billing.payment_methods[].decimals` | `18` | `PaymentMethodConfig.decimals` | 可读取 |
| `billing.payment_methods[].is_default` | `true` | `PaymentMethodConfig.is_default` | 可读取 |
| `billing.payment_methods[].note` | 中文说明 | `PaymentMethodConfig.note` | 可读取 |
| `billing.plans.basic_monthly.*` | 已配置 | `BillingPlanEntry` | 可读取 |

## 生产误用检查

未发现活动配置误用以下内容：

- 生产域名：未出现 `app.example.com`、`admin.example.com`、`your-frontend.example.com`、`your-api.example.com` 作为活动值。
- 生产数据库：活动 DSN 使用 `octo_test`，未使用 `octo_prod`。
- 生产 secret：X OAuth、Billing webhook、BSC RPC、收款地址均为 TODO 占位。
- 生产 Resend/AWS key：Resend API key、SES access key、SES secret access key 均为空。

注意：

- 文件注释中出现 `production` 和 `octo_prod` 是安全警告说明，不是活动配置值。
- `email.resend.from_email` 使用 `mail.octo-agent.com` 发件人格式，但当前 `email.provider=local`，且该字段不是 secret。

## 待手动替换项

部署到测试服务器前，以下 TODO 必须替换为测试环境私有值：

- `TODO_MYSQL_USER`
- `TODO_MYSQL_PASSWORD`
- `TODO_MYSQL_HOST`
- `TODO_X_CLIENT_ID`
- `TODO_X_CLIENT_SECRET`
- `TODO_X_STATE_SECRET`
- `TODO_BILLING_WEBHOOK_SECRET`
- `TODO_BSC_RPC_URL`
- `TODO_TEST_RECEIVER_ADDRESS`

## 最终判断

`backend/configs/config.test.api.yaml` 和 `backend/configs/config.test.admin.yaml` 当前结构与 `backend/internal/config/config.go` 匹配，可以被 `Config` 正确读取。

它已经满足测试服务器部署的结构、端口、用户端域名和安全占位要求；但在真实启动测试环境后端前，必须先将 MySQL 相关 TODO 替换为可连接 `octo_test` 的测试库账号信息。
