# Hermes Gateway in WSL2 starten. Wird von START_JARVIS.bat / Autostart genutzt.
param(
  [string]$Distro = $(if ($env:HERMES_WSL_DISTRO) { $env:HERMES_WSL_DISTRO } else { 'Ubuntu' })
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path $PSScriptRoot -Parent
$sh = Join-Path $PSScriptRoot 'start-hermes-gateway.sh'

if (-not (Test-Path $sh)) {
  Write-Host "[Hermes] Fehlende Datei: $sh"
  exit 1
}

# CRLF -> LF fuer bash
$wslSh = (wsl.exe -d $Distro wslpath -a $sh 2>$null)
if (-not $wslSh) {
  $drive = $sh.Substring(0, 1).ToLower()
  $rest = $sh.Substring(2) -replace '\\', '/'
  $wslSh = "/mnt/$drive$rest"
}

$insecure = if ($env:ELITE_HERMES_DASHBOARD_INSECURE -eq '1') { '1' } else { '0' }
Write-Host "[Hermes] Starte Gateway + Dashboard in WSL ($Distro)..."
wsl.exe -d $Distro -e bash -lc "export ELITE_HERMES_DASHBOARD_INSECURE='$insecure'; sed -i 's/\r$//' '$wslSh' && bash '$wslSh'"

# WSL2: localhost:9119 von Windows oft blockiert (-102) — Proxy auf 127.0.0.1
$proxyJs = Join-Path $repoRoot 'scripts\hermes-wsl-proxy.mjs'
if ((Test-Path $proxyJs) -and ($env:ELITE_HERMES_SKIP_WINDOWS_PROXY -ne '1')) {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCmd) {
    Start-Sleep -Seconds 2
    $env:HERMES_WSL_DISTRO = $Distro
    Start-Process -WindowStyle Hidden -FilePath $nodeCmd.Source -ArgumentList @($proxyJs) -WorkingDirectory $repoRoot | Out-Null
    Start-Sleep -Seconds 1
    try {
      $code = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9119/' -TimeoutSec 4).StatusCode
      Write-Host "[Hermes] Windows-Proxy aktiv - http://127.0.0.1:9119 (HTTP $code)"
    } catch {
      Write-Host "[Hermes] Windows-Proxy gestartet - falls Browser -102: WSL-IP aus 'wsl hostname -I'"
    }
  }
}

exit 0
