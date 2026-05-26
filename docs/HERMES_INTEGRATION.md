# Hermes Agent Integration (Elite Desktop Agent)

Mission Control (JARVIS, Port 3001) wurde archiviert unter `Abadoned/mission-control-jarvis-legacy/`.  
**Hermes Agent** ist die zentrale Intelligenz-Schicht.

## Windows: WSL2 vs. Native (Early Beta)

| Kriterium | **WSL2 (empfohlen)** | **Native Windows** |
|-----------|----------------------|---------------------|
| Stabilität | Battle-tested | Early Beta, „rough edges“ |
| Dashboard Chat (PTY) | ✅ | ❌ (kein POSIX-PTY) |
| CLI + `hermes gateway` | ✅ | ✅ |
| Elite-Standard | `ELITE_HERMES_MODE=auto` nutzt WSL, wenn installiert | `ELITE_HERMES_MODE=native` |

**Installation WSL2 (in der Distro):**

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc
hermes setup
```

**Native (nur wenn kein WSL):**

```powershell
iex (irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1)
hermes setup
```

Elite startet unter Windows automatisch **Gateway + Dashboard** (WSL2):

- `START_JARVIS.bat` → `scripts/start-hermes-gateway.ps1` → `start-hermes-gateway.sh`
- **Electron** (`desktop/services.js`) → dasselbe Skript beim App-Start

Ablauf im Skript:

1. `hermes gateway run` (Port **8642**)
2. Falls nötig: einmalig `npm ci && npm run build` in `~/.hermes/hermes-agent/web`
3. `hermes dashboard --no-open --skip-build` (Port **9119**)

(`hermes gateway start` ist nur für systemd/launchd; unter WSL nutzt Elite `gateway run`.)

Ports **8642** / **9119** werden von WSL2 nach `127.0.0.1` weitergeleitet.

### Umgebungsvariablen

| Variable | Werte | Bedeutung |
|----------|--------|-----------|
| `ELITE_HERMES_MODE` | `auto` (default), `wsl`, `native` | Laufzeitwahl unter Windows |
| `HERMES_WSL_DISTRO` | z. B. `Ubuntu` | WSL-Distribution (sonst erste aus `wsl -l`) |
| `HERMES_HOME` | Pfad | Erzwingt Datenverzeichnis (z. B. `\\wsl.localhost\Ubuntu\home\user\.hermes`) |
| `HERMES_GATEWAY_URL` | Default `http://127.0.0.1:8642` | Gateway-API |
| `HERMES_DASHBOARD_URL` | Default `http://127.0.0.1:9119` | Web-Dashboard |

## Ports

| Dienst | Port | URL |
|--------|------|-----|
| Elite HUD (Next.js) | 3000 | http://127.0.0.1:3000 |
| Hermes Gateway API | 8642 | http://127.0.0.1:8642 |
| Hermes Web Dashboard | 9119 | http://127.0.0.1:9119 |
| PAI Pulse / Observatory | 31337 | http://127.0.0.1:31337 |
| LiveKit / Backend | 7861 | http://127.0.0.1:7861 |

## Zwei verschiedene Web-UIs (wichtig)

| Produkt | Repo | Port (typisch) | Erkennung im Browser |
|---------|------|----------------|----------------------|
| **Hermes Agent (offiziell)** | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | **9119** | Tab-Titel: `Hermes Agent - Dashboard` |
| **Hermes Workspace (Fork)** | [outsourc-e/hermes-workspace](https://github.com/outsourc-e/hermes-workspace) | **9119** (kollidiert!) | Tab-Titel: `Hermes Workspace` |

Elite erwartet **NousResearch** auf `http://127.0.0.1:9119`. Wenn du `pnpm start` / `node server-entry.js` in `~/hermes-workspace` laufen lässt, blockiert der Fork den offiziellen Port — dann siehst du die falsche UI.

**Workspace stoppen, offizielles Dashboard starten:**

```bash
wsl
pkill -f "hermes-workspace.*server-entry" || pkill -f "server-entry.js"   # nur wenn cwd ~/hermes-workspace
# Im Elite-Repo (Windows-Pfad → WSL):
bash scripts/start-hermes-gateway.sh
# oder: hermes dashboard --no-open --skip-build
```

**Release-Pin (nach falschem `hermes update` auf bleeding-edge `main`):**

```bash
cd ~/.hermes/hermes-agent
git fetch --tags
git checkout v2026.5.16    # v0.14.0 — offizielles Release
source venv/bin/activate && uv pip install -e ".[web,pty]"
```

`hermes update` zieht immer `main` — für stabiles UI bewusst auf einem Tag bleiben oder nur mit Backup updaten.

## Installation in WSL (einmalig)

```bash
yarn install:hermes:wsl
```

## Migration Elite → Hermes

```bash
yarn migrate:hermes
yarn sync:hermes-pai
```

- Staged `SOUL.md`, `AGENTS.md`, PAI `USER.md` (inkl. Schweizerdeutsch-Hinweis)
- Führt `hermes claw migrate` in **WSL** aus, wenn verfügbar

## Start

```bash
yarn start:all                # Backend + Frontend (ohne MC)
# Hermes Gateway startet Electron automatisch (WSL2-first)
hermes dashboard              # optional: Web-UI (9119), in WSL empfohlen
```

Gateway-Health (`/v1/models`) erfordert oft `API_SERVER_ENABLED=true` in der Hermes-`.env` — Electron setzt das beim Start mit.

## HUD APIs

- `GET /api/hermes/overview` — Health, Memory/USER-Stats, Log-Tail
- `GET|POST /api/hermes/chat` — OpenAI-kompatibler Proxy zu `POST /v1/chat/completions` (Streaming SSE)
- `GET /api/hermes/memory/search?q=…` — FTS5 (`scripts/hermes_session_search.py`, liest WSL-`state.db` via UNC)
- `GET /api/hermes/logs` — Gateway-Log
- `GET|POST /api/elite/pai/hermes-bridge` — MEMORY/USER → PAI Knowledge
- `GET /api/mission-control/overview` — Legacy-Proxy auf Hermes

## HUD Chat & Elite Voice

1. **Dashboard** → Toolbar **Rakete** → Widget **Hermes Agent** → Tab **Chat**
2. Nachrichten gehen über `POST /api/hermes/chat` → Gateway `:8642` (agentisch, volle Hermes-Tools)
3. **Elite Voice** (LiveKit): Tools `hermes_ask` und `hermes_search_sessions` delegieren an Hermes
4. Vollständiges Web-UI weiterhin: `http://127.0.0.1:9119` (Button **Dashboard** im Widget)

## PAI Pulse

Pulse (31337) bleibt Observability für Algorithm/Loops. Hermes Memory wird per Bridge nach PAI gespiegelt.

## MSIX

Kein Hermes-Binary im Paket. Zielsystem: **WSL2 mit Hermes** oder native `%LOCALAPPDATA%\hermes\bin\hermes.exe`.

## Schweizerdeutsch

Elite LiveKit-STT: `backend/agent.py` (Regel 20) und `stt_corrections.py` — unabhängig von Hermes.
