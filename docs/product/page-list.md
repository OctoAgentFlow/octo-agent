# Page List

| 路径 | 用途 | 与后端 API 关系（以当前代码为准） |
| --- | --- | --- |
| `/login` | 登录/注册、邮箱验证码 | **真实**：Auth 全套接口 |
| `/dashboard` | 概览、钱包连接、最近活动 | **真实**：`GET /dashboard/overview`、`GET /activities`（近期条目）、Wallet；自动化概览来自 `/automations` |
| `/accounts` | 已连接 X 账号、OAuth | **真实**：Accounts + OAuth |
| `/agents` | 自动化模块卡片、编辑、Auto DM 审核/发送/重试/名单队列、导入历史与名单管理 | **真实**：页面使用 `/automations*`、`/auto-dm/tasks`、`/auto-dm/recipients`、`/auto-dm/recipient-rules/*` 与 `/auto-dm/recipients/imports`；`GET /agents` 已对齐自动化配置状态 |
| `/unsubscribe/[token]` | Auto DM 公开退订页 | **真实**：读取/提交 `/auto-dm/unsubscribe/{token}`，无需登录 |
| `/activity` | 活动日志 | **真实**：`GET /activities`，支持 `type/status/range/account_id/error_reason` 筛选 |
| `/billing` | 订阅与套餐、下单、异常订单处理 | **真实**：`/billing/*`（含 BEP20 支付配置、订单接口、补交 tx hash 与自动过期，见 [billing.md](../api/billing.md)） |
| `/posts` | 帖子列表 / 创建 / 详情 | **真实**：`GET/POST/PUT/DELETE /posts`、`POST /posts/:id/execute`；定时调度见 [post.md](../api/post.md) |
| `/analytics` | 分析 | **真实（MVP+）**：`GET /analytics/overview?range=7d|30d&account_id=...`，含账号对比、失败原因和待处理项跳转 Activity |
| `/settings` | 工作区设置 | **真实（MVP+）**：`GET/PATCH /users/me`、`GET/PATCH /users/me/notification-settings`、本地语言偏好 |
| `/profile` | 用户资料 | **真实**：`GET /users/me` |

说明：

- **`GET /api/v1/agents`** 为兼容列表，读取自动化配置状态；控制台「自动化」编辑仍依赖 **`/automations`**。
- **`GET /api/v1/posts`** 为 **真实 CRUD + execute**，不是占位。
- Dashboard / Agents 上 **`/automations/runtime-status`** 的 `queue_depth` / `last_success_at` 等为 **真实统计**（定义见 [automation.md](../api/automation.md)）。
