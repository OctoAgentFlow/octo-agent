# SERVER_AUDIT

## 审计范围

- 测试服务器：`ubuntu@18.140.134.147`
- 审计时间：2026-05-13，Asia/Shanghai
- 审计方式：SSH 远程只读命令
- 本次未部署、未写入远端文件、未重启服务、未 kill 进程、未 reload Nginx、未写入密钥、未修改数据库。

## 执行过的只读命令摘要

```bash
ssh ubuntu@18.140.134.147 'hostname; whoami; id'
ssh ubuntu@18.140.134.147 'cat /etc/os-release; uname -a; hostnamectl'
ssh ubuntu@18.140.134.147 'go version; node -v; npm -v; git --version; mysql --version; mysqld --version; nginx -v'
ssh ubuntu@18.140.134.147 'sudo -n ss -lntp'
ssh ubuntu@18.140.134.147 'sudo -n nginx -T'
ssh ubuntu@18.140.134.147 'systemctl list-units --type=service --state=running'
ssh ubuntu@18.140.134.147 'df -h / /opt; du -sh /opt; test -e /opt/octo-agent; test -e /etc/octo-agent'
```

说明：

- `sudo` 均使用 `-n`，不会触发交互输入。
- Nginx 配置只提取 `server_name`、`listen`、`proxy_pass`，未保存完整配置内容。

## 1. 系统版本

| 项目 | 值 |
| --- | --- |
| Hostname | `ip-172-31-0-249` |
| OS | Ubuntu 24.04.3 LTS |
| Codename | `noble` |
| Kernel | `Linux 6.14.0-1015-aws` |
| Architecture | `x86_64` |
| Virtualization | `xen` |
| 当前远端时间 | `2026-05-12T16:43:16+00:00` |

原始摘要：

```text
PRETTY_NAME="Ubuntu 24.04.3 LTS"
Linux ip-172-31-0-249 6.14.0-1015-aws #15~24.04.1-Ubuntu SMP Tue Sep 23 22:44:48 UTC 2025 x86_64
```

## 2. 当前用户

| 项目 | 值 |
| --- | --- |
| SSH 用户 | `ubuntu` |
| UID/GID | `uid=1000(ubuntu) gid=1000(ubuntu)` |
| 用户组 | `ubuntu`, `adm`, `cdrom`, `sudo`, `dip`, `lxd` |

结论：

- 当前用户属于 `sudo` 组。
- 本次 `sudo -n ss -lntp` 和 `sudo -n nginx -T` 均可执行。

## 3. 工具版本

| 工具 | 当前版本 | 项目建议/要求 | 审计结论 |
| --- | --- | --- | --- |
| Go | `go1.22.2 linux/amd64` | 项目 `backend/go.mod` 为 Go `1.25.0` | 需要升级 |
| Node.js | `v18.19.1` | 项目文档建议 Node.js 20+ | 需要升级 |
| npm | `9.2.0` | 项目文档建议 npm 10+ | 需要升级 |
| git | `2.43.0` | 可用 | 可用 |
| mysql client | `8.0.45-0ubuntu0.24.04.1` | 可用 | 可用 |
| mysqld | `command not found` | 如使用远程 RDS 则不需要本机 mysqld | 本机未安装/未暴露 mysqld |
| Nginx | `nginx/1.24.0 (Ubuntu)` | 可用 | 可用 |

部署前风险：

- 当前 Go/Node/npm 版本低于项目文档要求，直接在测试服务器构建可能失败。
- 如果采用本机构建，需要先升级 Go 到 1.25+、Node 到 20+、npm 到 10+。
- 如果采用 CI/本地构建后上传产物，服务器仍至少需要 Node 20+ 来运行 Next.js 16 生产服务。

## 4. 当前监听端口

命令：

```bash
sudo -n ss -lntp
```

监听摘要：

