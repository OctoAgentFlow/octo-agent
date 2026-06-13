# PROJECT_CONTEXT

## 1. 项目定位

Octo-Agent Flow 是面向 X/Twitter 社交运营的 AI 自动化平台。当前核心不再只是“自动发推/回复/私信工具”，而是以 **OAF Bot** 为中心的 AI 社交人格机器人系统：

- OAF Bot 决定账号“怎么说”：身份、人设、语气、语言、话题边界、增长目标。
- 内容来源决定“说什么”：Content Library、用户输入、目标推文/评论上下文。
- 自动化规则决定“什么时候说”：Auto Post Planner、执行模式、运行窗口、频率限制。
- Execution Queue 决定“是否人工处理”：草稿、待审核、待发布、失败、已发布。
- Publishing Pipeline 决定“如何发布”：统一 publish job、模拟发布、dry-run、人工真实发布灰度。

当前测试环境原则：**不自动真实发布到 X**。scheduler 只做 simulated publish；真实 X 发布必须由用户手动触发，并受 `x_publisher` 开关、daily limit、cooldown 和 OAuth scope 校验约束。

## 2. 技术栈

### Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui 风格组件
- React Hook Form / Zod
- Reown AppKit、wagmi、viem 钱包连接
- 自研 i18n 字典：所有用户可见文案必须走语言包

### Backend

- Go
- Gin
- GORM
- MySQL 8
- YAML 配置：`APP_ENV` + `APP_SERVICE`
- API scheduler 运行在用户端 API 服务中，admin-api 不启动 scheduler

### AI / External

- OpenAI LLM provider
- X OAuth 2.0 PKCE
- X API v2 tweet create/reply 接口（真实发布灰度）
- Resend / local email provider
- EVM RPC 用于 USDT 支付校验

## 3. 目录结构

```text
backend/
  cmd/api/                 用户端 API 服务，启动 scheduler
  cmd/admin/               Admin API 服务，不启动 scheduler
  configs/                 local/test/prod + api/admin 拆分配置
  internal/controller/     HTTP controller
  internal/router/         API 路由注册
  internal/service/        业务服务
  internal/repository/     GORM repository
  internal/model/          GORM model
  internal/dto/            请求/响应 DTO
  internal/database/       AutoMigrate 与回填
  internal/integration/    OpenAI、Twitter/X 等外部集成
frontend/
  src/app/                 Next.js App Router 页面
  src/components/          UI 组件
  src/services/            API 调用封装
  src/i18n/                中英文语言包
scripts/                   本地/测试/生产脚本化部署
docs/                      项目、产品、API、数据库、部署、验收文档
```

## 4. 核心模块状态

### Auth / User

- 邮箱验证码注册、登录、刷新 token。
- 管理员端登录使用允许邮箱 + 验证码。
- JWT secret 必须稳定配置；非 local 环境不应使用随机 secret。

### Accounts

- X OAuth 2.0 PKCE 绑定。
- 账号记录 OAuth scopes。
- Publishing Pipeline 灰度发布要求 `tweet.write`。

### OAF Bot

- 页面：`/oaf-bots`
- API：`/api/v1/oaf-bots`
- 当前规则：one bot per account。
- 支持字段：职业、行业、年龄段、性别表达、学历、MBTI、性格标签、身份摘要、语气、话题、禁聊、增长目标、安全模式、主要输出语言、语言策略。
- 支持 `test-generate`，按 scene 生成单条示例并扣减 AI 生成用量。
- 本月 AI 生成用量按 scene 展示分布，所有 scene 共享套餐总额度。

### Billing

- Basic / Plus / Pro / Pro+ 四档套餐。
- 支持 monthly / yearly。
- 年付价格为月费 * 12 * 0.8。
- 订阅接口返回套餐、周期、到期、limits、usage。
- OAF Bot 数量、X 账号数量、monthly AI generations、每日自动化额度由 PlanLimits 控制。

