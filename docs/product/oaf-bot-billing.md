# OAF Bot + Billing 会员体系第一阶段产品方案

## 目标定位

OAF Bot 是绑定在用户 X 账号背后的 AI 社交人格机器人。用户可以为机器人配置职业、年龄段、性别表达、学历、性格、MBTI、语言风格、话题领域、互动策略、行为边界和增长目标。后续自动发推、自动回复、自动评论和自动私信都会读取 OAF Bot 人设，保证不同账号有稳定、可控、可复用的社交人格。

第一阶段目标不是接入完整执行链路，而是先完成「付费权益 -> 机器人配置 -> 示例生成 -> 基础数量限制」的闭环：

- Billing 提供 Basic / Plus / Pro / Pro+ 四档套餐。
- 用户可以按月付或年付创建订单，年付价格按套餐约定展示为 Save 20%。
- Billing 页面和官网 Pricing 页面清晰展示套餐差异，引导升级。
- OAF Bot 支持创建、查看、编辑和 test-generate 示例生成。
- OAF Bot 创建数量受当前会员权益限制。
- X 账号绑定数量受当前会员权益限制。

## 会员方案

| 套餐 | 月付 | 年付 | 标签 | 适合对象 |
| --- | ---: | ---: | --- | --- |
| Basic | 10 USDT/月 | 96 USDT/年 | - | 单账号创作者或项目早期账号 |
| Plus | 29 USDT/月 | 279 USDT/年 | Most Popular | 需要 3 个账号协同增长的小团队 |
| Pro | 79 USDT/月 | 759 USDT/年 | Best for Teams | 内容团队和矩阵化运营团队 |
| Pro+ | 199 USDT/月 | 1910 USDT/年 | - | 多机器人矩阵运营和高频增长团队 |

## 权益矩阵

| 权益 | Basic | Plus | Pro | Pro+ |
| --- | ---: | ---: | ---: | ---: |
| OAF Bot 数量 | 1 | 3 | 10 | 30 |
| X 账号数量 | 1 | 3 | 10 | 30 |
| AI 生成次数/月 | 1,000 | 10,000 | 50,000 | 200,000 |
| 自动发推/日 | 3 | 10 | 50 | 200 |
| 自动回复/日 | 20 | 100 | 500 | 2,000 |
| 自动评论/日 | 10 | 50 | 300 | 1,000 |
| 自动私信/日 | 20 | 100 | 500 | 2,000 |
| Analytics | 7 日基础 | 30 日 | 90 日 | 365 日 |
| 团队席位 | 1 | 1 | 3 | 10 |

高级能力按套餐逐级解锁。前端不隐藏未解锁能力，而是显示锁定态和升级提示，帮助用户理解升级后的能力边界。

## OAF Bot V1 范围

第一阶段支持字段：

- name
- twitter_account_id
- occupation
- industry
- age_range
- gender
- education
- mbti
- personality_tags
- identity_summary
- voice_tone
- topics
- forbidden_topics
- growth_goal
- safety_mode

第一阶段能力：

- 创建 OAF Bot。
- 查看 OAF Bot 列表和详情。
- 编辑 OAF Bot。
- 根据当前人设生成示例推文、回复和私信。

暂不包含：

- 自动发推真实执行读取 OAF Bot。
- 自动回复真实执行读取 OAF Bot。
- 自动评论真实执行读取 OAF Bot。
- 自动私信真实执行读取 OAF Bot。
- AI 生成次数真实扣减。
- 团队席位管理。
- A/B 测试和高级 Flow Builder。

## 用户体验要求

官网 Pricing：

- 展示四档套餐卡。
- 支持 Monthly / Yearly 切换。
- Yearly 展示 Save 20%。
- Plus 视觉突出并标记 Most Popular。
- Pro 标记 Best for Teams。

用户端 Billing：

- 展示当前套餐、计费周期、到期时间和权益限制。
- 展示当前用量：OAF Bots、X Accounts、AI 生成次数、自动发推/回复/评论/私信。
- 展示完整四档套餐权益和升级按钮。
- 高级能力不可用时显示锁定态和升级提示。

OAF Bot 页面：

- 用户可以看到当前可用 Bot 数量和已用数量。
- 创建按钮在超出套餐数量时显示升级提示。
- 表单字段清晰，按“身份画像 / 内容风格 / 安全边界 / 增长目标”组织。
- test-generate 只生成示例内容，不触发真实发布或私信。

## 验收标准

- Billing plans 接口返回 Basic / Plus / Pro / Pro+ 四档套餐。
- 创建订单支持 plan_code 和 billing_cycle。
- 当前 subscription 返回套餐、周期、到期时间、limits 和 usage。
- 免费试用用户仍可使用 1 个 X 账号，付费用户按套餐限制绑定。
- Basic 用户最多创建 1 个 OAF Bot，Plus 最多 3 个，Pro 最多 10 个，Pro+ 最多 30 个。
- Pricing 和 Billing 页面均可切换 Monthly / Yearly。
- OAF Bot 可创建、编辑、查看，并可生成示例推文/回复/私信。
- 不破坏现有 Posts、Automations、Auto DM、Billing 订单和支付确认流程。
