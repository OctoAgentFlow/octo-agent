# SCRIPT_AUDIT_RESULT

## 审计范围

本次只做本地静态审计，未执行任何脚本，未连接服务器，未修改被审计脚本或配置文件。

审计文件：

- `scripts/install-runtime-test.sh`
- `scripts/deploy-test-non-docker.sh`
- `scripts/rollback-test-non-docker.sh`
- `deploy/systemd/octo-api.service`
- `deploy/systemd/octo-admin-api.service`
- `deploy/systemd/octo-api-front.service`
- `deploy/systemd/octo-admin-front.service`
- `deploy/nginx/octo-test.conf`

## 总体结论

| 项目 | 结论 |
| --- | --- |
| 是否可以执行 `install-runtime-test.sh` | 可以 |
| 是否可以执行 `deploy-test-non-docker.sh` | 可以，但前提是测试服务器已准备 `/etc/octo-agent/test/config.test.api.yaml`、`/etc/octo-agent/test/config.test.admin.yaml`、独立 runtime、DNS/Nginx 基础条件 |
| 是否需要先修正脚本 | 不需要阻塞性修正；建议后续增强 rollback 的外部路由隔离检查 |

## 逐项审计结果

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 1. 是否会 kill 任何已有进程 | 不会 | 三个脚本未出现 `kill`、`pkill`、`killall`。`deploy` 和 `rollback` 只执行 `systemctl restart octo-*`，仅影响 Octo-Agent 自有服务。 |
| 2. 是否会覆盖已有 Nginx 配置 | 不会覆盖已有不同内容 | `scripts/deploy-test-non-docker.sh` 使用 `/etc/nginx/conf.d/octo-agent-test.conf`；如果目标文件已存在且内容不同，会 `exit 1`，拒绝覆盖。 |
| 3. 是否会删除数据库或修改数据库数据 | 未发现直接数据库删除/修改命令 | 脚本未出现 `mysql`、`DROP`、`TRUNCATE`、`DELETE FROM` 等命令。`deploy` 会执行 `go test ./...`，当前测试文件均为占位或纯单元测试/HTTP mock，未发现数据库写入。 |
| 4. 是否会修改生产环境 | 不会 | 三个脚本均通过 `OCTO_ENV` 限制为 `test`，默认 `test`，非 `test` 直接退出。 |
| 5. 是否会改系统默认 Go/Node/npm | 不会 | runtime 安装目录为 `/opt/octo-agent/runtime`；systemd 通过 `PATH` 优先使用独立 runtime，未写 `/usr/local/go`、`/usr/bin/node`、`/usr/bin/npm`。 |
| 6. 是否会写死密钥 | 不会 | 脚本和 systemd 文件未写入真实密钥；默认 env 只包含 `APP_ENV=test`、`EMAIL_PROVIDER=local`、`APP_SERVICE=api/admin`、前端公开 API URL。 |
| 7. 是否全部使用测试环境域名 | 是 | `deploy` 默认 `test.octo-agent.com` / `testadmin.octo-agent.com`；Nginx server_name 同步为这两个域名。 |
| 8. 是否全部使用测试环境端口 | 是 | `api=11001`、`admin-api=11002`、`api-front=4200`、`admin-front=4201`；systemd 和 Nginx 均一致。 |
| 9. 是否使用 `/etc/octo-agent/test` 私有配置 | 是 | `deploy` 默认 `PRIVATE_DIR=/etc/octo-agent/test`；systemd `EnvironmentFile` 也指向该目录。 |
| 10. `config.test.*.yaml` 是否软链接到私有配置 | 是 | `deploy` 删除 release 内复制出的 `backend/configs/config.test.api.yaml` / `config.test.admin.yaml`，随后创建到 `/etc/octo-agent/test/config.test.api.yaml` / `config.test.admin.yaml` 的软链接。 |
| 11. systemd 是否通过 PATH 使用独立 runtime | 是 | 四个 unit 均设置 `Environment=PATH=/opt/octo-agent/runtime/...`。 |
| 12. 是否失败即退出 | 是 | 三个脚本均包含 `set -Eeuo pipefail`。 |
| 13. 是否有端口占用检查 | 有 | `deploy` 中 `check_port_available_or_owned_by_service` 使用 `ss -lnt` 检查四个目标端口；若端口被非活跃 Octo 服务占用则退出。 |
| 14. 是否有 health check | 有 | `deploy` 有内部 health check、前端检查、Nginx 外部检查；`rollback` 有内部 health check。 |
| 15. 是否有 API 路由隔离检查 | deploy 有，rollback 无 | `deploy` 检查用户域名 Admin API 返回 `404`，后台域名用户验证码接口返回 `404`；`rollback` 当前只检查内部 health。 |
| 16. Nginx 是否只新增独立配置 | 是 | 配置目标为 `/etc/nginx/conf.d/octo-agent-test.conf`；Nginx 模板文件为 `deploy/nginx/octo-test.conf`。 |

