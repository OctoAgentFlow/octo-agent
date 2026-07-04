<p align="center">
  <a href="README.md">English</a>
  ·
  <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://octoagentflow.github.io/octo-agent/">
    <img src="frontend/public/brand/oaf-octopus-icon.png" alt="OctoAgentFlow logo" width="96" />
  </a>
</p>

<h1 align="center">OctoAgentFlow</h1>

<p align="center">
  <strong>面向 X 账号的 AI 社交运营工作流。</strong>
</p>

<p align="center">
  <a href="https://octoagentflow.github.io/octo-agent/">官方首页</a>
  ·
  <a href="docs/README.zh-CN.md">文档</a>
  ·
  <a href="CONTRIBUTING.md">贡献指南</a>
  ·
  <a href="SECURITY.md">安全策略</a>
  ·
  <a href="SUPPORT.md">支持</a>
</p>

<p align="center">
  <a href="https://github.com/OctoAgentFlow/octo-agent/releases">
    <img alt="Release" src="https://img.shields.io/github/v/release/OctoAgentFlow/octo-agent?label=release" />
  </a>
  <a href="LICENSE">
    <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green.svg" />
  </a>
  <a href="https://github.com/OctoAgentFlow/octo-agent/actions/workflows/validate.yml">
    <img alt="Validate" src="https://github.com/OctoAgentFlow/octo-agent/actions/workflows/validate.yml/badge.svg" />
  </a>
</p>

## 官方首页

公开官网通过 GitHub Pages 部署：

[https://octoagentflow.github.io/octo-agent/](https://octoagentflow.github.io/octo-agent/)

<a href="https://octoagentflow.github.io/octo-agent/">
  <img src="docs/assets/official-homepage-desktop-zh-CN.png" alt="OctoAgentFlow 官方首页桌面端截图" />
</a>

<p align="center">
  <img src="docs/assets/official-homepage-mobile-zh-CN.png" alt="OctoAgentFlow 官方首页移动端截图" width="260" />
</p>

## 这是什么

OctoAgentFlow 帮助运营者用 OAF Bot、内容记忆、护栏、审核队列、执行队列、
发布工作流和人工反馈，来运行可控的 X 账号社交运营流程。

它不是“全自动涨粉机器人”。当前产品方向是安全的人工确认式运营，由 AI
辅助发现机会、生成草稿、沉淀记忆并跟踪结果。

## 核心模块

- Daily Growth Desk：面向 X 增长工作的日常运营工作台。
- Exposure Radar：中英文机会信号、热门/上升分类、诊断、回复角度建议和手动处理记录。
- OAF Bots：为每个 X 账号配置人设、语气、主题、边界和学习偏好。
- Content Memory：复用产品要点、信号上下文、回复学习和来源记录。
- Content Drafts：基于人设、记忆和机会上下文生成可复制的发帖或回复草稿。
- Handling List：审核、编辑、复制、打开原帖、记录处理结果并追踪后续动作。
- Account Intelligence：基于系统可合法访问的数据，对公开账号做定位分析和改进建议。

## 技术栈

- 前端：Next.js App Router、React、Tailwind CSS、shadcn-style components、React Hook Form、Zod。
- 后端：Gin、GORM、MySQL。
- 工具：`Makefile`、smoke checks 和兼容性检查脚本。
- 官网部署：通过 `.github/workflows/deploy-website.yml` 部署到 GitHub Pages。

## 本地开发

前置要求：

- Node.js 22+
- npm 10+
- Go 1.25+
- MySQL 8+

安装依赖：

```bash
make install
```

准备本地环境文件：

```bash
cp backend/configs/.env.example backend/configs/.env
cp frontend/.env.example frontend/.env.local
```

分别在不同终端启动服务：

```bash
make api-local
make admin-local
make api-front-local
make admin-front-local
```

默认本地地址：

- API Front：`http://localhost:3000`
- Admin Front：`http://localhost:3001`
- API 服务：`http://localhost:10001`
- Admin API 服务：`http://localhost:10002`

## 常用命令

```bash
make lint
scripts/smoke-core-workflows.sh
scripts/check-legacy-compat-contracts.sh
cd frontend && npm run build:github-pages
```

## 仓库结构

- `frontend/`：Next.js 应用和 GitHub Pages 官网导出脚本。
- `backend/`：Gin API 与 Admin API 服务。
- `scripts/`：本地开发、smoke 检查和兼容性检查辅助脚本。
- `docs/`：公开 API、数据库和官网相关参考文档。

私有部署 runbook、发布说明、增长计划和验收报告不会包含在此公开仓库中。

## 安全

不要提交 `.env` 文件、API key、OAuth secret、数据库凭据、钱包私钥、生产支付地址、
日志或私有 runbook。

漏洞报告请参考 [SECURITY.md](SECURITY.md)。

## 贡献

欢迎围绕核心社交运营工作流、开发体验、文档质量和安全性进行贡献。

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，并遵守
[Code of Conduct](CODE_OF_CONDUCT.md)。

## 支持

可复现的 bug、文档修复和聚焦的功能建议请使用 GitHub Issues。安全漏洞请通过
[GitHub Security Advisories](SECURITY.md) 私下报告。

## 许可证

OctoAgentFlow 使用 [MIT License](LICENSE) 开源。
