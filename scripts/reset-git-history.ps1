# reset-git-history.ps1
# Dieses Skript loescht die Git-Historie und initialisiert ein neues, sauberes Repository.
# Dadurch wird verhindert, dass sensible Altdaten (API-Keys, Webcam-Bilder, PFX) im Verlauf verbleiben.

$ErrorActionPreference = "Stop"

# 1. Sicherheitsabfrage
Write-Host "=========================================================" -ForegroundColor Yellow
Write-Host "ACHTUNG: Dieses Skript setzt die Git-Historie zurueck!" -ForegroundColor Yellow
Write-Host "Es wird ein neues Git-Repository initialisiert." -ForegroundColor Yellow
Write-Host "Alle vergangenen Commits werden dauerhaft geloescht." -ForegroundColor Yellow
Write-Host "=========================================================" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Moechtest du fortfahren? (j/n)"
if ($confirm -ne "j") {
    Write-Host "Abgebrochen." -ForegroundColor Red
    exit 0
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $repoRoot

# In das Projektverzeichnis wechseln
Set-Location $projectRoot

# Backup-Ordner-Name
$date = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $projectRoot "..\_git_backup_$date"

Write-Host "Erstelle Backup der alten Git-Historie..." -ForegroundColor Cyan
if (Test-Path ".git") {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    Copy-Item -Path ".git" -Destination $backupDir -Recurse -Force
    Write-Host "Backup unter '$backupDir' erstellt." -ForegroundColor Green
    
    Write-Host "Entferne alten .git-Ordner..." -ForegroundColor Cyan
    # Robustes Loeschen unter Windows (manchmal blockiert das System Lese-/Schreibrechte auf Git-Objekte)
    Remove-Item -Path ".git" -Recurse -Force
    Write-Host "Alte Git-Historie entfernt." -ForegroundColor Green
} else {
    Write-Host "Kein bestehendes Git-Repository gefunden." -ForegroundColor Yellow
}

Write-Host "Initialisiere neues, sauberes Git-Repository..." -ForegroundColor Cyan
git init

Write-Host "Fuege Dateien hinzu (beachtet die .gitignore)..." -ForegroundColor Cyan
git add .

Write-Host "Erstelle Initial-Commit..." -ForegroundColor Cyan
git commit -m "initial commit: clean open source release"

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "ERFOLG: Neues Git-Repository wurde erfolgreich erstellt!" -ForegroundColor Green
Write-Host "Die Historie ist nun sauber und bereit zur Veroeffentlichung." -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
