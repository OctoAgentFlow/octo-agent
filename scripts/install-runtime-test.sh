#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

GO_VERSION="${GO_VERSION:-1.25.0}"
NODE_VERSION="${NODE_VERSION:-20.9.0}"
NPM_VERSION="${NPM_VERSION:-10}"
RUNTIME_ROOT="${RUNTIME_ROOT:-/opt/octo-agent/runtime}"

if [[ "${OCTO_ENV:-test}" != "test" ]]; then
  echo "This installer is only for the Octo-Agent test environment." >&2
  exit 1
fi

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd curl
require_cmd tar
require_cmd uname

case "$(uname -m)" in
  x86_64|amd64)
    GO_ARCH="amd64"
    NODE_ARCH="x64"
    ;;
  aarch64|arm64)
    GO_ARCH="arm64"
    NODE_ARCH="arm64"
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

GO_ROOT="${RUNTIME_ROOT}/go"
NODE_ROOT="${RUNTIME_ROOT}/node"
GO_TARGET="${GO_ROOT}/go${GO_VERSION}"
NODE_TARGET="${NODE_ROOT}/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Installing Octo-Agent test runtimes under ${RUNTIME_ROOT}"
echo "System Go/Node/npm will not be modified."

"${SUDO[@]}" mkdir -p "${GO_ROOT}" "${NODE_ROOT}"

if [[ ! -d "${GO_TARGET}" ]]; then
  GO_TARBALL="${TMP_DIR}/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
  echo "Downloading Go ${GO_VERSION}..."
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -o "${GO_TARBALL}"
  mkdir -p "${TMP_DIR}/go-extract"
  tar -xzf "${GO_TARBALL}" -C "${TMP_DIR}/go-extract"
  "${SUDO[@]}" mv "${TMP_DIR}/go-extract/go" "${GO_TARGET}"
else
  echo "Go target already exists, skipping: ${GO_TARGET}"
fi
"${SUDO[@]}" ln -sfn "${GO_TARGET}" "${GO_ROOT}/current"

if [[ ! -d "${NODE_TARGET}" ]]; then
  NODE_TARBALL="${TMP_DIR}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  echo "Downloading Node.js ${NODE_VERSION}..."
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o "${NODE_TARBALL}"
  tar -xJf "${NODE_TARBALL}" -C "${TMP_DIR}"
  "${SUDO[@]}" mv "${TMP_DIR}/node-v${NODE_VERSION}-linux-${NODE_ARCH}" "${NODE_TARGET}"
else
  echo "Node.js target already exists, skipping: ${NODE_TARGET}"
fi
"${SUDO[@]}" ln -sfn "${NODE_TARGET}" "${NODE_ROOT}/current"

echo "Installing npm ${NPM_VERSION} inside Octo-Agent Node runtime..."
"${SUDO[@]}" env PATH="${NODE_ROOT}/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  "${NODE_ROOT}/current/bin/npm" install -g "npm@${NPM_VERSION}"

echo "Runtime verification:"
"${GO_ROOT}/current/bin/go" version
"${NODE_ROOT}/current/bin/node" -v
"${NODE_ROOT}/current/bin/npm" -v

echo "Octo-Agent test runtimes are ready."
