# Elite Desktop Agent - Windows App

Dieses Verzeichnis enthält den nativen Windows-Wrapper für den Elite Desktop Agent.

## Features
- **Autostart**: Die App startet automatisch mit Windows (konfiguriert via MSIX StartupTask).
- **HUD Aesthetik**: Transparentes Fenster mit Windows 11 Acrylic-Effekt.
- **Prozess-Management**: Startet automatisch alle Backend-Dienste (Python, Mission Control, UI Automation).
- **System Tray**: Läuft diskret im Hintergrund.

## Entwicklung
Um die App im Entwicklungsmodus zu starten:
```bash
cd desktop
pnpm install
pnpm run dev
```

## Paketierung (MSIX)
Um eine installierbare Windows-App (.msix) zu erstellen:
```bash
cd desktop
pnpm run pack
```
*Hinweis: Die MSIX-Datei wird im `desktop/` Verzeichnis erstellt.*

## Transparenz & Design
Die App nutzt:
- `transparent: true` für rahmenlose HUD-Optik.
- `setBackgroundMaterial('acrylic')` für den modernen Windows 11 Look.
- `opacity: 0.95` für eine subtile Durchsichtigkeit.
