#!/usr/bin/env bash
# outsourc-e/hermes-workspace belegt ebenfalls Port 9119 — mit stoppen
pkill -f "hermes-workspace.*server-entry" 2>/dev/null || true
pkill -f "hermes-workspace/server-entry" 2>/dev/null || true
if pgrep -f "server-entry.js" >/dev/null 2>&1; then
  cwd="$(readlink -f /proc/$(pgrep -f 'server-entry.js' | head -1)/cwd 2>/dev/null || true)"
  if [[ "${cwd:-}" == *hermes-workspace* ]]; then
    pkill -f "server-entry.js" 2>/dev/null || true
  fi
fi
pkill -f "hermes dashboard" 2>/dev/null || true
pkill -f "hermes gateway" 2>/dev/null || true
echo "[Hermes] Gateway + Dashboard gestoppt (WSL). hermes-workspace auf 9119 ebenfalls beendet."
