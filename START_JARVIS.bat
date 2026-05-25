@echo off
setlocal EnableExtensions
title ELITE AGENT - SYSTEM CORE

echo [ELITE] Initialisiere System-Start...
set NODE_ENV=development
set ELITE_HERMES_MODE=wsl
if not defined HERMES_WSL_DISTRO set "HERMES_WSL_DISTRO=Ubuntu"
rem Wenn http://127.0.0.1:9119 Fehler -102: Portforward — 1 setzen, Elite neu starten
if not defined ELITE_HERMES_DASHBOARD_INSECURE set "ELITE_HERMES_DASHBOARD_INSECURE=1"

set "REPO_ROOT=%~dp0"
set "REPO_ROOT=%REPO_ROOT:~0,-1%"

:: 1. Zielgerichtetes Cleanup (NICHT alle node.exe/python.exe — das killt den gerade startenden Core)
echo [ELITE] Bereinige alte Elite-Instanzen...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\scripts\elite-prestart.ps1"

:: 2. Hermes Agent (WSL2) — Gateway :8642 + Web-Dashboard :9119
echo [ELITE] Starte Hermes (Gateway + Dashboard, WSL2)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\scripts\start-hermes-gateway.ps1"
if errorlevel 1 (
  echo [ELITE] WARNUNG: Hermes konnte nicht gestartet werden.
  echo          Einmalig: yarn install:hermes:wsl  ^(im Repo-Ordner^)
  echo          Dann: wsl -d Ubuntu -e bash -lc "hermes setup"
)

:: 3. Electron HUD — startet Backend, Frontend, PAI Pulse via services.js
echo [ELITE] Starte Jarvis HUD (Electron)...
cd /d "%REPO_ROOT%\desktop"
start "" "..\node_modules\electron\dist\electron.exe" .

:: 4. Warten bis LiveKit-Worker (agent.py) laeuft — sonst „ELITE CORE OFFLINE“
echo [ELITE] Warte auf Jarvis Core (agent.py, Port 7861)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\scripts\wait-jarvis-core.ps1"
if errorlevel 1 (
  echo [ELITE] WARNUNG: Backend noch nicht bereit. Log: %USERPROFILE%\Desktop\EliteAgent_services.log
  echo          Manuell: cd backend ^&^& python agent.py dev
)

echo [ELITE] System gestartet. HUD: http://127.0.0.1:3000  ^|  Core: :7861  ^|  Hermes: :8642  ^|  Pulse: :31337
exit /b 0