### Auto Post Planner

- 页面：`/auto-post`
- API：`/api/v1/auto-post/*`
- 配置：`enabled`、`execution_mode`、`daily_limit`、`min_interval_minutes`、`posting_windows`、`timezone`。
- Content Library：`/api/v1/content-library/items`
- 支持：
  - 手动生成单条 Auto Post 草稿。
  - run-now 手动触发一次 scheduler 同等逻辑。
  - API scheduler 到点扫描 enabled planner 自动生成草稿。
  - 生成时读取 X 账号绑定的 OAF Bot、人设、语言配置和内容素材。
  - AI 用量记录 `scene=auto_post`。
  - 草稿进入 Execution Queue，`source_type=post` 可进入 Publishing Pipeline。
- 当前不做真实自动发 X。

### Auto Reply

- 页面：`/auto-replies`
- API：`/api/v1/auto-replies/drafts*`
- 基于待回复评论上下文生成回复草稿。
- 读取 X 账号绑定的 OAF Bot。
- 支持 execution mode。
- AI 用量记录 `scene=auto_reply`。
- 进入 Execution Queue，发布任务预留真实发布灰度。

### Auto Comment

- 页面：`/auto-comments`
- API：`/api/v1/auto-comments/*`
- 支持目标推文录入、评论草稿生成、审核/拒绝。
- 读取 X 账号绑定的 OAF Bot。
- 支持 execution mode 和基础风险降级。
- AI 用量记录 `scene=auto_comment`。
- 进入 Execution Queue，发布任务预留真实发布灰度。

### Auto DM

- 页面：`/auto-dms`
- API：`/api/v1/auto-dm/*`
- 已支持候选任务、审批、真实发送、失败重试、名单管理、CSV allowlist 导入、黑名单/退订、公开退订页、名单审计和运营摘要。
- 后续可继续接入 OAF Bot 人设生成。

### Execution Queue

- 页面：`/execution-queue`
- API：`GET /api/v1/review-queue`
- 当前聚合：post / comment / reply。
- 支持状态：`draft`、`pending_review`、`approved`、`ready_to_publish`、`published`、`rejected`、`failed`。
- 支持编辑、批准、拒绝、查看 publish job、重试/取消/手动发布。

### Publishing Pipeline

- API：`/api/v1/publishing/*`
- 表：`publish_jobs`
- 支持 `source_type=post/comment/reply`。
- scheduler 只处理 pending job 的 simulated publish。
- 手动 `publish-now` 根据配置走 dry-run 或真实 X API。
- `XPublisher` 支持：
  - `PublishPost`
  - `PublishReply`
  - `PublishComment`
- 测试环境默认：

```yaml
x_publisher:
  real_publish_enabled: false
  manual_publish_enabled: true
  per_account_daily_limit: 1
  per_account_min_interval_seconds: 300
  dry_run: true
```

### Posts

- 页面：`/posts`
- API：`/api/v1/posts`
- 保留传统帖子 CRUD、AI 生成、手动执行和定时发布。
- Auto Post 新闭环优先使用 `/auto-post`，不要把 `/posts/create` 当作 Planner 主入口。

### Admin

- 页面：`/admin`
- Admin API：`/api/v1/admin/*`
- 支持后台概览、用户列表、角色/状态管理。
- admin-api 不启动用户端 scheduler。

## 5. 本地启动方式

### 前置依赖

- Node.js 22+
- npm 10+
- Go 1.25+
- MySQL 8+

### 后端

```bash
make api-local
make admin-api-local
```

- API：`http://localhost:10001`
- Admin API：`http://localhost:10002`
- 用户 API 前缀：`http://localhost:10001/api/v1`
- Admin API 前缀：`http://localhost:10002/api/v1`

配置加载：

- `APP_ENV=local APP_SERVICE=api` -> `backend/configs/config.local.api.yaml`
- `APP_ENV=local APP_SERVICE=admin` -> `backend/configs/config.local.admin.yaml`
- 不设置 `APP_SERVICE` 时兼容读取 `config.<env>.yaml`