| 端口 | 监听地址 | 进程 |
| --- | --- | --- |
| `22` | `0.0.0.0`, `[::]` | `sshd` |
| `53` | `127.0.0.53`, `127.0.0.54` | `systemd-resolve` |
| `80` | `0.0.0.0` | `nginx` |
| `443` | `0.0.0.0` | `nginx` |
| `3000` | `*` | `next-server`, PID `275301` |
| `3300` | `*` | `next-server`, PID `301421` |
| `3310` | `*` | `next-server`, PID `1336304` |
| `4000` | `0.0.0.0` | `next-server`, PID `298424` |
| `4010` | `0.0.0.0` | `next-server`, PID `1334779` |
| `4016` | `*` | `next-server`, PID `1201324` |
| `4030` | `0.0.0.0` | `next-server`, PID `688504` |
| `4101` | `0.0.0.0` | `MainThread` / Vite preview, PID `1700580` |
| `4102` | `0.0.0.0` | `MainThread` / Vite preview, PID `1700469` |
| `5000` | `*` | `next-server`, PID `275309` |
| `5002` | `*` | `PM2 v6.0.14`, PID `275242` |
| `8011` | `*` | `oas-api-linux`, PID `1342597` |
| `8012` | `*` | `admin-api-linux`, PID `1342475` |
| `8015` | `*` | `poly-api-linux`, PID `1219198` |
| `8016` | `*` | `admin-poly-api-linux`, PID `1219312` |
| `8081` | `*` | `backend`, PID `1700308` |
| `8082` | `*` | `admin`, PID `1700369` |
| `8090` | `*` | `amr-serv`, PID `172830` |
| `9001` | `*` | `aet-api-linux`, PID `1256497` |
| `9002` | `*` | `admin-api-linux`, PID `1257208` |

说明：

- 服务器上已经运行多个已有项目。
- 本次只记录进程名和 PID，未处理任何进程。

## 5. 目标端口占用情况

| 端口 | 计划用途 | 当前状态 | 进程名 | PID | 结论 |
| --- | --- | --- | --- | --- | --- |
| `3000` | `api-front` 默认端口 | 已占用 | `next-server` | `275301` | 不建议复用 |
| `3001` | `admin-front` 默认端口 | 未占用 | - | - | 可用 |
| `10001` | `api` 默认端口 | 未占用 | - | - | 可用 |
| `10002` | `admin-api` 默认端口 | 未占用 | - | - | 可用 |
| `4100` | 备选 `api-front` | 未占用 | - | - | 可用 |
| `4101` | 备选 `admin-front` | 已占用 | `MainThread` / Vite preview | `1700580` | 不建议复用 |
| `11001` | 备选 `api` | 未占用 | - | - | 可用 |
| `11002` | 备选 `admin-api` | 未占用 | - | - | 可用 |

关键结论：

- 默认四服务端口中，`3000` 已被占用。
- 备选四服务端口中，`4101` 已被占用。
- 当前不能无脑采用 `3000/3001/10001/10002`，也不能无脑采用 `4100/4101/11001/11002`。

## 6. Nginx 配置摘要

命令：

```bash
sudo -n nginx -T
```

本节只总结 `server_name`、`listen`、`proxy_pass`。

| server_name | listen | proxy_pass |
| --- | --- | --- |
| `test.aethelon.xyz` | `80` | `http://127.0.0.1:4030` |
| `testadmin.aethelon.xyz` | `80` | `http://127.0.0.1:5002` |
| `amrprotocol.io dev.amrprotocol.io` | `80` | `http://127.0.0.1:3000` |
| `test.diamond-living.com` | `443 ssl` | `http://127.0.0.1:8081`, `http://127.0.0.1:4101` |
| `testadmin.diamond-living.com` | `443 ssl` | `http://127.0.0.1:8082`, `http://127.0.0.1:4102` |
| `test.diamond-living.com` | `80` | `http://127.0.0.1:8081`, `http://127.0.0.1:4101` |
| `testadmin.diamond-living.com` | `80` | `http://127.0.0.1:8082`, `http://127.0.0.1:4102` |
| `_` | `80 default_server` | `http://127.0.0.1:4101` |
| `test.openai.study` | `80` | `http://127.0.0.1:4010` |
| `devoas.amrprotocol.io` | `80` | `http://127.0.0.1:4000` |
| `testadmin.openai.study` | `80` | `http://127.0.0.1:8012`, `http://127.0.0.1:3310` |
| `devoasadmin.amrprotocol.io` | `80` | `http://127.0.0.1:3300` |
| `devoasorder.amrprotocol.io` | `80` | `http://127.0.0.1:5000` |
| `test.polymaster.pro` | `80` | `http://127.0.0.1:4015` |
| `testadmin.polymaster.pro` | `80` | `http://127.0.0.1:4016` |

Nginx 结论：

