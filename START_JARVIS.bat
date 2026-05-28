@echo off
if not "%~1"=="min" (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'min' -WindowStyle Minimized"
  exit /b 0
)
setlocal EnableExtensions
title ELITE AGENT - SYSTEM CORE

echo [ELITE] Initialisiere System-Start...
set NODE_ENV=development
set ELITE_HERMES_MODE=wsl
if not defined HERMES_WSL_DISTRO set "HERMES_WSL_DISTRO=Ubuntu"
rem Wenn http://127.0.0.1:9119 Fehler -102: Portforward - ELITE_HERMES_DASHBOARD_INSECURE=1 setzen
if not defined ELITE_HERMES_DASHBOARD_INSECURE set "ELITE_HERMES_DASHBOARD_INSECURE=1"

set "REPO_ROOT=%~dp0"
set "REPO_ROOT=%REPO_ROOT:~0,-1%"

:: 1. Zielgerichtetes Cleanup
echo [ELITE] Bereinige alte Elite-Instanzen...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\scripts\elite-prestart.ps1"
if errorlevel 1 (
  echo [ELITE] WARNUNG: elite-prestart.ps1 meldete einen Fehler.
)

:: 2. Hermes optional - Electron startet Hermes Stack via services.js
if defined ELITE_START_HERMES_IN_BAT goto start_hermes_in_bat
echo [ELITE] Hermes-Start uebersprungen - Electron services.js startet Hermes Stack.
goto after_hermes_in_bat

:start_hermes_in_bat
echo [ELITE] Starte Hermes Gateway + Dashboard in WSL2...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\scripts\start-hermes-gateway.ps1"
if errorlevel 1 (
  echo [ELITE] WARNUNG: Hermes konnte nicht gestartet werden.
  echo          Einmalig: yarn install:hermes:wsl im Repo-Ordner
  echo          Dann: wsl -d Ubuntu -e bash -lc hermes setup
)

:after_hermes_in_bat

:: 3. Electron HUD - startet Backend, Frontend, PAI Pulse via services.js
echo [ELITE] Starte Jarvis HUD ^(Electron^)...
set ELITE_SKIP_PRESTART=1
set "ELECTRON_EXE=%REPO_ROOT%\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
  echo [ELITE] FEHLER: Electron nicht gefunden.
  echo          Bitte im Repo ausfuehren: yarn install
  pause
  exit /b 1
)
cd /d "%REPO_ROOT%\desktop"
start "" "%ELECTRON_EXE%" .

:: 4. System gestartet
echo [ELITE] System gestartet. HUD: http://127.0.0.1:3000  ^|  Core: :7861  ^|  Hermes: :8642  ^|  Pulse: :31337
timeout /t 3 /nobreak >nul
exit /b 0