### 前端

```bash
make api-front-local
make admin-front-local
```

- API Front：`http://localhost:3000`
- Admin Front：`http://localhost:3001`

## 6. 测试环境部署（已废弃）

Test 环境服务器已释放。以下 test 部署路径仅保留为历史记录，不再作为开发、联调或验收入口。需要部署到服务器时使用 prod 脚本。

当前项目不使用 Docker、Docker Compose、systemd 或仓库内 Nginx 模板。以 `scripts/` 脚本化部署为准。

已废弃的测试部署：

```bash
bash scripts/deploy-backend-api-test.sh
bash scripts/deploy-backend-admin-test.sh
bash scripts/deploy-api-front-test.sh
bash scripts/deploy-admin-front-test.sh
```

当前服务器部署入口：

```bash
bash scripts/deploy-backend-api-prod.sh
bash scripts/deploy-backend-admin-prod.sh
bash scripts/deploy-api-front-prod.sh
bash scripts/deploy-admin-front-prod.sh
```

当前服务器路径：

```text
/home/ubuntu/octo/octo-agent
```

已废弃测试域名：

- 用户端：`https://test.octo-agent.com`
- 后台端：`https://testadmin.octo-agent.com`

## 7. 数据库关系

核心新增表：

- OAF Bot：`oaf_bots`
- AI 用量：`ai_generation_usages`
- Auto Post：`auto_post_plans`、`auto_post_drafts`、`auto_post_generation_runs`
- Content Library：`content_library_items`
- Auto Reply：`auto_reply_drafts`
- Auto Comment：`auto_comment_targets`、`auto_comment_tasks`
- Publishing：`publish_jobs`

关系摘要：

- `twitter_accounts` 是 OAF Bot 和自动化生成的账号入口。
- `oaf_bots.twitter_account_id` 绑定一个 X 账号。
- Auto Post / Reply / Comment 生成时按 `twitter_account_id` 查询绑定 OAF Bot。
- 生成成功写入 `ai_generation_usages`。
- 根据 execution mode 写入 draft/task 状态。
- `ready_to_publish` 或 `approved` 内容创建 `publish_jobs`。
- Publishing Pipeline 发布结果回写 source draft/task 状态。
- Activity 记录生成、跳过、失败、发布任务、发布成功/失败等可观测事件。

## 8. 链上关系

当前仓库没有合约工程，也没有 Solidity 源码。链上能力主要是：

- 钱包连接与签名绑定。
- Billing 使用 YAML 配置的链和 USDT 收款地址。
- 后端通过 EVM RPC 校验用户支付 tx。
- `billing_chain_txs` 防止同一链上交易重复确认。

## 9. 当前开发注意事项

1. 前端所有用户可见文案必须接入语言包，规则见 `frontend/AGENTS.md`。
2. 不要让 Auto Post / Auto Reply / Auto Comment 直接调用 X 发布接口，必须走 Publishing Pipeline。
3. 不要开启 scheduler 自动真实发布。
4. 测试环境真实发 X 只能按 `docs/deployment/x-publisher-gray-release.md` 单账号灰度。
5. 新增自动化能力时，需要同步考虑：
   - OAF Bot 人设/语言策略
   - PlanLimits 与 AI 用量
   - Execution Mode
   - Execution Queue
   - Publishing Pipeline
   - Activity 可观测性
   - i18n

## 10. 建议下一步

1. 按 Runbook 完成单账号 Auto Post 真实发推灰度。
2. 增强 Auto Post 内容质量与重复度控制。
3. 扩展 Execution Queue 的筛选、批量操作和 publish job 详情。
4. 在 post 灰度稳定后，再逐步开放 comment/reply 真实发布灰度。
5. 让 Auto DM 的内容生成接入 OAF Bot 人设。
