# Repariert häufigen Docker-Desktop-Fehler:
# "dockerInference: The file cannot be accessed by the system"
# Elite startet Docker nicht mehr im Cloud-Modus – dieses Script hilft bei lokalem LiveKit.

$ErrorActionPreference = 'Stop'

Write-Host '=== Docker Inference Reparatur ===' -ForegroundColor Cyan

Write-Host 'Beende Docker Desktop…' -ForegroundColor Yellow
Get-Process -Name 'Docker Desktop','com.docker.backend','com.docker.service' -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4

$runDir = Join-Path $env:LOCALAPPDATA 'Docker\run'
if (Test-Path $runDir) {
  $targets = @('dockerInference', 'dockerInference.sock')
  foreach ($name in $targets) {
    $p = Join-Path $runDir $name
    if (Test-Path $p) {
      Write-Host "Entferne: $p"
      try {
        Remove-Item -LiteralPath $p -Force -Recurse -ErrorAction Stop
        Write-Host '  OK' -ForegroundColor Green
      } catch {
        Write-Host "  Fehlgeschlagen: $_" -ForegroundColor Red
        Write-Host '  Tipp: PC neu starten oder Docker als Admin beenden, dann erneut ausführen.' -ForegroundColor Yellow
      }
    }
  }
} else {
  Write-Host "Ordner nicht gefunden: $runDir"
}

$dockerExe = @(
  "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe",
  "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($dockerExe) {
  Write-Host "Starte Docker Desktop: $dockerExe" -ForegroundColor Cyan
  Start-Process -FilePath $dockerExe
  Write-Host 'Warte 30–60 Sekunden, bis Docker grün ist.' -ForegroundColor Gray
} else {
  Write-Host 'Docker Desktop.exe nicht gefunden.' -ForegroundColor Red
}

Write-Host 'Fertig.' -ForegroundColor Cyan
