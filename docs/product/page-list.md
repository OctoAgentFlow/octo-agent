# Page List

本文档按当前 `frontend/src/app` 页面和后端 API 对齐，用于继续开发和调试时快速定位入口。

| 路径 | 用途 | 与后端 API 关系 |
| --- | --- | --- |
| `/` | 官网首页，介绍 OAF Bot、自动化能力、Pricing、FAQ | 读取 `/public/site-links` 展示官方 X / TG 链接；Pricing 文案前端本地化，套餐数字来自 Billing |
| `/login` | 用户登录/注册，邮箱验证码 | `POST /auth/email-code/send`、`POST /auth/register`、`POST /auth/login`、`POST /auth/refresh`、`GET /users/me` |
| `/dashboard` | 用户控制台概览、套餐额度、上线检查、近期活动 | `GET /dashboard/overview`、`GET /billing/subscription`、`GET /activities`、`GET /automations/runtime-status` |
| `/accounts` | X 账号绑定、列表、解绑 | `GET /accounts`、`POST /accounts/oauth/x/start`、`DELETE /accounts/:id`、OAuth callback |
| `/oaf-bots` | OAF Bot 创建/编辑、语言配置、示例生成、本月 AI 用量 | `GET/POST/PUT /oaf-bots`、`POST /oaf-bots/:id/test-generate`、`GET /oaf-bots/:id/generation-usages` |
| `/automations` | 自动化总览和入口 | `GET /automations`、`GET /automations/runtime-status`，并跳转 Auto Post / Reply / Comment / DM 子页面 |
| `/auto-post` | Auto Post Planner、Content Library、手动生成、run-now、运行记录 | `/auto-post/*`、`/content-library/items`、Execution Queue / Publishing Pipeline |
| `/auto-replies` | Auto Reply 最小闭环：录入评论、生成回复草稿、执行模式 | `/auto-replies/drafts*`、`PATCH /automations/reply/execution-mode` |
| `/auto-comments` | Auto Comment 最小闭环：目标推文、生成评论草稿、执行模式 | `/auto-comments/targets*`、`/auto-comments/drafts*`、`PATCH /automations/comment/execution-mode` |
| `/auto-dms` | Auto DM 任务、收件人规则、导入、重试、退订/黑名单管理 | `/auto-dm/tasks`、`/auto-dm/recipients`、`/auto-dm/recipient-rules/*`、`/auto-dm/recipients/imports` |
| `/execution-queue` | 统一执行队列：待审核、待发布、失败、发布任务状态 | `GET /review-queue`、Auto Post/Reply/Comment approve/reject/update、`/publishing/jobs/*` |
| `/review-queue` | 兼容入口，当前语义同 Execution Queue | `GET /review-queue` |
| `/posts` | 传统 Posts 列表、详情、创建、手动发布 | `GET/POST/PUT/DELETE /posts`、`POST /posts/:id/execute`、`POST /posts/generate` |
| `/activity` | 活动日志和失败排查 | `GET /activities`，支持类型、状态、时间范围、账号、失败原因筛选 |
| `/analytics` | 分析概览 | `GET /analytics/overview?range=7d|30d&account_id=...` |
| `/billing` | 套餐、订阅、AI 用量、下单、订单历史 | `/billing/subscription`、`/billing/plans`、`/billing/payment-methods`、`/billing/orders*` |
| `/settings` | 当前用户资料、密码、通知偏好、语言偏好 | `GET/PATCH /users/me`、`PATCH /users/me/password`、`GET/PATCH /users/me/notification-settings` |
| `/profile` | 当前用户资料 | `GET /users/me` |
| `/admin` | 管理后台首页和用户管理 | Admin API：`/admin/overview`、`/admin/users`、`PATCH /admin/users/:id`；仅 `owner/admin` |
| `/unsubscribe/[token]` | Auto DM 公开退订页 | `GET/POST /auto-dm/unsubscribe/:token`，无需登录 |

## 当前信息架构

- OAF Bot 是人设层：决定账号“怎么说”，包含身份、语气、话题、边界、增长目标和语言策略。
- Auto Post / Reply / Comment / DM 是执行层：决定生成什么场景的内容。
- Execution Queue 是审核与待发布层：统一处理 `draft`、`pending_review`、`ready_to_publish`、`published`、`failed`。
- Publishing Pipeline 是发布层：统一创建 `publish_jobs`，scheduler 只 simulated publish，真实 X 发布必须由用户手动触发。

## 说明

- `/agents` 仍有兼容页面/接口，但当前主导航应以 `/oaf-bots` 和 `/automations` 为准。
- Auto Post 新工作流优先使用 `/auto-post`；`/posts/create?source=auto_post` 仍可作为传统内容准备入口。
