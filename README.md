# 🤖 Elite Desktop Agent (Hermes/Jarvis Hybrid-Edition)

<p align="center">
  <img src="https://img.shields.io/badge/Elite%20Agent-Hermes/Jarvis%20Hybrid-Edition-cyan?style=for-the-badge&logo=openai" alt="Elite Desktop Agent Badge" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows" alt="Platform Badge" />
  <img src="https://img.shields.io/badge/Frontend-Next.js-black?style=for-the-badge&logo=next.js" alt="Frontend Badge" />
  <img src="https://img.shields.io/badge/Backend-Python%20%7C%20LiveKit-blue?style=for-the-badge&logo=python" alt="Backend Badge" />
  <img src="https://img.shields.io/badge/Desktop-Electron-47848F?style=for-the-badge&logo=electron" alt="Desktop Badge" />
  <img src="https://img.shields.io/badge/PAI%20Pulse-Observatory%20%7C%2031337-purple?style=for-the-badge&logo=obsidian" alt="PAI Pulse Badge" />
</p>

---

Der **Elite Desktop Agent** ist ein hochentwickelter, lokaler Windows-Desktop-Assistent im futuristischen Jarvis-Stil. Er vereint ein interaktives, hochgradig ästhetisches **Next.js HUD**, einen leistungsstarken **LiveKit/OpenAI-Realtime-Backend-Worker**, lokales AI-Fallback (Ollama, Whisper, Piper Neural-TTS), das **Hermes-Agent-Gehirn** und das **PAI Pulse Observatory** zu einer nahtlosen Einheit für Sprachsteuerung, Vision-Erfassung, Systemautomatisierung und intelligente Selbstheilung.

Elite agiert als diskreter Butler im Hintergrund: Er reagiert auf präzise Befehle oder Wake-Words, steuert Shell- und System-Aktionen, analysiert Bildschirminhalte und Webcam-Streams, dokumentiert Arbeitsschritte und hält das Projektgedächtnis aktuell.

---

