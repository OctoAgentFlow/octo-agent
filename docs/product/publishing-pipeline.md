# Publishing Pipeline V2

## 产品定位

Publishing Pipeline 是 Octo-Agent Flow 的统一发布器。它接管所有 `ready_to_publish` 的 AI 生成内容，避免 Auto Comment、Auto Reply、Auto Post、Auto DM 各自直接调用 X 发布接口。

当前阶段默认仍然使用 simulated publish，不会由 scheduler 自动真实发送评论、回复、推文或私信到 X。V2 新增真实 X Publisher Adapter 的接口层，但真实发布必须由用户在 Execution Queue 中手动触发。

## 支持范围

- 已接入：Auto Comment、Auto Reply
- 预留：Auto Post、Auto DM
- 输入状态：`ready_to_publish`
- 输出状态：`published` 或 `failed`
- 可观测：Publish Job、Activity、Execution Queue
- 手动真实发布入口：Execution Queue 的“真实发布”按钮
- 测试环境默认：`real_publish_enabled=false`、`dry_run=true`
- 灰度检查接口：`GET /api/v1/publishing/status`

## 用户可感知流程

1. 用户将 Auto Comment 或 Auto Reply 设置为全托管。
2. OAF Bot 生成内容并通过基础风控。
3. 内容进入 `ready_to_publish`。
4. Publishing Pipeline 创建 `publish_job`。
5. 发布器在 API scheduler 中扫描 pending job。
6. 当前版本执行 simulated publish。
7. 成功后原始草稿状态变为 `published`，Execution Queue 展示“已发布”。
8. 失败后原始草稿状态变为 `failed`，Execution Queue 展示失败原因并支持重试。

## 手动真实发布

V2 预留了真实 X 发布通道：

1. 用户在 Execution Queue 中点击“真实发布”。
2. 系统弹窗确认：“将使用绑定的 X 账号真实发布到 X。此操作不可撤销。”
3. 后端检查环境开关、X 账号连接状态、access token、`tweet.write` 权限、每日限流和冷却时间。
4. `dry_run=true` 时执行发布演练，不会调用 X。
5. `dry_run=false` 且 `real_publish_enabled=false` 时直接返回明确错误，不会调用 X。
6. 未来 `real_publish_enabled=true` 且 `dry_run=false` 后，才会调用真实 X Publisher Adapter。

## 当前限制

- 测试环境不调用真实 X API。
- 不发送真实评论或回复。
- scheduler 只执行 simulated publish，不会自动真实发布。
- 发布成功如果 `publish_mode=simulated` 或 `dry_run`，不代表 X 上已出现内容。
- admin-api 不启动发布器。

## 后续方向

- 在确认 X API 权限、风控和法律合规后开启真实 X Publisher adapter。
- 引入按账号、按场景、按套餐的发布限流。
- 支持失败分类、指数退避和死信队列。
- 支持 Auto Post / Auto DM 统一接入。
