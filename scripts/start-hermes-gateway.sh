#!/usr/bin/env bash
# Hermes Gateway (8642) + Web-Dashboard (9119) für Elite Desktop Agent.
# Aufgerufen von: START_JARVIS.bat, desktop/services.js (via start-hermes-gateway.ps1)
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.hermes/node/bin:$PATH"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
WEB_DIR="${HERMES_HOME}/hermes-agent/web"
LOG_DIR="${HERMES_HOME}/logs"
mkdir -p "$LOG_DIR"

log() { echo "[Hermes] $*"; }

if ! command -v hermes >/dev/null 2>&1; then
  log "CLI fehlt. Einmalig im Repo: yarn install:hermes:wsl"
  exit 1
fi

# --- Gateway (8642) ---
wait_for_gateway() {
  local i=0
  while [ "$i" -lt 45 ]; do
    if curl -sf -o /dev/null "http://127.0.0.1:8642/v1/models"; then
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  return 1
}

if pgrep -f "hermes gateway run" >/dev/null 2>&1; then
  log "Gateway-Prozess laeuft — warte auf API (8642)…"
else
  log "Starte Gateway (hermes gateway run)…"
  nohup hermes gateway run >> "${LOG_DIR}/gateway.log" 2>&1 &
fi

if wait_for_gateway; then
  log "Gateway bereit: http://127.0.0.1:8642"
else
  log "Gateway nach 90s nicht erreichbar — siehe ${LOG_DIR}/gateway.log"
fi

# --- Dashboard-Build (einmalig) ---
ensure_dashboard_dist() {
  if [[ -f "${WEB_DIR}/dist/index.html" ]]; then
    return 0
  fi
  if [[ ! -f "${WEB_DIR}/package.json" ]]; then
    log "Web-UI fehlt unter ${WEB_DIR} — yarn install:hermes:wsl ausfuehren."
    return 1
  fi
  if [[ -f "${HERMES_HOME}/.dashboard-build-failed" ]]; then
    log "Dashboard-Build war fehlgeschlagen. Manuell: cd ${WEB_DIR} && npm ci && npm run build"
    return 1
  fi
  log "Erstbuild Web-Dashboard (npm) — kann 3–10 Min. dauern…"
  if (cd "${WEB_DIR}" && npm ci --no-audit --no-fund >> "${LOG_DIR}/dashboard-build.log" 2>&1 \
      && npm run build >> "${LOG_DIR}/dashboard-build.log" 2>&1); then
    log "Dashboard-Build OK."
    rm -f "${HERMES_HOME}/.dashboard-build-failed"
    return 0
  fi
  touch "${HERMES_HOME}/.dashboard-build-failed"
  log "Build fehlgeschlagen — ${LOG_DIR}/dashboard-build.log"
  return 1
}

# --- Dashboard (9119) ---
# outsourc-e/hermes-workspace nutzt denselben Port — nicht mit NousResearch verwechseln
if curl -sf -o /dev/null "http://127.0.0.1:9119/"; then
  title="$(curl -sf http://127.0.0.1:9119/ 2>/dev/null | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' | head -1)"
  if [[ "${title}" == *Workspace* ]]; then
    log "Port 9119: hermes-workspace (Fork) — stoppe, starte NousResearch-Dashboard…"
    pkill -f "hermes-workspace.*server-entry" 2>/dev/null || true
    if pgrep -f "server-entry.js" >/dev/null 2>&1; then
      cwd="$(readlink -f /proc/$(pgrep -f 'server-entry.js' | head -1)/cwd 2>/dev/null || true)"
      [[ "${cwd:-}" == *hermes-workspace* ]] && pkill -f "server-entry.js" 2>/dev/null || true
    fi
    sleep 2
  else
    log "Dashboard laeuft bereits: http://127.0.0.1:9119 (${title:-OK})"
    exit 0
  fi
fi

if pgrep -f "hermes dashboard" >/dev/null 2>&1; then
  log "Dashboard-Prozess startet noch…"
  exit 0
fi

if ! ensure_dashboard_dist; then
  exit 0
fi

log "Starte Web-Dashboard: http://127.0.0.1:9119"
DASHBOARD_HOST="127.0.0.1"
DASHBOARD_EXTRA=()
if [[ "${ELITE_HERMES_DASHBOARD_INSECURE:-}" == "1" ]]; then
  # Nur wenn Windows localhost:9119 WSL nicht erreicht (Firewall/Portforward)
  DASHBOARD_HOST="0.0.0.0"
  DASHBOARD_EXTRA=(--insecure)
  log "Hinweis: Dashboard bindet 0.0.0.0 (ELITE_HERMES_DASHBOARD_INSECURE=1)"
fi
nohup hermes dashboard --no-open --skip-build --host "${DASHBOARD_HOST}" "${DASHBOARD_EXTRA[@]}" \
  >> "${LOG_DIR}/dashboard.log" 2>&1 &

for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3
  if curl -sf -o /dev/null "http://127.0.0.1:9119/"; then
    log "Dashboard bereit: http://127.0.0.1:9119"
    exit 0
  fi
done

log "Dashboard noch nicht erreichbar — ${LOG_DIR}/dashboard.log"
exit 0
