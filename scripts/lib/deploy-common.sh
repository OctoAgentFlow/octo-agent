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

octo_ensure_port_free() {
  local label="$1"
  local port="$2"

  local port_pids
  port_pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "${port_pids:-}" ]; then
    return 0
  fi

  if [ "${ALLOW_KILL_PORT:-0}" = "1" ]; then
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
    running_pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "${running_pids:-}" ]; then
      echo "${running_pids%%$'\n'*}" >"$pid_file"
      echo "[$label] deploy success (listen_pid=${running_pids%%$'\n'*}, port=$port)"
      return 0
    fi

    sleep "$interval_seconds"
    elapsed=$((elapsed + interval_seconds))
  done

  echo "[$label] deploy failed: port $port did not listen within ${timeout_seconds}s"
  return 1
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
