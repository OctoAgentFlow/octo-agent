# RUNTIME_INSTALL_RUNBOOK

## 目标

本文档说明如何在测试服务器上为 Octo-Agent 独立安装运行时：

- Go `1.25+`
- Node.js `20.9+`
- npm `10+`

原则：

- 不覆盖系统默认 Go/Node/npm。
- 不影响服务器已有项目。
- 仅在 `/opt/octo-agent/runtime` 下安装 Octo-Agent 专用运行时。
- systemd 通过 `PATH` 优先使用 Octo-Agent 专用运行时。

## 目录约定

```text
/opt/octo-agent/runtime/
  go/
    go1.25.0/
    current -> /opt/octo-agent/runtime/go/go1.25.0
  node/
    node-v20.9.0-linux-x64/
    current -> /opt/octo-agent/runtime/node/node-v20.9.0-linux-x64
```

系统默认运行时保持不变：

```bash
go version
node -v
npm -v
```

Octo-Agent 专用运行时通过完整路径验证：

```bash
/opt/octo-agent/runtime/go/current/bin/go version
/opt/octo-agent/runtime/node/current/bin/node -v
/opt/octo-agent/runtime/node/current/bin/npm -v
```

## 推荐安装方式

在测试服务器上进入仓库目录后执行：

```bash
bash scripts/install-runtime-test.sh
```

该脚本只针对测试环境，默认安装：

| 运行时 | 默认版本 | 安装位置 |
| --- | --- | --- |
| Go | `1.25.0` | `/opt/octo-agent/runtime/go` |
| Node.js | `20.9.0` | `/opt/octo-agent/runtime/node` |
| npm | `10` | Node 独立目录内 |

如需调整小版本，可以用环境变量覆盖：

```bash
GO_VERSION=1.25.0 NODE_VERSION=20.9.0 NPM_VERSION=10 bash scripts/install-runtime-test.sh
```

## systemd PATH 约定

后端服务：

```ini
Environment=PATH=/opt/octo-agent/runtime/go/current/bin:/opt/octo-agent/runtime/node/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

前端服务：

```ini
Environment=PATH=/opt/octo-agent/runtime/node/current/bin:/opt/octo-agent/runtime/go/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

这样 `octo-*` systemd 服务会优先使用 Octo-Agent 独立 Go/Node/npm，而服务器原有 Node 18、npm 9、Go 1.22 继续留给旧项目使用。

## 部署前验证

```bash
/opt/octo-agent/runtime/go/current/bin/go version
/opt/octo-agent/runtime/node/current/bin/node -v
/opt/octo-agent/runtime/node/current/bin/npm -v
```

预期：

- Go 输出 `go1.25.x`。
- Node.js 输出 `v20.9.0` 或更高 `20.x` 版本。
- npm 输出 `10.x`。

## 保护规则

- 不修改 `/usr/local/go`。
- 不修改 `/usr/bin/node`、`/usr/bin/npm`。
- 不修改系统 shell profile。
- 不修改服务器已有项目的 PM2、systemd、Nginx 配置。
- 不写入任何密钥。
