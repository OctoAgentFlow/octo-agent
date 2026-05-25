# Product Requirements

## 产品定位

Octo-Agent Flow 是以 OAF Bot 为核心的 AI 社交运营平台。用户为 X 账号创建 AI 社交人格机器人，并通过自动化 Flow 生成、审核、排队和发布内容。

## 核心产品规则

1. OAF Bot 决定“怎么说”：身份、人设、语气、语言、话题边界和增长目标。
2. 内容来源决定“说什么”：Content Library、目标推文、评论上下文、用户输入。
3. 自动化规则决定“什么时候说”：Planner、运行窗口、频率限制、执行模式。
4. Execution Queue 决定“是否人工介入”：草稿、待审核、待发布、失败处理。
5. Publishing Pipeline 决定“如何发布”：统一 publish job、模拟发布、dry-run、人工真实发布灰度。

## 当前 MVP+ 范围

- Auth：邮箱验证码、注册、登录、刷新 token。
- Accounts：X OAuth 绑定、解绑、scope 记录。
- OAF Bot：创建、编辑、语言配置、示例生成、one bot per account。
- Billing：Basic / Plus / Pro / Pro+，月付/年付，AI 生成总额度和自动化额度。
- Auto Post：Planner、Content Library、手动生成、run-now、scheduler 自动生成、Execution Queue、Publishing Pipeline `source_type=post`。
- Auto Reply：基于评论上下文生成回复草稿，接入 execution mode 和 Execution Queue。
- Auto Comment：基于目标推文生成评论草稿，接入 execution mode 和 Execution Queue。
- Auto DM：任务审批、真实发送、重试、名单管理、退订、导入、运营摘要。
- Execution Queue：统一查看和处理 post/comment/reply 的待审核、待发布和失败内容。
- Publishing Pipeline：统一发布器，当前真实发布仅手动灰度，不自动真实发布。
- Analytics / Activity：活动、失败、内容状态和自动化运行可观测。
- Admin：管理员登录、概览、用户管理。

## 明确不在当前范围

- scheduler 自动真实发布到 X。
- 一个 OAF Bot 绑定多个 X 账号。
- 完整团队协作席位管理。
- 复杂内容源导入、embedding 去重和 A/B 测试。
- 独立链上合约工程。
- 生产环境大规模真实发布。

## 当前优先级

1. 单账号 Auto Post 真实发推灰度。
2. Auto Post 内容质量、去重和素材轮换增强。
3. Execution Queue 可观测性和批量处理增强。
4. Auto Reply / Auto Comment 真实发布灰度。
5. Auto DM 接入 OAF Bot 人设生成。
