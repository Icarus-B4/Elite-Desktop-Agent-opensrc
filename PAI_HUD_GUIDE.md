# 🧠 PAI im HUD — Benutzerhandbuch & Steuerungsanleitung

Dieses Handbuch beschreibt die Funktionsweise, Steuerung und Architektur des **Personal AI Infrastructure (PAI)**-Systems im Zusammenspiel mit dem **Elite Desktop Agent HUD (Heads-Up Display)**.

---

## 🌐 1. Systemübersicht & Port-Belegung

Das System läuft über zwei Haupt-Webinterfaces, die Hand in Hand arbeiten:

1. **Elite HUD Interface (`http://localhost:3000`)** — Electron lädt standardmäßig Port 3000
   - Das futuristische Jarvis-Style UI.
   - **Features:** 3D Voice Orb, Echtzeit-Aktivitäts-Logs (Log Streamer), Text Editor / Smart Clipboard, integriertes **Hermes Agent**-Widget (Blitz-Icon, ehem. Mission Control) und LiveKit Voice Streaming.
2. **PAI Observatory / Pulse (`http://localhost:31337`)**
   - Das Daniel Miessler Life OS Interface.
   - **Features:** Telemetrie des Agenten, visualisierte algorithmische Schleifen (Loops), Tagebuch (Diary) und Persönlichkeits-Verwaltung.

3. **Hermes Agent (Gateway `8642`, Dashboard `9119`)**
   - Ersetzt Mission Control (archiviert). Unter **Windows wird WSL2 empfohlen** — Electron startet `hermes gateway` in der WSL-Distro (`ELITE_HERMES_MODE=auto`). Native Windows-Install nur Early Beta.
   - Details: `docs/HERMES_INTEGRATION.md`

---

## 🤝 2. Die PAI-Integration im Elite Agenten

### 🧠 Single Source of Truth
Bei jedem Start einer LiveKit-Session lädt der Elite Agent (`backend/agent.py`) deine persönlichen Profile aus **`~/.claude/PAI/USER/`** (Fallback: `~/PAI/USER/`). **SOUL** kommt aus `agents/elite-agent/SOUL.md` (nicht doppelt aus PAI). Weitere Dateien im Prompt:
- **`DA_IDENTITY.md`** (Name, Stimme, Rolle deines Jarvis)
- **`SOUL.md`** (Charaktereigenschaften, Vorlieben und Abneigungen)
- **`TELOS/PRINCIPAL_TELOS.md`** (Deine persönlichen Lebens- und Projektziele)
- **`PROJECTS/PROJECTS.md`** (Deine aktuellen Entwicklungsprojekte)

### 🔄 Automatisches Memory-Mirroring
Bei jedem Session-Start läuft im Hintergrund das Synchronisationsskript `sync_pai_memory.py`. Es spiegelt deine Konversationshistorie (`CONVERSATION_MEMORY.md`) sowie neue Lerneffekte in die PAI-Verzeichnisse:
- `~/.claude/PAI/USER/WORK/CURRENT_WORK.md`
- `~/.claude/PAI/USER/KNOWLEDGE/AGENT_KNOWLEDGE.md`
- `~/.claude/PAI/USER/LEARNING/ACTIVITY_LEARNING.md`

---

## ⚙️ 3. Steuerung von Tasks & Loops

> [!IMPORTANT]
> **Warum funktionieren die Start/Stopp-Buttons auf dem Dashboard (`http://localhost:31337`) nicht direkt?**
> Die HTTP-Schnittstellen `/api/loops/start` und `/api/loops/control` des Pulse Daemons sind reine **Observability-Stubs** (Platzhalter). Das Dashboard dient nur der Visualisierung. Die aktive Steuerung von Tasks und Loops erfolgt **ausschließlich per Sprache oder Chat-Befehl**.

