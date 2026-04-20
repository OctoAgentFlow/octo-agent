# API 文档索引

所有 HTTP API 均挂在 **`/api/v1`** 下（健康检查除外：`GET /health`）。统一响应形如 `{ "code", "message", "data" }`（见各子文档）。

| 文档 | 说明 |
| --- | --- |
| [auth.md](./auth.md) | 注册/登录/刷新、`/users/me`、钱包 challenge/bind/unbind |
| [account.md](./account.md) | X 账号列表、OAuth 起止、解绑 |
| [dashboard.md](./dashboard.md) | Dashboard 概览 |
| [automation.md](./automation.md) | 自动化模块配置、运行时状态（部分字段为占位） |
| [activity.md](./activity.md) | 活动日志分页列表 |
| [billing.md](./billing.md) | 订阅/套餐/支付方式（订阅侧多为 MVP 占位） |
| [post.md](./post.md) | 帖子 CRUD（真实持久化） |
| [agent.md](./agent.md) | Agent 列表（**占位实现**；与 `automations` 无关） |

环境与 OAuth、邮件：见 [deployment/env.md](../deployment/env.md)。
