<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Frontend i18n Hard Rule

在本项目中，任何前端用户可见文案都必须接入语言包，不允许在组件中硬编码中文或英文。

适用范围包括但不限于：

1. 页面标题、副标题、说明文案
2. 卡片标题、卡片描述
3. 表单 label、placeholder、helper text、error message
4. Button 文案
5. Badge / Tag / Chip 文案
6. Select / Radio / Tabs / Segmented Control 选项
7. 空状态文案
8. Toast / Modal / Confirm Dialog 文案
9. Tooltip 文案
10. Pricing / Billing 套餐权益文案
11. OAF Bot 推荐职业、行业、性格标签、话题标签、禁聊标签
12. Execution Mode、Execution Queue、Publishing Pipeline 状态文案
13. Activity、Analytics、Dashboard 中所有展示文案

开发要求：

1. 不允许在 TSX/组件中直接写死中文或英文展示文案。
2. 所有展示文案必须通过当前项目 i18n 方法读取，例如 `t("xxx.xxx")`。
3. 如果新增页面、卡片、标签、按钮、状态，必须同时补充 `zh-CN` 和 `en` 语言包。
4. 如果是枚举值，代码中使用稳定 `value`，展示时使用语言包 label。
   例如：`value: "web3_growth_manager"`、`labelKey: "oafBot.options.occupations.web3GrowthManager"`。
5. 不要用英文文案本身作为 key，必须使用稳定语义 key。
6. 用户自定义输入内容不需要翻译，原样展示。
7. 后端返回的 `plan_code`、`status`、`scene`、`execution_mode`、feature key 等不能直接展示给用户，前端必须映射到语言包。
8. 如果后端返回英文 `description` / `benefits`，前端不能直接展示，应该根据 `plan_code` 和当前语言渲染本地化文案。
9. 每次修改前端 UI 后，必须自查是否有硬编码文案。
10. 提交前必须运行 `npm run lint` 和 `npm run build`。

验收标准：

1. 简体中文环境下，新功能页面不出现未本地化英文，除非是品牌名、技术名词或用户自定义内容。
2. English 环境下，新功能页面不出现未本地化中文。
3. 新增的所有卡片、标签、按钮、状态、提示都能跟随语言切换。
4. `npm run lint` 通过。
5. `npm run build` 通过。
