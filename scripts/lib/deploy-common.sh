#!/usr/bin/env bash

octo_print_recent_log() {
  local label="$1"
  local log_file="$2"
  local lines="${3:-80}"

  if [ -f "$log_file" ]; then
    echo "[$label] recent log: $log_file"
    tail -n "$lines" "$log_file"
  else
    echo "[$label] log file not found: $log_file"
  fi
}

octo_send_deploy_alert() {
  local label="$1"
  local status="$2"
  local exit_code="${3:-0}"
  local failed_command="${4:-}"

  local webhook_url="${DEPLOY_ALERT_WEBHOOK_URL:-}"
  if [ -z "${webhook_url:-}" ] || [ "${DEPLOY_ALERT_ENABLED:-1}" = "0" ]; then
    return 0
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    echo "[$label] deploy alert skipped: python3 not found"
    return 0
  fi

  DEPLOY_ALERT_WEBHOOK_URL="$webhook_url" \
  DEPLOY_ALERT_LABEL="$label" \
  DEPLOY_ALERT_STATUS="$status" \
  DEPLOY_ALERT_EXIT_CODE="$exit_code" \
  DEPLOY_ALERT_FAILED_COMMAND="$failed_command" \
  DEPLOY_ALERT_ROOT_DIR="${ROOT_DIR:-}" \
  DEPLOY_ALERT_LOG_FILE="${LOG_FILE:-}" \
  DEPLOY_ALERT_PID_FILE="${PID_FILE:-}" \
  DEPLOY_ALERT_PORT="${PORT:-}" \
  DEPLOY_ALERT_HOST="${HOST:-}" \
  DEPLOY_ALERT_APP_ENV="${APP_ENV_VALUE:-}" \
  DEPLOY_ALERT_APP_SERVICE="${APP_SERVICE_VALUE:-}" \
  DEPLOY_ALERT_FRONTEND_ROLE="${NEXT_PUBLIC_FRONTEND_ROLE_VALUE:-}" \
  DEPLOY_ALERT_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL_VALUE:-}" \
  python3 <<'PY' || true
import json
import os
import socket
import subprocess
import time
import urllib.request


def env(name, default=""):
    return os.environ.get(name, default).strip()


def git_value(root, *args):
    if not root:
        return ""
    try:
        return subprocess.check_output(
            ["git", "-C", root, *args],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=3,
        ).strip()
    except Exception:
        return ""