- Nginx 正在监听 `80` 和 `443`。
- 当前已有多个测试域名和项目。
- `3000`、`4101`、`4102` 已被 Nginx 代理链路使用。
- 如果部署 Octo-Agent，需要新增独立 `server_name`，并选择未占用端口。
- 本次未执行 `nginx -t` 或 `nginx reload`，只执行配置打印审计。

## 7. systemd 运行服务审计

命令：

```bash
systemctl list-units --type=service --state=running --no-pager --plain
systemctl list-unit-files --type=service --no-pager --plain
```

与 Node、Go、octo、nginx、mysql 相关的 running service：

| 服务 | 状态 | 说明 |
| --- | --- | --- |
| `nginx.service` | `active running` | Nginx 正在 systemd 下运行 |

相关 unit file：

| 服务 | 状态 |
| --- | --- |
| `nginx.service` | `enabled` |

结论：

- 未发现正在运行的 `octo-*` systemd 服务。
- 未发现正在运行的 MySQL systemd 服务。
- 未发现 Node/Go 应用由 systemd 管理。
- 服务器上有多个 Node/Go 进程，但多数看起来由 PM2、直接二进制、`go run` 或 shell 启动，不是 systemd service。

## 8. Node / Go / API 相关进程摘要

只读 `ps` 摘要显示：

| PID | 用户 | 进程 | 摘要 |
| --- | --- | --- | --- |
| `275242` | `ubuntu` | `PM2 v6.0.14` | PM2 daemon |
| `275301` | `ubuntu` | `next-server` | Next.js on `3000` |
| `275309` | `ubuntu` | `next-server` | Next.js on `5000` |
| `298424` | `ubuntu` | `next-server` | Next.js on `4000` |
| `301421` | `ubuntu` | `next-server` | Next.js on `3300` |
| `688504` | `ubuntu` | `next-server` | Next.js on `4030` |
| `1201324` | `ubuntu` | `next-server` | Next.js on `4016` |
| `1219198` | `ubuntu` | `poly-api-linux` | API binary |
| `1219312` | `ubuntu` | `admin-poly-api-linux` | Admin API binary |
| `1256497` | `ubuntu` | `aet-api-linux` | API binary |
| `1257208` | `ubuntu` | `admin-api-linux` | Admin API binary |
| `1334779` | `ubuntu` | `next-server` | Next.js on `4010` |
| `1336304` | `ubuntu` | `next-server` | Next.js on `3310` |
| `1342475` | `ubuntu` | `admin-api-linux` | Admin API binary |
| `1342597` | `ubuntu` | `oas-api-linux` | API binary |
| `1700308` | `ubuntu` | `backend` | Go process on `8081` |
| `1700369` | `ubuntu` | `admin` | Go process on `8082` |
| `1700469` | `ubuntu` | `MainThread` | Vite preview on `4102` |
| `1700580` | `ubuntu` | `MainThread` | Vite preview on `4101` |

结论：

- 测试服务器已经承载多个项目，不建议使用易冲突的默认前端端口。
- 当前 Go/Node 进程命名与 Octo-Agent 无关，未发现 `/opt/octo-agent` 部署痕迹。

## 9. /opt 目录空间和磁盘空间

命令：

```bash
df -h / /opt
du -sh /opt
```

结果：

| 路径 | 文件系统 | 总量 | 已用 | 可用 | 使用率 |
| --- | --- | --- | --- | --- | --- |
| `/` | `/dev/root` | `484G` | `35G` | `450G` | `8%` |
| `/opt` | `/dev/root` | `484G` | `35G` | `450G` | `8%` |

`/opt` 当前占用：

```text
4.0K /opt
```

结论：

- 磁盘空间充足。
- `/opt` 基本为空，适合作为 Octo-Agent 非 Docker 部署目录。

## 10. 目录存在性

| 路径 | 状态 |
| --- | --- |
| `/opt/octo-agent` | 不存在 |
| `/etc/octo-agent` | 不存在 |

结论：

- 尚未创建 Octo-Agent 测试部署目录。
- 后续部署前需要创建目录，但本次未创建。

## 11. 推荐测试环境四服务端口方案

### 方案 A：复用本地默认端口

| 服务 | 端口 | 当前状态 | 建议 |
| --- | --- | --- | --- |
| `api-front` | `3000` | 已占用 | 不建议 |
| `admin-front` | `3001` | 未占用 | 可用，但不建议只使用半套默认端口 |
| `api` | `10001` | 未占用 | 可用 |
| `admin-api` | `10002` | 未占用 | 可用 |

结论：