### 🚀 Loops starten (CLI / HUD Chat)
Du kannst Algorithmen und Schleifen starten, indem du dem Agenten im Chat oder per Sprache einen der folgenden Befehle gibst:

1. **Ideate-Loop (Ideenfindung)**
   - *Befehl:* `ideate [Dein Problem]` oder `id8 [Dein Problem]`
   - *Beispiel:* `ideate Loesungsansaetze fuer Offline-Spracherkennung`
   - *Effekt:* Startet den 9-Phasen-Kreativitäts-Algorithmus (CONSUME → DREAM → DAYDREAM → CONTEMPLATE → STEAL → MATE → TEST → EVOLVE → META-LEARN).
2. **Optimize-Loop (Optimierung)**
   - *Befehl:* `optimize [Dein Problem]`
   - *Effekt:* Startet den Optimierungsprozess zur Verfeinerung bestehender Konzepte.
3. **Interactive Algorithm Run (7-Phasen-Arbeitsablauf)**
   - *Befehl:* `run the Algorithm on my next task`
   - *Effekt:* Startet den wissenschaftlichen Lösungszyklus (**Observe → Think → Plan → Build → Execute → Verify → Learn**).
4.


Jeder gestartete Loop schreibt seinen Zustand in Echtzeit in `~/.claude/PAI/MEMORY/STATE/work.json`. Der Pulse Daemon liest diese Datei aus und rendert den Fortschritt live auf dem Dashboard.

### ⏹️ Loops beenden oder abbrechen
- **Automatisches Beenden:** Sobald alle Phasen (bis zu `COMPLETE` oder `LEARN`) durchlaufen sind, beendet sich der Loop von selbst und wandert auf dem Dashboard in den Verlauf ("Completed").
- **Manuelles Abbrechen:** Falls ein Loop blockiert oder fehlerhaft läuft:
  1. Öffne die Datei `~/.claude/PAI/MEMORY/STATE/work.json` oder die entsprechende Datei in `~/.claude/PAI/USER/WORK/`.
  2. Ändere den Wert von `"status"` auf `"COMPLETE"` oder füge `"abandoned": true` hinzu.

---

## 🛠️ 4. Pulse Daemon Verwaltung (Windows)

Der Pulse Daemon auf Port `31337` läuft als Windows-Hintergrundprozess und wird über ein PowerShell-Skript verwaltet.

Öffne eine PowerShell-Konsole im Verzeichnis `C:\Users\ed\.claude\PAI\PULSE\` und nutze folgende Befehle:

* **Status des Servers & der Hintergrund-Jobs abfragen:**
  ```powershell
  .\manage.ps1 status
  ```
* **Server neu starten (leert Cache und lädt geänderte Markdown-Dateien neu):**
  ```powershell
  .\manage.ps1 restart
  ```
* **Daemon stoppen:**
  ```powershell
  .\manage.ps1 stop
  ```
* **Daemon starten:**
  ```powershell
  .\manage.ps1 start
  ```

---

## 💡 5. Tipps für die tägliche Nutzung

1. **Sprachaktivierung:** Sage **„Elite“** gefolgt von deinem Befehl (z. B. *„Elite, starte einen Ideate-Loop für unser UI-Design“*). Durch den integrierten Wake-Word-Filter reagiert die KI nur, wenn sie explizit angesprochen wird.
2. **Smart Clipboard im HUD:** Wenn du Code kopierst, erkennt der Clipboard-Monitor dies. Der Inhalt taucht automatisch im **Text Editor Widget** links im HUD auf und kann per `CTRL + ENTER` direkt an das Backend übertragen oder verarbeitet werden.
3. **Hermes Agent nutzen:** Klicke auf das Blitz-Icon in der unteren HUD-Statusleiste. Das Widget zeigt Gateway-Status (Port 8642), Memory-Auslastung, Session-Anzahl und Gateway-Logs. Dashboard: `http://127.0.0.1:9119`. Details: `docs/HERMES_INTEGRATION.md`.
