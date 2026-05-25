# Elite Desktop Agent – Windows Autostart (Docker + App)
# Wird per Registry Run oder setup_autostart.bat aufgerufen.

$ErrorActionPreference = 'SilentlyContinue'

function Write-Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  $logDir = Join-Path $env:LOCALAPPDATA 'EliteDesktopAgent\logs'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $logFile = Join-Path $logDir 'autostart.log'
  Add-Content -Path $logFile -Value $line
}

Write-Log '=== Elite Autostart gestartet ==='

# Netzwerk braucht nach Login etwas Zeit
Start-Sleep -Seconds 12

# Hermes Gateway (WSL2) — vor Elite-App
$repoRootEarly = Split-Path $PSScriptRoot -Parent
$hermesStart = Join-Path $PSScriptRoot 'start-hermes-gateway.ps1'
if (Test-Path $hermesStart) {
  $env:ELITE_HERMES_MODE = 'wsl'
  Write-Log 'Starte Hermes Gateway (WSL)…'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hermesStart 2>&1 | ForEach-Object { Write-Log $_ }
} else {
  Write-Log 'start-hermes-gateway.ps1 nicht gefunden — Hermes übersprungen.'
}

# LiveKit nur bei lokalem Modus – Docker nur dann starten
$configPath = Join-Path $env:LOCALAPPDATA 'EliteDesktopAgent\backend\config.json'
$livekitLocal = $false
if (Test-Path $configPath) {
  try {
    $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
    if ($cfg.livekitMode -eq 'local') { $livekitLocal = $true }
  } catch { }
}

$dockerPaths = @(
  "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe",
  "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
  "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
)

$dockerExe = $dockerPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

function Test-DockerReady {
  docker info 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

if ($livekitLocal) {
  if (-not (Test-DockerReady)) {
    if ($dockerExe) {
      Write-Log "Starte Docker Desktop: $dockerExe"
      Start-Process -FilePath $dockerExe
    } else {
      Write-Log 'Docker Desktop nicht gefunden.'
    }

    $deadline = (Get-Date).AddMinutes(4)
    while ((Get-Date) -lt $deadline) {
      if (Test-DockerReady) {
        Write-Log 'Docker Daemon bereit.'
        break
      }
      Start-Sleep -Seconds 5
    }
  }
} else {
  Write-Log 'LiveKit Cloud-Modus – Docker-Start übersprungen.'
}

if ($livekitLocal -and (Test-DockerReady)) {
  Write-Log 'Starte LiveKit-Container…'
  docker rm -f livekit-server 2>$null | Out-Null
  docker run -d --name livekit-server -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev --bind 0.0.0.0 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Log 'livekit-server gestartet.'
  } else {
    Write-Log 'livekit-server Start fehlgeschlagen.'
  }
}

# Elite-App starten (MSIX > Dev Electron > START_JARVIS.bat)
$env:ELITE_AUTOSTART = '1'
$repoRoot = Split-Path $PSScriptRoot -Parent

$started = $false

# 1) Installierte MSIX / App-Alias
$appExe = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\EliteAgent.exe'
if (-not (Test-Path $appExe)) {
  $appExe = Get-ChildItem -Path "$env:ProgramFiles\WindowsApps" -Filter 'EliteAgent.exe' -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
if ($appExe -and (Test-Path $appExe)) {
  Write-Log "Starte Elite MSIX: $appExe"
  Start-Process -FilePath $appExe
  $started = $true
}

# 2) Dev: Electron im Repo
if (-not $started) {
  $electron = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe'
  $desktopDir = Join-Path $repoRoot 'desktop'
  if ((Test-Path $electron) -and (Test-Path $desktopDir)) {
    Write-Log 'Starte Elite (Dev Electron)…'
    Start-Process -FilePath $electron -ArgumentList '.' -WorkingDirectory $desktopDir
    $started = $true
  }
}

# 3) Fallback BAT
if (-not $started) {
  $bat = Join-Path $repoRoot 'START_JARVIS.bat'
  if (Test-Path $bat) {
    Write-Log "Starte START_JARVIS.bat"
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$bat`"" -WorkingDirectory $repoRoot -WindowStyle Hidden
    $started = $true
  }
}

if (-not $started) {
  Write-Log 'Elite konnte nicht gestartet werden (kein Pfad gefunden).'
}

Write-Log '=== Elite Autostart beendet ==='
