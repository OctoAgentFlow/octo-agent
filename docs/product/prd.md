# Product Requirements

Last updated: 2026-06-18

## 产品定位

OctoAgentFlow 是面向 X 账号运营的 AI social operations workflow。用户为 X 账号配置 OAF Bot 人设、内容记忆和安全边界，在 Daily Growth Desk 中发现机会、生成可复制草稿、人工处理、回填结果，并让系统从反馈中学习。

## 核心产品规则

1. Daily Growth Desk 决定“今天先处理什么”：机会信号、质量分层、诊断、手动处理记录和结果学习。
2. OAF Bot 决定“怎么说”：身份、人设、语气、语言、话题边界、安全边界和增长目标。
3. Content Memory 决定“说什么”：产品上下文、观点、FAQ、机会信号、回复学习和运营素材。
4. Content Drafts 提供“可复用草稿”：基于人设、记忆和策略生成内容建议，不把旧发布自动化作为核心入口。
5. Handling List 决定“怎么处理”：人工复核、编辑、复制、打开原帖、标为可用/已处理、记录结果。
6. Analytics / Activity / Admin 决定“怎么观察”：展示内部工作流表现、公开 X 指标、成本、刷新、失败和兼容历史。

## 当前 MVP+ 范围

- Auth：邮箱验证码、注册、登录、刷新 token。
- Accounts：X OAuth 绑定、解绑、scope 记录、账号定位分析、数据边界说明、用户手动私有分析输入。
- OAF Bot：创建、编辑、语言配置、示例生成、one bot per account、人设/记忆/guardrails/学习偏好。
- Exposure Radar / Daily Growth Desk：中英文机会信号、质量分层、采集诊断、回复角度、人工处理记录、结果回填、学习反馈。
- Content Memory：产品上下文、信号记忆、回复学习、内容素材、来源追踪。
- Content Drafts：基于 OAF Bot、Content Memory、机会上下文和策略生成可复用内容草稿。
- Handling List：统一查看和处理 post/comment/reply 的待复核、可用、失败和结果记录；机会回复默认走人工复制和手动发布。
- Billing：套餐、订单、AI 生成额度、机会草稿容量、内容记忆、Review capacity、账号/Bot 限额。
- Analytics / Activity：内部工作流结果、公开 X 指标、失败、内容状态和历史兼容记录。
- Admin：管理员登录、概览、用户管理、成本、调度、X API/OpenAI 消耗、系统状态。

## 明确不在当前范围

- scheduler 自动真实发布评论、回复或私信到 X。
- 后台默认自动蹭热帖、批量评论、批量私信或无人值守增长。
- 使用 Creator Studio 私有受众画像，除非用户手动提供或未来确认授权数据路径。
- 一个 OAF Bot 绑定多个 X 账号。
- 完整团队协作席位管理。
- 完整 Flow Builder、复杂内容源导入、embedding 去重和 A/B 测试。
- 独立链上合约工程。
- 生产环境大规模真实发布。

## 当前优先级

1. 提高 Daily Growth Desk 的机会质量、解释力和首日激活转化。
2. 强化 Account Intelligence 到 Growth Strategy 的闭环。
3. 提升 Content Memory / Content Drafts 的复用效率和来源追踪。
4. 强化 Handling List 的人工安全处理和结果回填。
5. 持续完善成本、调度、X API 和 OpenAI 消耗可观测。
