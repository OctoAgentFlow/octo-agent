# Documentation Index

Octo-Agent 文档按用途归档在本目录下。根目录只保留 `README.md` 作为项目入口。

## Project

- `project/PROJECT_CONTEXT.md`：项目上下文、模块状态、运行方式。

## Runbooks

- `runbooks/LOCAL_RUNBOOK.md`：本地四服务启动链路。
- `runbooks/exposure-radar-smoke-test.md`：Exposure Radar 发布前后冒烟测试 Runbook。
- `runbooks/core-workflow-smoke-test.md`：核心手动增长工作流冒烟测试脚本说明。
- `runbooks/first-day-user-validation.md`：首日用户验证清单，覆盖账号分析、策略应用、手动回复和结果回填闭环。
- `runbooks/legacy-route-traffic-audit.md`：旧自动化路由生产流量审计 Runbook。

## Acceptance

- `acceptance/CURRENT_ACCEPTANCE_CHECKLIST.md`：当前 OAF Bot / Auto Post / Execution Queue / Publishing Pipeline 阶段验收清单。
- `acceptance/MVP_ACCEPTANCE_CHECKLIST.md`：MVP 手动验收清单。
- `acceptance/ACCEPTANCE_RESULT.md`：本地 MVP 验收结果。

## Deployment

- `deployment/env.md`：环境变量说明。
- `deployment/DEPLOYMENT_SCRIPTS.md`：脚本化测试/生产部署说明。
- `deployment/prod-lite-deployment.md`：当前 t3.micro prod 轻量部署、健康检查与回滚 Runbook。
- `deployment/exposure-radar-release-readiness.md`：Exposure Radar 发布准备、验证与回滚清单。
- `deployment/x-publisher-gray-release.md`：X Publisher 单账号真实发布灰度 Runbook。

## Audits

- `audits/CONFIG_TEST_REVIEW.md`：测试配置结构审计。

## API / Database / Product

- `api/README.md`：API 文档入口。
- `database/tables.md`：数据库表说明。
- `database/er-diagram.md`：ER 图。
- `product/prd.md`：产品需求文档。
- `product/page-list.md`：页面清单。
- `product/roadmap.md`：产品路线图。
- `product/product-strength-optimization-plan.md`：产品力短板优化计划与完成度跟踪。
- `product/product-strength-next-optimization-plan.md`：PS-0 到 PS-9 之后的产品力增强计划与完成度跟踪。
- `product/current-product-strength-execution.md`：当前 9 项产品力收尾批次，包括 smoke、页面拆分、私有分析导入、学习闭环和兼容边界。
- `product/archive/legacy-automation-docs.md`：旧自动化设计文档历史归档入口。
- `product/oaf-bot-billing.md`：OAF Bot + Billing 会员体系。
- `product/oaf-bot-execution-mode.md`：OAF Bot 执行模式产品设计。
- `product/auto-post-oaf-bot-redesign.md`：Auto Post 在 OAF Bot 体系下的产品重设计。
- `product/publishing-pipeline.md`：统一发布器产品说明。
- `technical/oaf-bot-billing-tech-design.md`：OAF Bot + Billing 技术设计。
- `technical/oaf-bot-execution-mode-tech-design.md`：执行模式技术设计。
- `technical/auto-post-oaf-bot-redesign-tech-design.md`：Auto Post Planner / Content Library / Scheduler 技术设计。
- `technical/publishing-pipeline-tech-design.md`：Publishing Pipeline 技术设计。
- `technical/high-risk-legacy-data-migration-plan.md`：旧 `auto_post` 持久化字段、活动 key、AI scene 和 quota 字段的高风险迁移边界。