- 不建议完整复用 `3000/3001/10001/10002`，因为 `3000` 已被现有 Next.js 项目占用。

### 方案 B：使用备选端口

| 服务 | 端口 | 当前状态 | 建议 |
| --- | --- | --- | --- |
| `api-front` | `4100` | 未占用 | 可用 |
| `admin-front` | `4101` | 已占用 | 不建议 |
| `api` | `11001` | 未占用 | 可用 |
| `admin-api` | `11002` | 未占用 | 可用 |

结论：

- 不建议完整采用 `4100/4101/11001/11002`，因为 `4101` 已被现有 Vite preview 占用。

### 推荐方案 C：避开已占用端口的新端口组

建议使用：

| 服务 | 推荐端口 | 原因 |
| --- | --- | --- |
| `api-front` | `4200` | 当前未发现监听，避开 `3000`、`4101`、`4102` |
| `admin-front` | `4201` | 当前未发现监听，和 `api-front` 成组 |
| `api` | `11001` | 当前未发现监听，避开已有 `8081` 等项目端口 |
| `admin-api` | `11002` | 当前未发现监听，和 `api` 成组 |

推荐结论：

- 优先采用 `4200/4201/11001/11002`。
- 如果必须在你给出的两组方案中二选一，则后端可使用 `11001/11002`，前端不能使用完整 `4100/4101`，因为 `4101` 已占用。
- 若坚持使用默认后端 `10001/10002` 也可行，但为了和测试服务器已有项目隔离，更推荐后端使用 `11001/11002`。

## 12. 推荐 Nginx 代理模型

后续部署时推荐新建独立域名，例如：

| 域名 | 代理 |
| --- | --- |
| `octo-test.example.com` | `/` -> `127.0.0.1:4200`，`/api/` -> `127.0.0.1:11001/api/` |
| `octo-admin-test.example.com` | `/` -> `127.0.0.1:4201`，`/api/` -> `127.0.0.1:11002/api/` |

对应前端构建环境：

| 前端 | `NEXT_PUBLIC_FRONTEND_ROLE` | `NEXT_PUBLIC_API_BASE_URL` |
| --- | --- | --- |
| `api-front` | `api` | `https://octo-test.example.com/api/v1` |
| `admin-front` | `admin` | `https://octo-admin-test.example.com/api/v1` |

后端 YAML：

| 服务 | 配置 |
| --- | --- |
| `api` | `api.port: 11001` |
| `admin-api` | `admin.port: 11002` |
| X OAuth callback | `https://octo-test.example.com/api/v1/accounts/oauth/x/callback` |
| frontend redirect | `https://octo-test.example.com` |

## 13. 测试服务器部署前风险清单

| 风险 | 当前状态 | 建议 |
| --- | --- | --- |
| Go 版本不足 | 当前 `go1.22.2`，项目要求 Go `1.25.0` | 部署前升级 Go 或上传已构建二进制 |
| Node 版本不足 | 当前 `v18.19.1`，项目建议 Node 20+ | 部署前升级 Node |
| npm 版本不足 | 当前 `9.2.0`，项目建议 npm 10+ | 部署前升级 npm |
| 默认前端端口冲突 | `3000` 已占用 | 不使用 `3000` |
| 备选前端端口冲突 | `4101` 已占用 | 不使用 `4101` |
| Octo-Agent 目录不存在 | `/opt/octo-agent`、`/etc/octo-agent` 不存在 | 部署阶段再创建 |
| Nginx 已承载多个项目 | 多个 `server_name` 和 `proxy_pass` 已存在 | 新增独立域名和端口，避免覆盖现有配置 |
| systemd 尚无 Octo 服务 | 未发现 `octo-*` service | 部署阶段新增 systemd unit |

## 14. 本次审计结论

测试服务器当前可以作为 Octo-Agent 非 Docker 部署目标，但部署前需要处理：

1. 升级运行时：Go、Node、npm。
2. 避开已占用端口：不要使用 `3000`，不要使用 `4101`。
3. 新增独立 Nginx server_name，不覆盖已有项目。
4. 新增 `/opt/octo-agent` 和 `/etc/octo-agent` 目录。
5. 新增 systemd 服务，但需要等部署确认后再执行。

推荐端口方案：

```text
api-front:   4200
admin-front: 4201
api:         11001
admin-api:   11002
```

是否已部署：

- 否。

是否可以继续部署：

- 等待用户确认。
