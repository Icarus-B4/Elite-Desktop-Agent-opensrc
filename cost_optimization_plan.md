# Implementierungsplan: OpenAI-Kostenoptimierung für Elite Desktop Agent

Dieses Dokument beschreibt die Schritte zur Senkung der OpenAI API-Kosten durch den Wechsel auf intelligentere VAD-Konfigurationen, Modell-Downgrades für Standard- und Vision-Aufgaben auf `gpt-4o-mini` und die Einführung eines automatischen Standby-Inaktivitäts-Timeouts.

## 1. VAD & Wake-Word Tuning (Tightening)
Ziel: Minimierung von falschen Cloud-Aktivierungen durch Hintergrundgeräusche und Reduktion der übermittelten "Listening-Tokens".

*   **VAD-Modus 1 (Hohe Empfindlichkeit)**:
    *   *Datei*: `backend/agent.py` und `backend/local_voice.py`
    *   *Änderung*: Anhebung des Aktivierungs-Schwellenwerts (`threshold` / `activation_threshold`) von `0.45` auf `0.50` (oder `0.5`).
    *   *Begründung*: Ein Schwellenwert von `0.45` ist zu empfindlich und führt bei leisen Hintergrundgeräuschen (z. B. Lüfter, TV, Atemgeräusche) zu unerwünschten Transkriptionstriggern im Cloud-Modus.

## 2. Modell-Downgrade auf `gpt-4o-mini`
Ziel: Die Realtime API und teure Vision-Aufgaben standardmäßig auf das signifikant günstigere `gpt-4o-mini` migrieren (ca. 10x Ersparnis bei Realtime, bis zu 30x bei Vision), während komplexe Logik-Aufgaben konfigurierbar bleiben.

*   **Realtime API**:
    *   *Datei*: `backend/agent.py`
    *   *Änderung*: Übergabe von `model="gpt-4o-mini-realtime-preview"` an den Konstruktor von `openai.realtime.RealtimeModel`.
    *   *Begründung*: Standardmäßig nutzt das LiveKit Realtime-Plugin das teure `gpt-4o-realtime-preview`. Das Mini-Modell reduziert die Audio- und Tokenkosten drastisch.
*   **Webcam- & Vision-Tools**:
    *   *Dateien*: `backend/agent.py`, `backend/tools.py`, `backend/face_vision.py`, `backend/object_vision.py`
    *   *Änderung*: Ändern von `"gpt-4o"` auf `"gpt-4o-mini"` als Default-Modell.
    *   *Begründung*: Vision-Aufgaben wie Bildbeschreibung, Objekterkennung und Gesichtsästhetik-Analyse erfordern für Standardberichte kein schweres `gpt-4o`. `gpt-4o-mini` unterstützt Vision nativ und ist extrem kostengünstig.
*   **CAD- und Web-Agent-Services**:
    *   *Dateien*: `backend/cad_service.py`, `backend/web_agent_service.py`
    *   *Änderung*: Standardmodell von `"gpt-4.1-mini"` auf das offizielle `"gpt-4o-mini"` korrigieren.

## 3. Inaktivitäts-Standby (Silence Detection / Auto-Shutdown)
Ziel: Automatisches Beenden der LiveKit/Realtime-Verbindung nach einer längeren Phase der Inaktivität (Standard: 5 Minuten), um dauerhaftes Streamen und die damit verbundenen Kosten für "Listening-Tokens" zu stoppen.

*   **Inaktivitäts-Monitor**:
    *   *Datei*: `backend/agent.py`
    *   *Änderung*:
        1. Eine Variable `last_activity_time` in `entrypoint` definieren.
        2. Diese Variable bei jedem erkannten Sprachbefehl (`on_user_transcribed`) und Dashboard-Befehl (`on_data_received` mit Text) auf `time.time()` aktualisieren.
        3. Einen asynchronen Hintergrund-Task `inactivity_monitor` starten, der zyklisch prüft, ob `time.time() - last_activity_time > 300` (5 Minuten).
        4. Bei Timeout: Den Benutzer per Sprache informieren ("Elite geht in den Standby-Modus...") und die Verbindung trennen (`ctx.room.disconnect()`).

## 4. Prompt-Caching Vorbereitungen
Ziel: Optimierung der System-Instruktionen für automatisches Prompt-Caching durch OpenAI.

*   *Ansatz*: Sicherstellen, dass die generierten `instructions` in `backend/agent.py` über aufeinanderfolgende Sessions hinweg stabil bleiben.
*   *Begründung*: OpenAI cachtet Prompts >1024 Tokens automatisch, solange der Prompt-Präfix absolut identisch ist. Dynamische Inhalte wie Live-Metriken oder häufig wechselnde PAI-Workstates sollten nicht im statischen System-Prompt platziert werden.

## Verifikationsplan
1.  **Syntax & Kompilierung**: Überprüfung aller geänderten Python-Dateien mit `python -m py_compile`.
2.  **Laufzeit-Tests**: Start des Backend-Agenten und Überprüfung des Live-Verhaltens im HUD.
3.  **VAD-Test**: Validierung, ob das geänderte VAD-Sensitivitätslevel leise Geräusche zuverlässig filtert.
4.  **Timeout-Test**: Kürzere Timeout-Zeit (z. B. 20 Sekunden) konfigurieren und prüfen, ob sich der Agent korrekt verabschiedet und den Raum verlässt.
