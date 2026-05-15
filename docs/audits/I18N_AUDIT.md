# Frontend i18n Audit

审计日期：2026-05-15

审计范围：`frontend/src` 下用户可见 TS/TSX 文案，重点覆盖 OAF Bot、Billing / Pricing、Execution Queue、Auto Comment、Auto Reply、Sidebar / Header / Dashboard、表单 placeholder、helper、chip、badge、select option、toast、tooltip、空状态。

扫描命令：

```bash
rg -n "[\u4e00-\u9fff]" frontend/src --glob '!**/i18n/**' --glob '!**/mocks/**' --glob '!**/admin/page.tsx' --glob '!**/*.css'
rg -n "\"(Loading|Failed|Retry|Name|Verification code|Your name|Send code|No payment method|Account Form|Post Form|Footer|Agent Card|Post Card|Post Table|Agent Config Form|Schedule Post Dialog|Auto DM Preferences|Unsubscribe|Loading\.\.\.)\"|>(Loading|Failed|Retry|Footer|Account Form|Post Form|Agent Card|Post Card|Post Table|Agent Config Form|Schedule Post Dialog|Auto DM Preferences|Unsubscribe|OR)<" frontend/src --glob '!**/i18n/**' --glob '!**/mocks/**' --glob '!**/admin/page.tsx'
```

说明：`frontend/src/i18n/**` 是语言包本身，`frontend/src/mocks/**` 是开发 mock 数据，已从硬编码扫描中排除。`frontend/src/app/(dashboard)/admin/page.tsx` 是后台管理大页，历史中文硬编码量较大，本次只修复 Sidebar 中后台入口，后台页面主体建议单独拆分一次 admin-front i18n 整理。

## 已修复问题

| 模块 | 问题文案 | 文件 | 建议/已使用 key |
| --- | --- | --- | --- |
| Billing 用量卡 | `OAF Bots`、`X Accounts`、`AI 生成次数`、`自动发推/日` 等用量 label | `frontend/src/components/billing/billing-page-content.tsx` | `billing.usage.items.*` |
| Billing 页面状态 | `Loading billing data...`、`Failed to load billing data`、`Retry`、toast 文案 | `frontend/src/app/(dashboard)/billing/page.tsx` | `billing.loading.*`、`billing.error.title`、`billing.errors.*`、`billing.toast.*`、`common.retry` |
| Billing 订阅卡 | `计费周期`、`年付`、`月付` | `frontend/src/components/billing/subscription-status-card.tsx` | `billing.subscription.fields.billingCycle`、`billing.billingCycle.*` |
| Billing 支付方式 | `No payment method connected yet.` | `frontend/src/components/billing/payment-method-panel.tsx` | `billing.payment.empty` |
| Billing Checkout | `Failed to create order` | `frontend/src/components/billing/billing-checkout-dialog.tsx` | `billing.checkout.createOrderFailed` |
| Auto Comment | URL / handle placeholder、`auto_comment` badge、拒绝原因、target status | `frontend/src/app/(dashboard)/auto-comments/page.tsx` | `autoComment.target.*Placeholder`、`autoComment.scene`、`autoComment.review.rejectReason`、`autoComment.targetStatus.*` |
| Auto Reply | URL / handle placeholder、`auto_reply` badge、拒绝原因 | `frontend/src/app/(dashboard)/auto-replies/page.tsx` | `autoReply.target.*Placeholder`、`autoReply.scene`、`autoReply.review.rejectReason` |
| Execution Queue | 拒绝原因 `Rejected from execution queue.` | `frontend/src/app/(dashboard)/execution-queue/page.tsx` | `executionQueue.rejectReason` |
| Dashboard | loading / error 文案、自动化卡片 loading / retry | `frontend/src/app/(dashboard)/dashboard/page.tsx`、`frontend/src/components/dashboard/automation-overview.tsx` | `dashboard.loading.*`、`dashboard.error.title`、`dashboard.errors.*`、`dashboard.automation.loading`、`common.retry` |
| Accounts | loading / error / retry 文案 | `frontend/src/components/accounts/accounts-client.tsx` | `accounts.loading.*`、`accounts.error.title`、`common.retry` |
| Activity | error / retry 文案 | `frontend/src/app/(dashboard)/activity/page.tsx` | `activity.error.title`、`activity.errors.load`、`common.retry` |
| Automations | loading / error / retry、Auto Comment retry toast | `frontend/src/app/(dashboard)/agents/page.tsx` | `automation.loading.*`、`automation.error.title`、`automation.comment.retry*`、`common.retry` |
| Sidebar | Admin 模式一级菜单中文硬编码 | `frontend/src/components/layout/app-sidebar.tsx` | `sidebar.admin.*` |
| Login / Admin Login | 登录成功、注册成功、验证码、发送中、姓名、OR、管理员登录说明、钱包 toast | `frontend/src/components/forms/login-form.tsx`、`frontend/src/components/auth/auth-card.tsx` | `auth.toast.*`、`auth.form.*`、`auth.card.*`、`wallet.toast.*` |
| Unsubscribe | `Auto DM Preferences`、`Unsubscribe`、loading / done / error 文案 | `frontend/src/app/unsubscribe/[token]/page.tsx` | `unsubscribe.*`、`common.loading` |
| Legacy stub components | `Agent Card`、`Agent Config Form`、`Account Form`、`Post Form`、`Footer`、`Post Card`、`Post Table`、`Schedule Post Dialog` | `frontend/src/components/agents/*`、`frontend/src/components/forms/*`、`frontend/src/components/posts/*`、`frontend/src/components/layout/app-footer.tsx` | `stubs.*` |