> [!IMPORTANT]
> ### 🎙️ NotebookLM Audio Deep Dive (Projekt-Erklärung)
> Du willst wissen, wie der Elite Desktop Agent aufgebaut ist und wie die verschiedenen Komponenten interagieren?
> 
> **🎧 [Klicke hier, um dir den interaktiven Audio-Deep-Dive anzuhören!](https://notebooklm.google.com/notebook/fb142797-7808-47b6-ab0f-c5736b396a63/artifact/fd5ec708-2cad-44fc-9188-fd7f7dbb2083?utm_source=nlm_web_share&utm_medium=google_oo&utm_campaign=art_share_1&utm_content=&utm_smc=nlm_web_share_google_oo_art_share_1_)**
> 
> In diesem faszinierenden Audio-Deep-Dive wird die Funktionsweise und das Systemkonzept dieses Assistenten anschaulich und dynamisch erklärt. Perfekt für einen schnellen und tiefen Einstieg!

---

## 🗺️ Systemarchitektur & Mindmap

Das Zusammenspiel von Frontend-HUD, Python-Backend, Electron-Desktop-Integration, Hermes Gateway und PAI Pulse ist in der folgenden Projekt-Mindmap visuell aufbereitet:

![System Mindmap](NotebookLM%20Mind%20Map.png)

---

## ⚡ Hauptmerkmale & Core-Capabilities

### 🗣️ Voice Core & Sprachsteuerung
* **Ultra-Strict VAD (Voice Activity Detection)**: Mit optimiertem Threshold (0.4) und reduziertem AEC-Warmup (1.5s) für sofortiges Ansprechverhalten ohne Verzögerung.
* **Wake-Word-Filter**: Reagiert ausschließlich auf *„Elite“* oder *„Jarvis“*. Hintergrundgeräusche, Gespräche Dritter oder Medienklänge werden gefiltert.
* **Dialekt-Toleranz**: Integrierte Unterstützung für Schweizerdeutsch-STT-Verhörer (z.B. „Elli“, „Eli“, „Dschawis“) in `backend/stt_corrections.py`.
* **Hybrid-Modus**: Wechselt bei API-Quota-Limits automatisch von der OpenAI Realtime API zu einem komplett lokalen Setup (Whisper + Ollama + Piper Neural-TTS) ohne Unterbrechung.

### 👁️ Vision Core & Kontext-Erfassung
* **Echtzeit-Webcam-Analyse**: Direktes Base64-Streaming an das Backend für interaktive Bildanalyse.
* **Screenshots & OCR**: Schnelle Erfassung und textuelle Auswertung des aktuellen Bildschirms.
* **Gallery-Widget**: Archivierung und Historie aller erfassten Webcam-Aufnahmen und Screenshots direkt im HUD.

### 🛠️ Action Core & OS-Automation
* **Maus- & Tastatur-Kontrolle**: Vollständige Systemsteuerung über PyAutoGUI.
* **Shell- & Task-Manager**: Überwachung von System-Metriken (CPU, RAM, Auslastung) und Starten/Stoppen lokaler Programme.
* **Smart Clipboard**: Der `clipboard_monitor_task` erkennt Clipboard-Änderungen und triggert den Text-Editor im Frontend.

### 🧠 Hermes Agent (Zentralhirn)
* Ersetzt das alte JARVIS Mission Control (Port `3001`, nun archiviert in `Abadoned/`).
* **Hermes Gateway (Port 8642)** und **Dashboard (Port 9119)** laufen performant im WSL2-Subsystem oder nativ.
* Unterstützt agentische Abfragen (`hermes_ask`) und die schnelle FTS5-Verlaufssuche alter Sessions.

### 📈 PAI Pulse & Observatory
* Überwachungssystem auf Port `31337` zur live Visualisierung von System-Loops und Algorithmen.
* Synchronisiert und spiegelt das lokale Projektgedächtnis und Benutzerpräferenzen.

### 🏗️ ADA v2 Integration (Advanced Desktop Assistant)
* **Parametrisches CAD**: Integration von `build123d` für geometrische Konstruktionen.
* **3D-Druck-Brücke**: Schnittstellen zu Moonraker/OrcaSlicer (Mock-Layer).
* **Autonomer Web-Agent**: Komplexe Web-Suchen und Klicks via Playwright und Gemini/OpenAI Vision.
* **Smart Home**: Integration für TP-Link Kasa Geräte (Mock-Layer).
* **Face Auth & Gesten**: Kamera-basierte Gestensteuerung und Gesichtserkennung über MediaPipe.

---

## 🔌 Netzwerk & Ports

| Dienst / Komponente | Port | Standard-URL | Funktion |
| :--- | :---: | :--- | :--- |
| **Elite HUD (Next.js)** | `3000` | `http://localhost:3000` | Hauptbenutzeroberfläche und Dashboard |
| **Hermes Gateway API** | `8642` | `http://localhost:8642` | Schnittstelle für agentische LLM-Dienste (WSL2/Native) |
| **Hermes Dashboard** | `9119` | `http://localhost:9119` | Lokales Web-Dashboard der Hermes-Instanz |
| **PAI Pulse Observatory** | `31337` | `http://localhost:31337` | Visualisierung & System-Observability |
| **LiveKit Server** | `7861` | `http://localhost:7861` | RTC-Audio/Video Streaming (lokal) |

---

## 💻 Installations- & Setup-Protokoll

### Voraussetzungen
- **Betriebssystem**: Windows 10/11
- **Laufzeitumgebungen**: Python 3.10+ & Node.js 18+ (mit Yarn)
- **Containerisierung**: Docker Desktop (für den automatischen Start eines lokalen LiveKit-Servers)
- **WSL2** (Empfohlen für optimale Hermes-Agent Performance)

### 1. Repository klonen & Paketinstallation
Installiere alle NPM-Abhängigkeiten in den jeweiligen Arbeitsbereichen:

```bash
# Hauptverzeichnis & Workspaces initialisieren
yarn install

# Frontend & Desktop Module installieren
yarn --cwd frontend install
yarn --cwd desktop install

# Python-Backend Abhängigkeiten installieren
python -m pip install -r backend/requirements.txt
```

*Hinweis zu PNPM: Im Repository existieren historische `pnpm`-Workspace- und Lock-Dateien. Für alle aktiven Entwicklungen soll Yarn verwendet werden.*

### 2. ADA v2 Setup (Optional)
Für fortgeschrittene CAD-, Web-Agent- und Medien-Features:
```bash
pip install build123d mediapipe python-kasa zeroconf playwright
playwright install chromium
```

### 3. Umgebungsvariablen einrichten
Erstelle eine Datei namens `.env` im Verzeichnis `backend/`:

```env
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
RESEND_API_KEY=re_...
ELITE_API_SECRET=...
NOTIFY_EMAIL=...
MC_URL=http://localhost:3001
MC_API_URL=http://localhost:3001/api
```

---

## 🚀 Start & Ausführung

### Gesamtsystem starten
Der komfortabelste Weg, um Frontend, Backend und Integrations-Dienste parallel zu starten:

```bash
yarn run start:all
```

### Einzeldienste starten
Falls du Module separat debuggen möchtest:

```bash
# Startet Next.js HUD
yarn run start:frontend

# Startet Python LiveKit Core
yarn run start:backend

# Startet Hermes-Gateway & Dashboard
yarn run start:mc
```

### Desktop-App & MSIX-Build
Die Desktop-App wird über Electron im `desktop/`-Verzeichnis ausgeführt und gepackt:

```bash
# Entwicklungsmodus starten
yarn --cwd desktop dev

# MSIX-Paket erstellen (Windows App Package)
yarn --cwd desktop build:msix
```
*Hinweis: Der MSIX-Build erzeugt das Standalone-Frontend, baut Electron und verpackt es via `@microsoft/winappcli` unter Verwendung von `devcert.pfx`.*

---

## ⚙️ Offline- & KI-Modus konfigurieren

Das System unterstützt im HUD unter **Einstellungen → KI-Modus** drei Betriebsmodi:

1. **Auto (Standard)**: Nutzt OpenAI Realtime bei vorhandenem Guthaben, andernfalls automatischer, stiller Fallback auf Offline-Modus.
2. **Cloud**: Erzwingt die Verwendung der OpenAI Realtime API.
3. **Offline**: Deaktiviert OpenAI komplett und arbeitet lokal mit:
   - **Ollama** (für lokales LLM)
   - **Whisper** (für STT)
   - **Piper Neural-TTS** (deutsch, z.B. Thorsten-Stimme)

> [!TIP]
> **Ollama Setup**: Stelle sicher, dass Ollama läuft (`ollama pull mistral` oder `llama3.1`) und die API erreichbar ist.
> **Piper Voice**: Beim ersten Offline-Start wird die Stimme `de_DE-thorsten-high` automatisch nach `%LOCALAPPDATA%/EliteDesktopAgent/voices/piper/` heruntergeladen.

---

## 📖 Entwicklungs- & Memory-Richtlinien (Docs-First)

Jeder Entwicklungsschritt im Projekt folgt dem **Elite Development Protocol**:

1. **Docs-First**: Vor Code-Änderungen immer zuerst die aktuellen Konfigurationen (`package.json`, `requirements.txt`), Kommentare und Dokumente lesen.
2. **Code-Review**: Änderungen mittels `code-review` auf Bugs, Sicherheitslücken und Performance prüfen.
3. **Memory-Synchronisation**: Nach jeder abgeschlossenen Aufgabe ist die Historie chronologisch am Ende von `.agent/CONVERSATION_MEMORY.md` zu erweitern. (Nie die Datei überschreiben oder kürzen!).
4. **Clean-Up**: Unklare Dateien werden nicht gelöscht, sondern zwecks Erhalt der Herkunft nach `Abadoned/` verschoben.

---

*Entwickelt von Webstark.org.*
