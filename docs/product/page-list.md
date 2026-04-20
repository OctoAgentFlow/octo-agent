# Page List

| 路径 | 用途 | 与后端 API 关系（以当前代码为准） |
| --- | --- | --- |
| `/login` | 登录/注册、邮箱验证码 | **真实**：Auth 全套接口 |
| `/dashboard` | 概览、钱包连接 | **真实**：`GET /dashboard/overview`、Wallet |
| `/accounts` | 已连接 X 账号、OAuth | **真实**：Accounts + OAuth |
| `/agents` | 自动化模块卡片与编辑 | **真实**：`/automations*`（非 `GET /agents` 占位接口） |
| `/activity` | 活动日志 | **真实**：`GET /activities` |
| `/billing` | 订阅与套餐展示 | **真实**：`/billing/*`（支付方式等可能为空数据） |
| `/posts` | 帖子列表 / 创建 / 详情 | **真实**：`GET/POST/PUT/DELETE /posts*` |
| `/analytics` | 分析 | 视前端实现；无独立 `analytics` API 前缀 |
| `/settings` | 工作区设置 | 视前端实现 |
| `/profile` | 用户资料 | 视前端实现（常见为 `GET /users/me`） |

说明：

- **`GET /api/v1/agents`** 与 **`GET /api/v1/posts`** 仍为占位；控制台「自动化」依赖 **`/automations`**。
- Dashboard 上部分「运行时」数字若来自 `runtime-status`，其中 **queue_depth / last_success_at 等** 见 [automation.md](../api/automation.md) 是否为占位。
