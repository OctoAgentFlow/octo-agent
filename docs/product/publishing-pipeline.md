# Publishing Pipeline V1

## 产品定位

Publishing Pipeline 是 Octo-Agent Flow 的统一发布器。它接管所有 `ready_to_publish` 的 AI 生成内容，避免 Auto Comment、Auto Reply、Auto Post、Auto DM 各自直接调用 X 发布接口。

第一阶段仅支持 simulated publish，不会真实发送评论、回复、推文或私信到 X。

## 支持范围

- 已接入：Auto Comment、Auto Reply
- 预留：Auto Post、Auto DM
- 输入状态：`ready_to_publish`
- 输出状态：`published` 或 `failed`
- 可观测：Publish Job、Activity、Execution Queue

## 用户可感知流程

1. 用户将 Auto Comment 或 Auto Reply 设置为全托管。
2. OAF Bot 生成内容并通过基础风控。
3. 内容进入 `ready_to_publish`。
4. Publishing Pipeline 创建 `publish_job`。
5. 发布器在 API scheduler 中扫描 pending job。
6. 当前版本执行 simulated publish。
7. 成功后原始草稿状态变为 `published`，Execution Queue 展示“已发布”。
8. 失败后原始草稿状态变为 `failed`，Execution Queue 展示失败原因并支持重试。

## 当前限制

- 不调用真实 X API。
- 不发送真实评论或回复。
- 发布成功表示测试发布成功，不代表 X 上已出现内容。
- admin-api 不启动发布器。

## 后续方向

- 增加真实 X Publisher adapter。
- 引入按账号、按场景、按套餐的发布限流。
- 支持失败分类、指数退避和死信队列。
- 支持 Auto Post / Auto DM 统一接入。