def tail_log(path, max_lines=18, max_chars=1800):
    if not path or not os.path.exists(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()[-max_lines:]
        return "".join(lines)[-max_chars:].strip()
    except Exception:
        return ""


def field(label, value):
    if value is None:
        value = ""
    value = str(value).strip()
    if not value:
        value = "-"
    return {
        "is_short": True,
        "text": {
            "tag": "lark_md",
            "content": f"**{label}**\n{value}",
        },
    }


webhook = env("DEPLOY_ALERT_WEBHOOK_URL")
label = env("DEPLOY_ALERT_LABEL")
status = env("DEPLOY_ALERT_STATUS")
exit_code = env("DEPLOY_ALERT_EXIT_CODE", "0")
failed_command = env("DEPLOY_ALERT_FAILED_COMMAND")
root = env("DEPLOY_ALERT_ROOT_DIR")
log_file = env("DEPLOY_ALERT_LOG_FILE")
pid_file = env("DEPLOY_ALERT_PID_FILE")
port = env("DEPLOY_ALERT_PORT")
host = env("DEPLOY_ALERT_HOST")
app_env = env("DEPLOY_ALERT_APP_ENV")
app_service = env("DEPLOY_ALERT_APP_SERVICE")
frontend_role = env("DEPLOY_ALERT_FRONTEND_ROLE")
api_base_url = env("DEPLOY_ALERT_API_BASE_URL")

status_text = "部署成功" if status == "success" else "部署失败"
template = "green" if status == "success" else "red"
summary = f"{label} {status_text}"
if status != "success" and failed_command:
    summary += f"\n失败命令：{failed_command}"

branch = git_value(root, "branch", "--show-current")
commit = git_value(root, "rev-parse", "--short", "HEAD")
commit_subject = git_value(root, "log", "-1", "--pretty=%s")

fields = [
    field("服务", label),
    field("状态", status_text),
    field("主机", socket.gethostname()),
    field("时间", time.strftime("%Y-%m-%d %H:%M:%S %Z", time.localtime())),
    field("环境", app_env or ("prod" if ":prod" in label else "test" if ":test" in label else "-")),
    field("端口", port),
    field("Git 分支", branch),
    field("Git 提交", f"{commit} {commit_subject}".strip()),
]
if app_service:
    fields.append(field("后端服务", app_service))
if frontend_role:
    fields.append(field("前端角色", frontend_role))
if host:
    fields.append(field("监听地址", host))
if api_base_url:
    fields.append(field("API Base URL", api_base_url))
if pid_file and os.path.exists(pid_file):
    try:
        fields.append(field("PID", open(pid_file, "r", encoding="utf-8").read().strip()))
    except Exception:
        pass
if status != "success":
    fields.append(field("退出码", exit_code))

elements = [
    {
        "tag": "div",
        "text": {"tag": "lark_md", "content": f"**摘要**\n{summary}"},
    },
    {"tag": "hr"},
    {"tag": "div", "fields": fields},
]

recent_log = tail_log(log_file)
if recent_log:
    safe_log = recent_log.replace("`", "'")
    elements.extend([
        {"tag": "hr"},
        {
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"**最近日志**\n```text\n{safe_log}\n```",
            },
        },
    ])

payload = {
    "msg_type": "interactive",
    "card": {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": template,
            "title": {"tag": "plain_text", "content": f"[{status_text}] {label}"},
        },
        "elements": elements,
    },
}

req = urllib.request.Request(
    webhook,
    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = resp.read(4096).decode("utf-8", errors="replace")
        if resp.status < 200 or resp.status >= 300:
            print(f"[{label}] deploy alert failed: http {resp.status} {body}")
        else:
            print(f"[{label}] deploy alert sent: {status}")
except Exception as exc:
    print(f"[{label}] deploy alert failed: {exc}")
PY
}

octo_deploy_failed() {
  local code="$1"
  local command="$2"
  echo "[$LABEL] deploy failed: $command (exit=$code)"
  octo_print_recent_log "$LABEL" "$LOG_FILE" 80
  octo_send_deploy_alert "$LABEL" "failed" "$code" "$command"
  exit "$code"
}

octo_stop_from_pid_file() {
  local label="$1"
  local pid_file="$2"

  if [ ! -f "$pid_file" ]; then
    return 0
  fi

  local old_pid
  old_pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -z "${old_pid:-}" ]; then
    rm -f "$pid_file"
    return 0
  fi

  if kill -0 "$old_pid" 2>/dev/null; then
    echo "[$label] stopping old pid from pid file: $old_pid"
    kill "$old_pid" 2>/dev/null || true

    local waited=0
    while kill -0 "$old_pid" 2>/dev/null && [ "$waited" -lt 20 ]; do
      sleep 1
      waited=$((waited + 1))
    done

    if kill -0 "$old_pid" 2>/dev/null; then
      echo "[$label] old pid still running after ${waited}s: $old_pid"
      echo "[$label] please stop it manually, then retry."
      exit 1
    fi
  fi

  rm -f "$pid_file"
}

octo_listen_pids() {
  local port="$1"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "${pids:-}" ]; then
    echo "$pids"
    return 0
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -lntp 2>/dev/null | awk -v port=":$port" '
      $0 ~ port {
        while (match($0, /pid=[0-9]+/)) {
          pid = substr($0, RSTART + 4, RLENGTH - 4)
          print pid
          $0 = substr($0, RSTART + RLENGTH)
        }
      }
    ' | sort -u
  fi
}