## 关键安全点

- `scripts/install-runtime-test.sh` 只会写 `/opt/octo-agent/runtime` 下的 Go/Node 目录，并更新该目录内的 `current` 软链接。
- `scripts/deploy-test-non-docker.sh` 不会 kill 旧项目进程；如果目标端口被非 Octo 服务占用，会直接退出。
- `scripts/deploy-test-non-docker.sh` 不会覆盖已有不同内容的 Nginx 配置。
- `scripts/deploy-test-non-docker.sh` 会 reload Nginx，但仅在 `nginx -t` 通过之后执行。
- `scripts/rollback-test-non-docker.sh` 不删除 release、数据库或配置，只切换 `/opt/octo-agent/current` 软链接并重启 Octo-Agent 自有服务。

## 发现的问题与建议

### P1：rollback 缺少外部路由隔离检查

`scripts/rollback-test-non-docker.sh` 当前只检查：

- `127.0.0.1:11001/health`
- `127.0.0.1:11002/health`
- `127.0.0.1:11002/admin/health`
- `127.0.0.1:4200`
- `127.0.0.1:4201`

建议后续补充和 deploy 一致的外部域名及路由隔离检查：

- `http(s)://test.octo-agent.com/api/v1/dashboard/overview` 预期 `401`
- `http(s)://testadmin.octo-agent.com/api/v1/admin/overview` 预期 `401`
- `http(s)://test.octo-agent.com/api/v1/admin/overview` 预期 `404`
- `http(s)://testadmin.octo-agent.com/api/v1/auth/email-code/send` 预期 `404`

该问题不阻塞 `install-runtime-test.sh` 和 `deploy-test-non-docker.sh` 执行。

### P2：deploy 未静态校验私有 YAML 的端口和域名

`deploy` 会要求 `/etc/octo-agent/test/config.test.api.yaml` 和 `/etc/octo-agent/test/config.test.admin.yaml` 存在，但不会在部署前解析并校验：

- `api.port = 11001`
- `admin.port = 11002`
- `app.frontend_base_url = https://test.octo-agent.com`
- `x_oauth.redirect_uri = https://test.octo-agent.com/api/v1/accounts/oauth/x/callback`

如果私有 YAML 写错，服务启动或 health check 阶段会失败。建议后续增加部署前 YAML 校验，但当前不构成安全风险。

## 执行前条件

执行 `install-runtime-test.sh` 前：

- 测试服务器允许访问 Go/Node 官方下载地址。
- 当前用户有权限写 `/opt/octo-agent/runtime`，或具备 sudo 权限。

执行 `deploy-test-non-docker.sh` 前：

- 已执行或手动完成独立 runtime 安装。
- 已准备 `/etc/octo-agent/test/config.test.api.yaml` 和 `/etc/octo-agent/test/config.test.admin.yaml`，且其中不包含会被提交到 git 的真实密钥。
- 已确认 `test.octo-agent.com` 和 `testadmin.octo-agent.com` DNS 指向测试服务器。
- 已确认 `4200`、`4201`、`11001`、`11002` 未被非 Octo 服务占用。
- 已确认可以新增 `/etc/nginx/conf.d/octo-agent-test.conf`。

## 最终判断

`install-runtime-test.sh` 可以执行。

`deploy-test-non-docker.sh` 可以执行，但需要先准备测试私有配置和独立 runtime。

当前不需要先修正脚本；建议在下一轮补强 rollback 的外部路由隔离检查和 deploy 的私有 YAML 静态校验。
