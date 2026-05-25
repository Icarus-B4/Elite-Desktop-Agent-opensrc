# Elite Desktop Agent → Hermes Agent migration wrapper
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Write-Host "=== Elite → Hermes Migration ===" -ForegroundColor Cyan
node "$Root\scripts\migrate-elite-to-hermes.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ""
Write-Host "Nächste Schritte:" -ForegroundColor Green
Write-Host "  WSL2 (empfohlen): In Ubuntu: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash && hermes setup"
Write-Host "  Native Beta: iex (irm .../install.ps1) — nur wenn kein WSL; ELITE_HERMES_MODE=native"
Write-Host "  1. hermes setup          (in WSL oder native)"
Write-Host "  2. hermes gateway start  (Electron startet WSL2-first automatisch)"
Write-Host "  3. HUD: http://127.0.0.1:3000 — Widget Hermes Agent (Blitz-Icon)"
Write-Host "  4. PAI Pulse: http://127.0.0.1:31337"
