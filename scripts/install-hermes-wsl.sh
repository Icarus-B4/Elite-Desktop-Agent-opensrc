#!/usr/bin/env bash
# Non-interactive Hermes install for WSL (skips sudo prompts from official installer).
set -euo pipefail

export PATH="${HOME}/.local/bin:${HOME}/.hermes/node/bin:${PATH}"
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
INSTALL_DIR="${HERMES_HOME}/hermes-agent"
VENV="${INSTALL_DIR}/venv"
BIN="${HOME}/.local/bin"

mkdir -p "${HERMES_HOME}" "${BIN}"

if ! command -v uv >/dev/null 2>&1; then
  echo "[install-hermes-wsl] Installing uv..."
  curl -fsSL https://astral.sh/uv/install.sh | sh
  export PATH="${HOME}/.local/bin:${PATH}"
fi

if ! uv python find 3.11 >/dev/null 2>&1; then
  uv python install 3.11
fi

if [ ! -d "${INSTALL_DIR}/.git" ]; then
  echo "[install-hermes-wsl] Cloning hermes-agent..."
  rm -rf "${INSTALL_DIR}"
  git clone --depth 1 --branch main https://github.com/NousResearch/hermes-agent.git "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"
if [ ! -d "${VENV}" ]; then
  uv venv venv --python 3.11
fi
export VIRTUAL_ENV="${VENV}"

echo "[install-hermes-wsl] Installing Python package (may take several minutes)..."
if ! uv pip install -e ".[all]" 2>/dev/null; then
  echo "[install-hermes-wsl] .[all] failed, trying base install..."
  uv pip install -e "."
fi

HERMES_BIN="${VENV}/bin/hermes"
if [ ! -x "${HERMES_BIN}" ]; then
  echo "[install-hermes-wsl] ERROR: hermes binary not found in venv"
  exit 1
fi

ln -sf "${HERMES_BIN}" "${BIN}/hermes"
"${HERMES_BIN}" --version

ENV_FILE="${HERMES_HOME}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  touch "${ENV_FILE}"
fi
grep -q '^API_SERVER_ENABLED=' "${ENV_FILE}" 2>/dev/null || echo 'API_SERVER_ENABLED=true' >> "${ENV_FILE}"
grep -q '^API_SERVER_PORT=' "${ENV_FILE}" 2>/dev/null || echo 'API_SERVER_PORT=8642' >> "${ENV_FILE}"

mkdir -p "${HERMES_HOME}/memories" "${HERMES_HOME}/workspace" "${HERMES_HOME}/logs"
echo "[install-hermes-wsl] Done. Run: hermes setup  (interactive, API keys)"
