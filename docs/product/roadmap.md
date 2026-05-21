# Roadmap

本文档描述当前前后端集成状态和下一步优先级。历史 MVP 已完成项不再作为开发入口，继续开发时以 OAF Bot、自动化执行闭环和发布灰度为主线。

## Current Integration Status

| Area | Main Pages | Status | Notes |
| --- | --- | --- | --- |
| Auth | `/login` | real | 邮箱验证码、注册、登录、刷新、`/users/me`；管理员端使用邮箱验证码登录。 |
| Wallet Binding | `/dashboard`, `/settings` | real | `challenge` → 签名 → `bind` / `unbind`；已避免刷新页面反复签名。 |
| Accounts | `/accounts` | real | X OAuth 绑定、列表、解绑；真实发布灰度要求 token scopes 包含 `tweet.write`。 |
| OAF Bot | `/oaf-bots` | real | one bot per account；支持人设、语言配置、示例生成、月度 AI 用量分布。 |
| Billing | `/billing` | real | Basic / Plus / Pro / Pro+；月付/年付；AI 生成总额度和 OAF Bot / X 账号限制。 |
| Dashboard | `/dashboard` | real | 当前套餐与额度、上线检查、近期活动、账号和自动化摘要。 |
| Automations Overview | `/automations` | real | 作为自动化总览和入口；具体能力拆到 Auto Post / Reply / Comment / DM 页面。 |
| Auto Post Planner | `/auto-post` | real（MVP+） | Planner、Content Library、手动生成、run-now、scheduler 到点生成、Execution Queue、Publishing Pipeline `source_type=post`。 |
| Auto Reply | `/auto-replies` | real（MVP） | 基于待回复评论生成草稿，支持 execution mode，进入 Execution Queue；当前不自动真实回复。 |
| Auto Comment | `/auto-comments` | real（MVP） | 目标推文录入、评论草稿生成、execution mode、风险降级、Execution Queue；当前不自动真实评论。 |
| Auto DM | `/auto-dms` | real（MVP+） | 候选、审核、发送、重试、名单管理、导入、黑名单/退订、公开退订页。 |
| Execution Queue | `/execution-queue` | real | 聚合 post/comment/reply；编辑、批准、拒绝、发布任务状态、失败原因、发布演练/真实发布按钮。 |
| Publishing Pipeline | `/execution-queue`, `/publishing/*` | real（灰度） | scheduler 只 simulated publish；真实 X 发布只能由手动 `publish-now` 触发，受 `x_publisher` 开关、daily limit、cooldown 控制。 |
| Posts | `/posts` | real | 传统帖子 CRUD、AI 生成、手动执行、定时发布；Auto Post 新闭环优先走 `/auto-post`。 |
| Activity | `/activity` | real | 自动化、AI 生成、发布、失败、名单变更等活动日志。 |
| Analytics | `/analytics` | real（MVP+） | 活动趋势、失败原因、自动化拆分、内容状态、Auto DM 摘要；外部 X impressions/engagement 待接入。 |
| Admin | `/admin` | real（MVP） | 管理员概览、用户管理；更完整订单运营和系统配置编辑待扩展。 |
| Settings / Profile | `/settings`, `/profile` | real | 资料、密码、通知偏好、语言偏好。 |

## Automation Execution Status

| 模块 | 当前状态 |
| --- | --- |
| OAF Bot | 已作为生成人设入口，Auto Post / Auto Reply / Auto Comment 均按 `twitter_account_id` 查询绑定 Bot。 |
| Auto Post | Planner + Content Library + scheduler 自动生成 + run-now + Execution Queue + Publishing Pipeline `source_type=post` 已接入；真实发推只允许手动灰度。 |
| Auto Reply | 草稿生成 + execution mode + Execution Queue 已接入；真实回复发布通过 Publishing Pipeline 灰度能力预留。 |
| Auto Comment | 草稿生成 + execution mode + risk fallback + Execution Queue 已接入；真实评论发布通过 Publishing Pipeline 灰度能力预留。 |
| Auto DM | 真实发送、重试队列、名单管理、退订、运营摘要已实现；后续可接入 OAF Bot 人设生成。 |
| Publishing Pipeline | post/comment/reply 均接入统一发布任务；scheduler 只 simulated publish；manual `publish-now` 才可能真实调用 X。 |

## Next Development Priorities

1. **真实发布灰度验收**：使用单个测试 X 账号验证 Auto Post `PublishPost`，严格保持 `real_publish_enabled` / `dry_run` 可回滚。
2. **Auto Post 内容质量增强**：内容池分类、最近草稿摘要、重复度策略、素材轮换策略和生成质量反馈。
3. **Execution Queue 体验增强**：更强的批量处理、失败分类筛选、publish job 详情和 Activity 联动。
4. **Auto Reply / Auto Comment 真实发布灰度**：在 post 灰度稳定后，再开放 comment/reply 的真实发布。
5. **Auto DM 接入 OAF Bot**：让私信生成读取 Bot 人设、语言策略和增长目标。
6. **Analytics 外部指标**：接入 X impressions、engagement、profile click 等真实表现数据。
7. **Admin 扩展**：订单运营、对账导出、系统配置、发布器开关可视化和操作审计检索。

## Milestones

1. M1: Scaffold + Auth + Wallet + Accounts（done）
2. M2: Posts / Automations / Billing / Activity MVP（done）
3. M3: OAF Bot + Billing 会员体系（done / 持续迭代）
4. M4: Auto Comment / Auto Reply + Execution Mode + Execution Queue（done / 持续迭代）
5. M5: Auto Post Planner + Content Library + Scheduler + Publishing Pipeline `post`（done / 灰度中）
6. M6: 单账号真实 X 发布灰度（current）
7. M7: 多场景真实发布与风控运营（next）
