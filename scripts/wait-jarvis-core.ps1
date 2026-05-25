# Wartet bis agent.py laeuft (max. 90s). Exit 0 = OK.
param([int]$TimeoutSec = 90)
$ErrorActionPreference = 'SilentlyContinue'
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  $proc = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*agent.py*' }
  if ($proc) {
    Write-Host '[wait-jarvis-core] Backend-Agent laeuft (agent.py).'
    exit 0
  }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7861' -TimeoutSec 2
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
      Write-Host '[wait-jarvis-core] Port 7861 antwortet.'
      exit 0
    }
  } catch { }
  Start-Sleep -Seconds 3
}
Write-Host '[wait-jarvis-core] TIMEOUT — Backend nicht bereit.'
exit 1
