#!/usr/bin/env bash
pkill -f "hermes dashboard" 2>/dev/null || true
pkill -f "hermes gateway" 2>/dev/null || true
echo "[Hermes] Gateway + Dashboard gestoppt (WSL)."
