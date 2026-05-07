# API 文档索引

所有 HTTP API 均挂在 **`/api/v1`** 下（健康检查除外：`GET /health`）。统一响应形如 `{ "code", "message", "data" }`（见各子文档）。

| 文档 | 说明 |
| --- | --- |
| [auth.md](./auth.md) | 注册/登录/刷新、`/users/me`、钱包 challenge/bind/unbind |
| [account.md](./account.md) | X 账号列表、OAuth 起止、解绑 |
| [dashboard.md](./dashboard.md) | Dashboard 概览 |
| [automation.md](./automation.md) | 自动化模块配置、`runtime-status`（DB 真实统计）、Auto Post/Reply 调度说明 |
| [activity.md](./activity.md) | 活动日志分页列表（含 reply 扩展字段） |
| [analytics.md](./analytics.md) | 分析概览（7/30 日活动、自动化拆分、内容状态统计） |
| [billing.md](./billing.md) | 订阅/套餐/支付方式（YAML）、下单与订单查询、BEP20 Webhook |
| [post.md](./post.md) | 帖子 CRUD（真实持久化） |
| [agent.md](./agent.md) | Agent 兼容列表（读取自动化配置的真实状态） |

环境与 OAuth、邮件：见 [deployment/env.md](../deployment/env.md)。
