# OAF Bot Execution Mode 产品设计

> Historical archive note, updated 2026-06-17:
> This document includes older automation-mode concepts. The current default product stance is manual, review-first operation. Keep this document for compatibility context; do not use it to reintroduce unattended commenting, DM outreach, or spam-like automation.

## 背景

OAF Bot 的长期方向是托管式 AI 社交运营，而不是让用户逐条处理所有 AI 生成内容。用户需要根据风险承受能力、套餐等级和场景差异，在“只给建议”“人工审核”“全托管执行”之间切换。

## 执行模式

| 模式 | 产品定位 | 当前行为 |
| --- | --- | --- |
| manual | 手动模式，只生成建议 | 生成内容后保持为草稿，不进入自动执行 |
| review | 审核模式，生成后等待确认 | 生成内容后进入待审核队列 |
| autopilot | 全托管模式，系统自动推进执行 | 当前测试版本只标记为待发布，不真实发布到 X |

## 场景覆盖

执行模式按 `user_id + scene` 的自动化配置承载，生成时结合 `twitter_account_id` 查询绑定 OAF Bot。当前已覆盖：

- `auto_post`
- `auto_reply`
- `auto_comment`

`auto_dm` 发送链路已独立成熟，后续接入 OAF Bot 内容生成时可沿用相同模式。

当前 OAF Bot 采用 one bot per account 绑定规则：一个 OAF Bot 最多绑定一个 X 账号，一个 X 账号同一时间最多绑定一个 active OAF Bot。因此执行模式和生成链路都以 `twitter_account_id` 为入口查找该账号绑定的 OAF Bot，不支持一个 Bot 直接驱动多个账号。

## 当前生成闭环

1. 用户选择执行 X 账号和场景。
2. 用户选择执行模式：手动、审核后发布、全托管。
3. 系统读取该 X 账号绑定的 OAF Bot。
4. 系统消耗 1 次 AI 生成额度并生成内容。
5. 系统根据场景写入 Auto Post / Auto Reply / Auto Comment 的草稿或任务表。
6. 根据执行模式和基础风控结果进入不同状态：
   - `manual` -> `draft`
   - `review` -> `pending_review`
   - `autopilot` -> `ready_to_publish`
   - 命中风险规则 -> `pending_review`
7. `ready_to_publish` 内容进入 Execution Queue，并可创建 Publishing Pipeline 任务。
8. 当前 scheduler 不会真实发布到 X；真实发布只能人工灰度触发。

## 套餐策略

- 免费试用 / Basic：默认审核模式，可使用手动和审核模式。
- Plus / Pro / Pro+：可选择全托管模式。
- 全托管仍受 AI 生成额度、每日自动评论额度和基础风控约束。

## 审核队列的新定位

审核队列不再表示“所有内容必须人工审核”，而是用于处理：

- 用户选择 review 模式的内容
- autopilot 命中风险规则后降级的内容
- 执行失败或需要人工介入的内容

## 安全边界

即使是全托管模式，也必须遵守：

- AI 生成额度限制
- 每日自动化额度限制
- 同一目标推文去重
- OAF Bot 禁止话题
- 自动化配置中的屏蔽关键词
- 高风险词拦截，例如收益承诺、私钥/助记词、冒充官方、诱导连接钱包等

## 后续阶段

1. Auto DM 内容生成接入 OAF Bot 和统一执行模式。
2. 建立独立 `oaf_bot_execution_policies` 表，支持按账号和场景覆盖。
3. 在单账号灰度稳定后，逐步开放真实 X 发布。
4. 增加更细粒度风控：账号频率、目标账号冷却、语义安全分类、人工接管开关。
5. Activity 中继续增强 `autopilot_prepared`、`autopilot_published`、`risk_downgraded` 等可观测事件。
