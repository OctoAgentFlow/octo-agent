# API 文档索引

所有用户端 HTTP API 均挂在 **`/api/v1`** 下（健康检查除外：`GET /health`）。统一响应形如：

```json
{ "code": 0, "message": "ok", "data": {} }
```

| 文档 | 说明 |
| --- | --- |
| [auth.md](./auth.md) | 注册/登录/刷新、管理员登录、`/users/me`、钱包 challenge/bind/unbind |
| [account.md](./account.md) | X 账号列表、OAuth 起止、解绑 |
| [dashboard.md](./dashboard.md) | Dashboard 概览 |
| [automation.md](./automation.md) | 自动化总览、Auto Post、Content Library、Auto Reply、Auto Comment、Auto DM、Execution Queue、Publishing |
| [activity.md](./activity.md) | 活动日志分页列表 |
| [analytics.md](./analytics.md) | 分析概览 |
| [billing.md](./billing.md) | 订阅/套餐/支付方式、下单、订单查询、链上确认 |
| [admin.md](./admin.md) | 后台管理：概览、用户列表、角色/状态管理 |
| [post.md](./post.md) | 传统帖子 CRUD、AI 生成和手动执行 |
| [agent.md](./agent.md) | Agent 兼容列表（读取自动化配置状态） |

## 当前新增/重点 API 分组

这些分组目前集中写在 [automation.md](./automation.md)，后续如果内容继续膨胀，可拆成独立文档：

- `/oaf-bots`：OAF Bot 创建、编辑、示例生成和生成用量。
- `/auto-post`：Planner、草稿、scheduler runs、run-now。
- `/content-library/items`：Auto Post 内容池素材。
- `/auto-replies`：Auto Reply 草稿生成、编辑、批准、拒绝。
- `/auto-comments`：Auto Comment 目标和草稿。
- `/auto-dm`：Auto DM 任务、名单、导入、公开退订。
- `/review-queue`：统一执行队列聚合查询。
- `/publishing`：发布任务、发布器状态、重试、取消、手动 publish-now。

环境、OAuth、邮件、发布器开关见 [deployment/env.md](../deployment/env.md)。
