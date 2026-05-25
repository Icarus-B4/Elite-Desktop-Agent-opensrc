# Zielgerichtetes Cleanup vor Elite-Start (kein globales taskkill node.exe/python.exe).
$ErrorActionPreference = 'SilentlyContinue'

Write-Host '[elite-prestart] Beende Elite/Electron-Instanzen...'
@('EliteAgent.exe', 'electron.exe', 'UiAutomationGRPC.Server.exe') | ForEach-Object {
  Get-Process -Name ($_ -replace '\.exe$', '') -ErrorAction SilentlyContinue | Stop-Process -Force
}

$patterns = @('agent.py', 'frame_analyzer.py', 'livekit.agents', '_run_worker')
Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $cmd = $_.CommandLine
    $cmd -and ($patterns | Where-Object { $cmd -like "*$_*" })
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$ports = @(7861, 3000, 3001, 8642, 9119, 31337)
foreach ($port in $ports) {
  $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pid in $pids) {
    if ($pid -match '^\d+$') { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue }
  }
}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $cmd = $_.CommandLine
    $cmd -and ($cmd -match 'next(\s|-)?dev|next-server|start-server|\.next')
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2
Write-Host '[elite-prestart] Fertig.'