## OAF Bot 页面结论

`frontend/src/app/(dashboard)/oaf-bots/page.tsx` 已经使用语言包渲染主要用户可见文案，包括字段 label、placeholder、helper、职业/行业/性格/话题/禁聊推荐标签、语言环境配置、示例生成、Bot Preview、最近生成记录。未发现需要本次修复的裸中文。

## Pricing / Billing 结论

首页 Pricing 已通过套餐展示工具和语言包渲染；Dashboard Billing 本次修复了用量 label、loading/error/toast、支付方式空状态和订阅周期文案。后端返回的 plan code / limits 继续作为稳定值和数字来源，前端展示文案走语言包。

## Execution Queue 结论

Execution Queue 的类型、状态、执行模式、发布状态、按钮、确认弹窗和 toast 已接入语言包。本次补齐了拒绝原因文案，避免把英文业务原因写死到请求中。

## Auto Comment / Auto Reply 结论

两页主要文案已接入语言包。本次补齐 placeholder、scene badge、Bot 编号展示和 reject reason。生成内容、用户输入、账号 handle、URL 示例属于用户输入或示例格式，不强制翻译，但 placeholder 本身已通过语言包读取。

## Sidebar / Header / Dashboard 结论

用户端 Sidebar / Header 已接入语言包。本次补齐 Admin 模式 Sidebar 入口、Dashboard loading/error 和自动化概览 loading/retry。

## 当前保留项

| 模块 | 文件 | 原因 | 建议 |
| --- | --- | --- | --- |
| Admin 页面主体 | `frontend/src/app/(dashboard)/admin/page.tsx` | 历史后台页面存在大量中文硬编码，且用户前台当前 MVP 不依赖此页面；一次性替换会影响大量表格、筛选、操作文案和状态映射。 | 单独执行 admin-front i18n 专项：新增 `admin.*` key，替换 section metadata、role/status/order label、toast、表格列、按钮和空状态。 |
| 非 zh-CN / en 语言包 | `frontend/src/i18n/dictionaries/ja.ts`、`ko.ts`、`ru.ts`、`zh-TW.ts` | 本次新增 key 按当前硬规则补齐 `zh-CN` 和 `en`。其他语言包已有历史覆盖不完整的问题。 | 后续若继续支持这些语言，需要建立字典完整性检查脚本。 |

## 本次修复后复扫结果

排除 `i18n`、`mocks`、`admin/page.tsx` 后：

- 未发现裸中文用户可见文案。
- 未发现本次重点关键词对应的英文硬编码文案。

## 验收要求

- `npm run lint`
- `npm run build`