octo_is_port_listening() {
  local port="$1"

  if [ -n "$(octo_listen_pids "$port")" ]; then
    return 0
  fi

  if command -v ss >/dev/null 2>&1 && ss -lnt 2>/dev/null | awk -v port=":$port" '$0 ~ port { found = 1 } END { exit found ? 0 : 1 }'; then
    return 0
  fi

  return 1
}

octo_ensure_port_free() {
  local label="$1"
  local port="$2"

  local port_pids
  port_pids="$(octo_listen_pids "$port")"
  if [ -z "${port_pids:-}" ] && ! octo_is_port_listening "$port"; then
    return 0
  fi

  if [ "${ALLOW_KILL_PORT:-0}" = "1" ] && [ -n "${port_pids:-}" ]; then
    echo "[$label] ALLOW_KILL_PORT=1, stopping existing listener(s) on port $port: $port_pids"
    kill $port_pids 2>/dev/null || true
    sleep 1
    return 0
  fi

  echo "[$label] port $port is already occupied: $port_pids"
  echo "[$label] deployment will not kill unknown processes by default."
  echo "[$label] if this is the previous same service, ensure the pid file is correct or rerun with ALLOW_KILL_PORT=1."
  exit 1
}

octo_wait_for_port() {
  local label="$1"
  local port="$2"
  local pid_file="$3"
  local timeout_seconds="$4"
  local interval_seconds="$5"

  local elapsed=0
  while [ "$elapsed" -lt "$timeout_seconds" ]; do
    local running_pids
    running_pids="$(octo_listen_pids "$port")"
    if [ -n "${running_pids:-}" ] || octo_is_port_listening "$port"; then
      if [ -n "${running_pids:-}" ]; then
        echo "${running_pids%%$'\n'*}" >"$pid_file"
        echo "[$label] deploy success (listen_pid=${running_pids%%$'\n'*}, port=$port)"
      else
        echo "[$label] deploy success (port=$port)"
      fi
      return 0
    fi

    sleep "$interval_seconds"
    elapsed=$((elapsed + interval_seconds))
  done

  echo "[$label] deploy failed: port $port did not listen within ${timeout_seconds}s"
  return 1
}

octo_prepare_node_runtime() {
  local label="$1"

  if command -v node >/dev/null 2>&1 && node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)' >/dev/null 2>&1; then
    echo "[$label] node=$(node -v) npm=$(npm -v)"
    return 0
  fi

  local candidate
  for candidate in "$HOME"/.nvm/versions/node/v20*/bin "$HOME/.nvm/versions/node/v20.20.2/bin" "$HOME/.nvm/versions/node/v20.11.1/bin" "$HOME/.nvm/versions/node/v20.9.0/bin"; do
    if [ -x "$candidate/node" ]; then
      export PATH="$candidate:$PATH"
      break
    fi
  done

  if ! command -v node >/dev/null 2>&1 || ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)' >/dev/null 2>&1; then
    echo "[$label] Node.js 20.9+ is required. Current: $(node -v 2>/dev/null || echo not-found)"
    exit 1
  fi

  echo "[$label] node=$(node -v) npm=$(npm -v)"
}

octo_yaml_port() {
  local config_file="$1"
  local section="$2"

  awk -v section="$section" '
    $0 ~ "^" section ":" { inside = 1; next }
    inside && /^[^[:space:]]/ { inside = 0 }
    inside && /^[[:space:]]*port:[[:space:]]*/ {
      gsub(/"/, "", $2)
      print $2
      exit
    }
  ' "$config_file"
}

octo_assert_config_port() {
  local label="$1"
  local config_file="$2"
  local section="$3"
  local expected_port="$4"

  if [ ! -f "$config_file" ]; then
    echo "[$label] config file not found: $config_file"
    exit 1
  fi

  local actual_port
  actual_port="$(octo_yaml_port "$config_file" "$section")"
  if [ "$actual_port" != "$expected_port" ]; then
    echo "[$label] config port mismatch in $config_file"
    echo "[$label] expected $section.port=$expected_port, actual=$actual_port"
    exit 1
  fi
}
