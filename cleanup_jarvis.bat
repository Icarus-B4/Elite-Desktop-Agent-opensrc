@echo off
echo !!! JARVIS ULTRA-HARD RESET ^& CLEANUP !!!
echo -----------------------------------

echo 1. Beende alle Python-Prozesse...
taskkill /F /IM python.exe /T 2>nul

echo 2. Beende alle Node-Prozesse...
taskkill /F /IM node.exe /T 2>nul

echo 3. Beende UI-Automation...
taskkill /F /IM UiAutomationGRPC.Server.exe /T 2>nul

echo 4. Beende ALLE Electron/Jarvis Instanzen...
taskkill /F /IM electron.exe /T 2>nul
taskkill /F /IM EliteAgent.exe /T 2>nul
taskkill /F /IM "Elite Desktop Agent.exe" /T 2>nul
taskkill /F /IM webstark-elite.exe /T 2>nul
taskkill /F /IM "Desktop Elite.exe" /T 2>nul

echo 4b. Beende Hermes Gateway (WSL)...
set "REPO_ROOT=%~dp0"
set "REPO_ROOT=%REPO_ROOT:~0,-1%"
if exist "%REPO_ROOT%\scripts\stop-hermes-gateway.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\scripts\stop-hermes-gateway.ps1"
)

echo 5. Bereinige Ports (7861, 3000, 8642, 9119, 31337)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :7861') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8642') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9119') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :31337') do taskkill /F /PID %%a 2>nul

echo 5.5 Beende PAI Pulse Daemon...
set "PAI_PULSE_SCRIPT=%USERPROFILE%\.claude\PAI\Pulse\manage.ps1"
if exist "%PAI_PULSE_SCRIPT%" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PAI_PULSE_SCRIPT%" stop >nul 2>&1
)

echo 6. Loesche Electron-Cache...
rmdir /s /q "%APPDATA%\Elite Desktop Agent" 2>nul

echo -----------------------------------
echo CLEANUP ABGESCHLOSSEN.
echo Neu starten mit START_JARVIS.bat
pause
exit /b 0
