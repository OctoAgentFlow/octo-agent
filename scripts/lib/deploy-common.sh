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
  for candidate in "$HOME/.nvm/versions/node/v20.11.1/bin" "$HOME/.nvm/versions/node/v20.9.0/bin" "$HOME/.nvm/versions/node/v20.20.2/bin"; do
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
