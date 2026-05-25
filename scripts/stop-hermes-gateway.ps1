param(
  [string]$Distro = $(if ($env:HERMES_WSL_DISTRO) { $env:HERMES_WSL_DISTRO } else { 'Ubuntu' })
)

$sh = Join-Path $PSScriptRoot 'stop-hermes-gateway.sh'
$wslSh = (wsl.exe -d $Distro wslpath -a $sh 2>$null)
if (-not $wslSh) {
  $drive = $sh.Substring(0, 1).ToLower()
  $rest = $sh.Substring(2) -replace '\\', '/'
  $wslSh = "/mnt/$drive$rest"
}

Write-Host "[Hermes] Stoppe Gateway in WSL ($Distro)..."
wsl.exe -d $Distro -e bash -lc "sed -i 's/\r$//' '$wslSh' && bash '$wslSh'"
