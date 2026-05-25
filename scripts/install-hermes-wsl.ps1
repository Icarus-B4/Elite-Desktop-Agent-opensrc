# Install Hermes in WSL Ubuntu (non-interactive). Run from repo root: yarn install:hermes:wsl
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$drive = $Root.Substring(0, 1).ToLower()
$rest = $Root.Substring(2) -replace '\\', '/'
$WslPath = "/mnt/$drive$rest"
wsl.exe -d Ubuntu bash -c "sed -i 's/\r$//' '$WslPath/scripts/install-hermes-wsl.sh' && bash '$WslPath/scripts/install-hermes-wsl.sh'"
