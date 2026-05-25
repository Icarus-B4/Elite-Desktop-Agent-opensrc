@echo off
setlocal EnableExtensions
title Elite Agent - Windows Autostart einrichten
echo.
echo ###################################################
echo   Elite Agent - Autostart + Docker
echo ###################################################
echo.

set "REPO_ROOT=%~dp0"
set "REPO_ROOT=%REPO_ROOT:~0,-1%"
set "BOOT_PS1=%REPO_ROOT%\scripts\elite-autostart.ps1"

if not exist "%BOOT_PS1%" (
  echo FEHLER: Boot-Script nicht gefunden:
  echo   %BOOT_PS1%
  pause
  exit /b 1
)

echo Registriere Autostart in der Registry (HKCU\Run)...
echo   %BOOT_PS1%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"\"%BOOT_PS1%\"\"';" ^
  "Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'EliteDesktopAgent' -Value $cmd -Force"

echo.
echo Optional: Docker Desktop bei Windows-Anmeldung (empfohlen)
set "DOCKER_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if exist "%DOCKER_EXE%" (
  reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Docker Desktop" /t REG_SZ /d "\"%DOCKER_EXE%\"" /f >nul 2>&1
  echo   Docker Desktop Run-Eintrag gesetzt.
) else (
  echo   Docker Desktop nicht unter Standardpfad gefunden - bitte in Docker-Einstellungen
  echo   "Bei Anmeldung starten" aktivieren.
)

echo.
echo ###################################################
echo   Fertig. Beim naechsten Windows-Login:
echo   1. Docker Desktop startet
echo   2. LiveKit-Container (wenn Modus Lokal)
echo   3. Hermes Gateway (WSL2, Port 8642)
echo   4. Elite Desktop Agent
echo   Hinweis: Hermes einmalig mit yarn install:hermes:wsl
echo ###################################################
echo.
echo Log: %%LOCALAPPDATA%%\EliteDesktopAgent\logs\autostart.log
echo.
pause
