"""
Webstark Elite Agent – KI-Agent für webstark.org
Optimierte Jarvis-Edition.
"""
import asyncio
import json
import logging
import os
import re
import shutil
import time
import base64
import aiohttp
import psutil
import pyperclip
from datetime import datetime
from livekit.agents import (
    JobContext,
    WorkerOptions,
    cli,
    llm,
)
from livekit import rtc
from livekit.agents.voice import Agent, AgentSession, room_io, UserInputTranscribedEvent
from livekit.agents.voice.events import CloseEvent
from livekit.plugins import openai

from env_loader import ensure_appdata_env_template, load_elite_dotenv
from hermes_config import get_hermes_gateway_log_path, get_hermes_home
from tools import ALL_TOOLS
from skills_manager import load_skills, load_allowlisted_claude_skills, format_skills_for_prompt
from paths import get_writable_path, get_screenshots_dir, get_memory_file
from shared_brain import load_shared_brain_context
from elite_config import (
    cloud_api_key_present,
    load_config,
    resolve_config_path,
    resolve_effective_llm_mode,
    resolve_ollama_model,
    is_local_llm_active,
    validate_llm_stack,
    write_agent_runtime_state,
)
from stt_corrections import WHISPER_INITIAL_PROMPT, apply_german_stt_corrections
from cad_intent import dispatch_cad_to_hud, extract_cad_prompt
from music_intent import dispatch_music_intent, extract_music_intent
from startup_greeting import build_startup_greeting, speak_startup_greeting
from local_voice import (
    build_local_voice_stack,
    check_ollama_openai_compatible,
    check_ollama_reachable,
)
from piper_tts import DEFAULT_PIPER_VOICE, ensure_piper_voice
from pai_orchestrator import PAI_ORCHESTRATOR

# Logging konfigurieren
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("livekit-agent")

HERMES_HOME = get_hermes_home()

WAKE_WORDS = ("elite", "elit", "jarvis", "jarvies")
STT_DOMAIN_PROMPT = WHISPER_INITIAL_PROMPT
STOP_WORDS = (
    "stop",
    "stopp",
    "stoppe",
    "stoppt",
    "halt",
    "ruhe",
    "still",
    "sei ruhig",
    "unterbrechen",
    "abbrechen",
    "schweig",
)

DEBUG_LOG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "debug-8d8747.log"))
DEBUG_SESSION_ID = "8d8747"


def _emit_debug_log(hypothesis_id: str, location: str, message: str, data: dict | None = None) -> None:
    payload = {
        "sessionId": DEBUG_SESSION_ID,
        "runId": "initial",
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data or {},
        "timestamp": int(time.time() * 1000),
    }
    try:
        # region agent log
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as debug_file:
            debug_file.write(json.dumps(payload, ensure_ascii=False) + "\n")
        # endregion
    except Exception as debug_err:
        logger.debug("Debug-Log konnte nicht geschrieben werden: %s", debug_err)


IMPERATIVE_STARTERS = (
    "öffne",
    "oeffne",
    "schließe",
    "schliesse",
    "schließe",
    "starte",
    "stoppe",
    "stopp",
    "halt",
    "ruhe",
    "spiele",
    "merk",
    "lies",
    "zeig",
    "analysiere",
    "recherchiere",
    "ideate",
    "optimize",
    "optimiere",
    "erstelle",
    "generiere",
    "liste",
    "ghost",
    "kamera",
    "wetter",
    "bereite",
    "minimiere",
    "schließe alle",
    "run the algorithm",
    "führe aus",
    "was steht",
    "was siehst",
    "öffne webseite",
    # Schweizerdeutsch-Varianten
    "lueg",       # schau
    "mach",       # mach (mal)
    "tue",        # tu / mach
    "zeig mol",   # zeig mal
    "gib",        # gib
    "hilf",       # hilf
    "such",       # such
    "chunnsch",   # kannst du
    "hesch",      # hast du
    "gaht",       # geht
)

SILENCE_PHRASES = (
    "stumm",
    "mute",
    "schweig",
    "sei still",
    "nicht sprechen",
    "schalt dich stumm",
    "schalte dich stumm",
    "bleib stumm",
    "sei stumm",
)


def _replace_wake_aliases(text: str, aliases: tuple[str, ...], canonical: str) -> str:
    """Ersetzt STT-Fehlhörungen nur als ganze Wörter (Wortgrenzen)."""
    out = text
    for alias in aliases:
        out = re.sub(
            rf"(^|\s){re.escape(alias)}(\s|$)",
            rf"\1{canonical}\2",
            out,
        )
    return out


def normalize_transcript(transcript: str) -> str:
    """STT-Varianten (z. B. 'Elli', 'Elit') auf Wake-Words normalisieren."""
    t = (transcript or "").strip().lower()
    t = re.sub(r"[,!.?;:]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()

    # 1. Sichere Wake-Words (werden immer normalisiert)
    t = _replace_wake_aliases(
        t,
        (
            "elite",
            "elit",
            "ellit",
            "elli",
            "eli",
            "ellie",
            "elites",
            "elitä",
            "elita",
            "ellitä",
            "alight",
            "alite",
            "ernie",
            "erni",
            "erny",
        ),
        "elite",
    )
    t = _replace_wake_aliases(
        t,
        (
            "jarvis",
            "jarvies",
            "jarvie",
            "dschawis",
            "dschavis",
            "dscharvis",
            "travis",
            "yaris",
            "jervis",
        ),
        "jarvis",
    )

    # 2. Riskante Wake-Words (phonetische Fehlhörer, die leicht im TV oder Hintergrund fallen)
    # Diese werden NUR normalisiert, wenn ein klarer Befehls- oder Medienkontext vorliegt.
    has_cmd_context = (
        any(t.startswith(s) or f" {s}" in t for s in IMPERATIVE_STARTERS)
        or any(
            marker in t
            for marker in (
                "öffne",
                "oeffne",
                "öffnet",
                "zattoo",
                "saturn",
                "pro sieben",
                "prosieben",
                "pro7",
                "pro 7",
                "spiel",
                "play",
                "pause",
                "stopp",
                "halt",
                "ruhe",
                "schließe",
                "minimieren",
                "lauter",
                "leiser",
                "musik",
                "song",
                "wetter",
                "licht",
                "lampe",
                "steckdose",
                "kasa",
                "zeig",
                "show",
                "editor",
                "schreibe",
                "kopiere",
                "clipboard",
                "erneut",
                "nochmal",
            )
        )
    )

    if has_cmd_context:
        # Sehr riskante Elite-Fehlhörer
        t = _replace_wake_aliases(t, ("light", "lite", "aly", "allie"), "elite")
        # Sehr riskante Jarvis-Fehlhörer
        t = _replace_wake_aliases(
            t,
            ("arvis", "charvis", "java", "davis", "charles", "charly"),
            "jarvis",
        )

    return t


def normalize_command_for_agent(transcript: str) -> str:
    """Korrigiert bekannte STT-Verhörer, bevor strikte Wake-Word-Antworten ans LLM gehen."""
    original = (transcript or "").strip()
    stt_fixed = apply_german_stt_corrections(original)
    t = normalize_transcript(stt_fixed)
    if not t:
        return original

    corrected = t
    corrected = re.sub(r"\böffnet\b", "öffne", corrected)

    has_prosieben = any(
        phrase in corrected
        for phrase in ("pro sieben", "prosieben", "pro7", "pro 7")
    )
    if has_prosieben:
        corrected = re.sub(r"\bsaturn\b", "zattoo", corrected)
        corrected = re.sub(r"\bpro\s*7\b|\bpro sieben\b|\bprosieben\b", "ProSieben", corrected)
        if _phrase_has_word(corrected.lower(), "zattoo"):
            return "Elite, öffne Zattoo ProSieben."

    # Nur dann normalisierte Kleinschreibung verwenden, wenn tatsächlich korrigiert wurde.
    if corrected != t or stt_fixed != original or t != re.sub(r"[,!.?;:]+", " ", original.lower()).strip():
        return corrected
    return original


def transcript_has_wake_word(transcript: str) -> bool:
    t = normalize_transcript(transcript)
    return any(_phrase_has_word(t, w) for w in WAKE_WORDS)


def _phrase_has_word(text: str, phrase: str) -> bool:
    return re.search(rf"(^|\W){re.escape(phrase)}(\W|$)", text) is not None


def transcript_accepted(transcript: str, va_mode: int) -> bool:
    """Wake-word (modes 0/3) or wake-word + clear imperative (modes 1/2)."""
    corrected = apply_german_stt_corrections(transcript)
    t = normalize_transcript(corrected)
    if not t:
        return False
    if transcript_has_wake_word(corrected):
        return True
    if va_mode in (0, 3):
        return False
    if any(t.startswith(s) for s in IMPERATIVE_STARTERS):
        return True
    if any(f" {s}" in t for s in IMPERATIVE_STARTERS):
        return True
    if any(s in t for s in ("stopp", "halt", "ruhe")):
        return True
    return False


def is_stop_command(transcript: str) -> bool:
    """Erkennt kurze Unterbrechungs-Befehle wie 'Stopp', 'Halt', 'Ruhe' (Wortgrenzen)."""
    corrected = apply_german_stt_corrections(transcript)
    t = normalize_transcript(corrected)
    if not t:
        return False
    if any(_phrase_has_word(t, s) for s in STOP_WORDS):
        return True
    if len(t.split()) <= 4:
        for word in t.split():
            if word in ("stop", "stopp", "stoppe", "stoppt", "halt", "ruhe", "still", "stope"):
                return True
    return False


def _elite_turn_handling() -> dict:
    """Schnellere Unterbrechung — kein Wiederaufnehmen nach kurzem 'Stopp'."""
    return {
        "turn_detection": "vad",
        "interruption": {
            "enabled": True,
            "mode": "vad",
            "min_duration": 0.12,
            "min_words": 0,
            "resume_false_interruption": False,
            "false_interruption_timeout": None,
            "backchannel_boundary": (0.15, 0.45),
        },
        "endpointing": {
            "min_delay": 0.22,
            "max_delay": 1.0,
        },
        "preemptive_generation": {"enabled": False},
    }


def is_silence_command(transcript: str, va_mode: int) -> bool:
    """Nutzer will Sprachausgabe beenden / Elite soll schweigen (nicht Mic-Hardware)."""
    t = normalize_transcript(transcript)
    if not t:
        return False
    if not any(p in t for p in SILENCE_PHRASES):
        return False
    if va_mode in (0, 3):
        return transcript_has_wake_word(transcript)
    return True


class HermesBridge:
    """Legacy Mission Control activity feed → HUD log stream (Hermes hat kein /api/activity)."""

    @staticmethod
    async def post_activity(actor: str, action: str, description: str):
        return


MissionControl = HermesBridge

def apply_livekit_env_from_config() -> str | None:
    """
    Wendet livekitMode aus config.json auf os.environ an.
    Läuft beim Modul-Import (auch in Worker-Subprozessen von `agent.py dev`).
    """
    try:
        config = load_config()
        if config.get("livekitMode") != "local":
            return None
        local_url = os.environ.get("LIVEKIT_LOCAL_URL", "ws://127.0.0.1:7880")
        os.environ["LIVEKIT_URL"] = local_url
        os.environ["LIVEKIT_API_KEY"] = "devkey"
        os.environ["LIVEKIT_API_SECRET"] = "secret"
        logger.info("LiveKit-Modus: LOKAL aktiv (%s)", local_url)
        return local_url
    except Exception as e:
        logger.error("LiveKit-Config konnte nicht geladen werden: %s", e)
        return None


def bootstrap_elite_runtime() -> None:
    created = ensure_appdata_env_template()
    if created:
        logger.info("AppData-Umgebungsdatei bereitgestellt: %s", created)
    loaded = load_elite_dotenv()
    if loaded:
        logger.info("Umgebung geladen aus: %s", ", ".join(loaded))
    else:
        logger.warning(
            "Keine .env/.env.local gefunden. Cloud braucht OPENAI_API_KEY unter "
            "%%LOCALAPPDATA%%\\EliteDesktopAgent\\backend\\.env.local"
        )
    apply_livekit_env_from_config()


bootstrap_elite_runtime()


async def analyze_frame_with_vision(frame_b64: str) -> tuple[str, dict | None]:
    """Analyse eines Frames via GPT-4o Vision. Returns (description, gallery_entry)."""
    if is_local_llm_active():
        return (
            "Vision im Offline-KI-Modus nicht verfügbar (kein OpenAI). "
            "Wechsle in den Einstellungen auf „Cloud KI“ oder nutze Desktop-Befehle ohne Kamera-Analyse.",
            None,
        )

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return "Fehler: Kein Vision API Key vorhanden.", None

    # Data-URL Prefix entfernen falls vorhanden
    if "," in frame_b64:
        frame_b64 = frame_b64.split(",", 1)[1]

    screenshots_dir = get_screenshots_dir()
    
    filename = f"webcam_{int(time.time())}.jpg"
    filepath = os.path.join(screenshots_dir, filename)

    try:
        with open(filepath, "wb") as f:
            f.write(base64.b64decode(frame_b64))
        logger.info(f"Frame physisch gespeichert: {filepath}")
        
        async with aiohttp.ClientSession() as session:
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Beschreibe kurz und präzise auf Deutsch, was du auf diesem Kamerabild siehst. Antworte wie ein Butler (Jarvis-Stil)."},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}", "detail": "low"}}
                        ]
                    }
                ],
                "max_tokens": 150
            }
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=15
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    description = data["choices"][0]["message"]["content"]
                    
                    new_entry = {
                        "id": f"img_{int(time.time())}",
                        "timestamp": int(time.time() * 1000),
                        "src": f"/api/elite/gallery/image?file={filename}",
                        "labels": [description[:30] + "..."],
                        "confidence": 0.95,
                        "analysis": {
                            "description": description,
                            "filename": filename,
                        },
                    }
                    try:
                        gallery_path = os.path.join(screenshots_dir, "gallery.json")
                        gallery_data = []
                        if os.path.exists(gallery_path):
                            try:
                                with open(gallery_path, "r", encoding="utf-8") as gf:
                                    content = gf.read().strip()
                                    if content:
                                        gallery_data = json.loads(content)
                            except Exception:
                                gallery_data = []
                        gallery_data.insert(0, new_entry)
                        with open(gallery_path, "w", encoding="utf-8") as gf:
                            json.dump(gallery_data[:100], gf, indent=2)
                        logger.info(f"Galerie aktualisiert: {gallery_path}")
                    except Exception as ge:
                        logger.error(f"Fehler beim Speichern der Galerie-Daten: {ge}")
                    return description, new_entry
                return f"Vision-Fehler (HTTP {resp.status})", None
    except Exception as e:
        return f"Analyse fehlgeschlagen: {str(e)}", None

class WebstarkAgent(Agent):
    """Elite – der hochintelligente KI-Desktop-Assistent."""
    def __init__(self, user_name: str = "Admin", llm_mode: str | None = None):
        config = load_config()
        if llm_mode is None:
            llm_mode = resolve_effective_llm_mode(config)[0]
        os.environ["ELITE_LLM_MODE"] = llm_mode
        config_path = resolve_config_path()

        # SOUL.md laden (Persönlichkeit)
        soul_path = os.path.join(os.path.dirname(__file__), "..", "agents", "elite-agent", "SOUL.md")
        soul_text = ""
        try:
            with open(soul_path, "r", encoding="utf-8") as f:
                soul_text = f.read()
        except Exception:
            soul_text = "Professionell, ruhig und Jarvis-ähnlich. Präzise und effizient."

        # Dynamische Anpassung basierend auf Soul Matrix
        soul_matrix_modes = [
            "Du agierst als Elite: Absolut professionell, analytisch und extrem reduziert.",
            "Du agierst als Jarvis: Sehr hilfsbereit, proaktiv und zuvorkommend.",
            "Du agierst als Ghost: Fast unsichtbar, extrem diskret, antwortet nur auf das Nötigste."
        ]
        current_mode = soul_matrix_modes[config["soulMatrix"]] if config["soulMatrix"] < len(soul_matrix_modes) else soul_matrix_modes[0]

        instructions = (
            f"IDENTITÄT: {current_mode}\n"
            f"Du bist 'Elite', ein hocheffizienter KI-Desktop-Assistent. "
            f"Deine Stimme ist tief, besonnen und autoritär. Der Nutzer heißt {user_name}.\n\n"
            f"--- SOUL ---\n{soul_text}\n\n"
            "VERHALTENSREGELN (STRENG):\n"
            "1. KOMMUNIKATION: Analytisch, präzise, extrem reduziert. Sprache: 'Elite'/'Jarvis' ODER klarer Imperativ (z.B. 'Öffne Chrome'). Rauschfilter-Modus 0/3: nur Wake-Word. Modus 1/2: auch klare Befehle. Ignoriere TV und Hintergrundgespräche.\n"
            "2. MEDIEN/SYSTEM: Alle Aktionen erfolgen ABSOLUT LAUTLOS.\n"
            "3. VAD & UNTERBRECHUNG: Reagiere SOFORT auf 'Stopp', 'Halt' oder 'Ruhe'. Brich jede Sprachausgabe augenblicklich ab. Bleibe stumm bei Hintergrundgeräuschen.\n"
            "4. MULTITASKING: Du kannst mehrere Tools parallel oder kurz hintereinander ausführen. Sei effizient.\n"
            "5. INTELLIGENZ: Denke vorausschauend. Wenn du eine App nicht kennst, nutze 'list_installed_apps'.\n"
            "6. STATUS: Nutze das Dashboard-Logging (emit_log), um Status-Updates zu geben.\n"
            "7. VISION & DASHBOARD: Nutze 'trigger_visual_scan' für Umgebungsscans. Du kannst Widgets (webcam, music, chat, systemMonitor, logStream, imageGrid, textEditor, missionControl, cad, printer, browserAgent, kasa, gestureControl, authLock) mit 'manage_dashboard_widgets' steuern. WICHTIG: Wenn der Nutzer 'Kamera schließen' sagt, nutze das Tool mit action='close' und widget_id='webcam'.\n"
            "8. WORKSPACE & AUTOMATION: Du kannst den Desktop für Aufgaben vorbereiten. Nutze 'prepare_workspace' für 'Coding', 'Design' oder 'Musik'. Du kannst Fenster auch exakt mit 'move_window' positionieren.\n"
            "9. PROGRAMME & MUSIK: Bei 'spiele Musik', 'play music', 'Musik an' oder ähnlichen allgemeinen Musikwünschen IMMER zuerst 'play_random_music' aufrufen (lokale Bibliothek, zufälliger Song). Für einen bestimmten Song: 'scan_music_library' dann 'play_local_song'. Fallback: 'youtube_search_ui'. Kein Spotify Premium – erfinde keine technischen Ausreden. Spotify nur über UI (media_control), falls explizit gewünscht.\n"
            "10. UMGEBUNG: Wenn du nach dem Wetter gefragt wirst oder Wetterinfos gibst, nutze IMMER das Tool 'update_weather_widget', um das HUD zu synchronisieren.\n"
            "11. FEHLERBEHEBUNG: Falls ein Tool fehlschlägt, versuche eine Alternative (z.B. YouTube statt Spotify). Informiere den Nutzer kurz, aber ohne technische Details über Python-Bibliotheken.\n"
            "12. SCHWEIGEPFLICHT: Wenn du nicht sicher bist, ob du gemeint warst, bleibe STUMM.\n"
            "13. SPRACHE & SONDERZEICHEN (ABSOLUTE PRIORITÄT): Immer wenn der Nutzer ein deutsches Wort ausspricht, das Umlaute (ä, ö, ü) oder das Eszett (ß) enthält, musst du diesen Laut ZWISCHEN DEN ANFÜHRUNGSZEICHEN IM TOOL AUFLÖSEN.\n"
            "14. SPRACHE DEUTSCH & HINTERGRUND-FILTER: Transkribiere und antworte NUR auf Deutsch. "
            "Ignoriere TV, YouTube, fremdsprachige Passagen (z.B. Chinesisch/Englisch aus Videos) und Gespräche im Raum. "
            "AUSNAHME: 'Öffne <Sendername>' oder '<Sendername> in Zattoo' sind BEFEHLE — keine Hintergrundgeräusche! "
            "Führe Sender-Öffnen-Befehle (ProSieben, MTV, Comedy Central, SRF etc.) IMMER mit open_app(name) oder open_website(url) aus. "
            "Reagiere NUR wenn der Chef dich klar mit 'Elite', 'Jarvis' oder einem eindeutigen Befehl anspricht – sonst absolut stumm.\n"
            "15. ANTI-ECHO / ANTI-LOOP: Kein Smalltalk, kein 'Hallo', kein 'bereit', kein Wiederholen von Regeln. "
            "Eine kurze Antwort nur nach klarem Chef-Befehl. TV-, Sport- oder fremdsprachiger Input = absolut stumm.\n"
            "16. WEBSEITEN ÖFFNEN: Bei 'öffne Webseite X' / 'geh zu URL' IMMER Tool open_website(url) mit der konkreten Domain/URL. "
            "NIEMALS nur launch_app('brave'/'chrome') — das startet den Browser ohne Zieladresse.\n"
            "17. DESKTOP AUFRÄUMEN: Bei 'schließe alle Fenster', 'minimiere alles' oder 'Desktop leeren' "
            "IMMER 'close_all_desktop_windows' – NIEMALS close_window('elite') und NIEMALS MinimizeAll ohne Tray. "
            "Elite bleibt im System-Tray aktiv.\n"
            "18. CHAT- & TEXTEINGABE: Wenn der Nutzer schriftliche Befehle direkt in das Chat-Fenster eintippt, ist KEIN Wake-Word ('Elite' oder 'Jarvis') erforderlich. Führe schriftliche Befehle und Anfragen (wie z. B. 'ideate...', 'optimize...' oder Steuerungskommandos) immer direkt, unverzüglich und vollständig aus."
            "19. HERMES AGENT: Mission Control (Port 3001) ist durch Hermes ersetzt. "
            "Für agentische Aufgaben, Memory, Recherche oder Multi-Step IMMER 'hermes_ask' nutzen. "
            "Für alte Sessions/Themen: 'hermes_search_sessions'. "
            "HUD: Widget «Hermes Agent» → Tab Chat. Legacy MC-Tools (mc_*) nur wenn explizit Kanban/Inbox — sonst Hermes."
            "20. SCHWEIZERDEUTSCH & DIALEKT-TOLERANZ: Der Nutzer spricht oft Schweizerdeutsch (Mundart). "
            "Interpretiere Dialekt-Phonetik intelligent: 'chönntsch' = 'könntest', 'lueg' = 'schau', "
            "'gopferdami' = Fluch (ignorieren), 'grüezi' = 'hallo', 'tschau' = 'tschüss', "
            "'isch' = 'ist', 'nöd' = 'nicht', 'hets' = 'hat es', 'chli' = 'klein/etwas', "
            "'mach mol' = 'mach mal', 'gaht' = 'geht', 'gsi' = 'gewesen', 'hesch' = 'hast du'. "
            "Auch wenn die STT-Transkription Dialektwörter falsch oder phonetisch verschriftet, "
            "versuche den GEMEINTEN Befehl aus dem Kontext zu erschließen. "
            "Frage NUR nach wenn absolut unklar.\n"
            "Wenn in einem Medienbefehl 'Saturn' zusammen mit 'ProSieben', 'Pro sieben' oder 'Pro7' erscheint, "
            "ist mit hoher Wahrscheinlichkeit 'Zattoo' gemeint. Öffne dann Zattoo und behandle den Sender als ProSieben.\n"
            "21. SELBSTHEILUNG & LERNEN: Du hast Zugriff auf 'trigger_self_healing_workflow', 'trigger_system_analysis_and_repair' und 'trigger_learning_cycle'. Wenn der Nutzer eine Systemreparatur oder Systemanalyse verlangt, starte IMMER zuerst 'trigger_system_analysis_and_repair'. Dieses Tool prüft das gesamte System, loggt gefundene Fehler in einem Markdown-Bericht auf dem Desktop und stößt automatisch die Selbstheilung an. Wenn der Nutzer über einen konkreten Fehler klagt, starte direkt 'trigger_self_healing_workflow' mit der Fehlermeldung und der betroffenen Datei. Falls die Selbstheilung meldet, dass die Datei fehlt oder unbekannt ist, suche die Datei aktiv mit 'execute_system_command' unter Verwendung von PowerShell-Suchbefehlen (z. B. 'Get-ChildItem -Recurse -Filter <name>') im Projektverzeichnis, ermittle den absoluten Pfad und rufe 'trigger_self_healing_workflow' erneut mit dem expliziten 'target_file'-Parameter auf. Starte regelmäßig oder nach größeren Aufgaben 'trigger_learning_cycle', um gelernte Regeln zu konsolidieren und deine Arbeitsweise selbstständig zu optimieren.\n"
            "23. CODE-REVIEW (CodeReview / code-review): Für Code-Analyse, Qualitätsprüfung oder Review lies den Skill per 'read_file' am Pfad aus <available_skills><location> (z. B. backend/skills/code_review/SKILL.md oder .claude/skills/CodeReview/SKILL.md) und folge Workflows/Review.md. Skills sind Markdown-Anleitungen — starte NIEMALS 'run_code_review.py', 'elite_dev_runner.py' oder 'spawn_agent_worker' für Skills; diese Dateien existieren nicht.\n"
            "22. ADA-FÄHIGKEITEN: Nutze Projekt-Tools (create_project, switch_project, list_projects, get_project_context) für task-scoped Memory. "
            "CAD: generate_cad_prototype / iterate_cad_prototype → cad-Widget. Drucker: discover_printers, slice_stl, start_print, get_print_status → printer-Widget (Mock bis Hardware). "
            "Web-Agent: run_web_agent für mehrstufige Browser-Aufgaben → browserAgent-Widget. Kasa: kasa_discover, kasa_control → kasa-Widget. "
            "Face Auth: enroll_face_reference wenn Nutzer Enrollment will; bei aktivierter Face Auth keine riskanten Tools ohne Auth. "
            "Widget-IDs: cad, printer, browserAgent, kasa, authLock.\n"
            "24. GEDÄCHTNIS & PERSÖNLICHKEIT: Du hast ein GEMEINSAMES GEDÄCHTNIS mit Hermes (shared brain). "
            "Dein Langzeitgedächtnis wird beim Start automatisch geladen — du weißt bereits, was du dir früher gemerkt hast. "
            "PROAKTIVES MERKEN: Wenn der Nutzer persönliche Informationen teilt (Name, Beruf, Vorlieben, Hobbys, "
            "bevorzugte Programme, Arbeitsgewohnheiten), speichere sie SOFORT mit 'update_agent_memory' unter category='preferences'. "
            "Wenn der Nutzer fragt 'Was weißt du über mich?', antworte direkt aus deinem geladenen Gedächtnis — "
            "du musst NICHT erst 'read_agent_memory' aufrufen, da die Daten bereits im Kontext sind. "
            "Nur 'read_agent_memory' nutzen, wenn der Nutzer explizit den kompletten Speicher sehen will.\n"
        )
        extra_instructions = (
            "Du schweigst, wenn du nicht angesprochen wirst. Du lachst nicht, du nickst nicht, du atmest nicht. "
            "Kein 'ich bin hier', kein 'verstanden', kein 'bereit für den nächsten Befehl'. "
            "Starte niemals selbst ein Gespräch."
        )
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    if config.get("personalityPatch"):
                        extra_instructions += "\n\n--- Persönlichkeits-Patch ---\n" + config["personalityPatch"]
            except Exception:
                pass        

        state = PAI_ORCHESTRATOR.refresh_context()
        pai_user_dir = state.user_dir
        pai_instructions = state.context
        if pai_user_dir:
            logger.info("PAI-Profil geladen aus %s (SOUL aus Repo, kein Doppel-Load)", pai_user_dir)

        # 🧠 Skills laden (Fury Pattern)
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        skills_dir = os.path.join(os.path.dirname(__file__), "skills")
        agent_skills_dir = os.path.join(repo_root, ".agent", "skills")
        claude_skills_dir = os.path.join(repo_root, ".claude", "skills")
        elite_claude_skill_allowlist = {"CodeReview"}

        available_skills = load_skills(skills_dir)
        if os.path.exists(agent_skills_dir):
            available_skills.extend(load_skills(agent_skills_dir))
        available_skills.extend(
            load_allowlisted_claude_skills(claude_skills_dir, elite_claude_skill_allowlist)
        )

        if available_skills:
            instructions += format_skills_for_prompt(available_skills)
            
        # PAI-Instruktionen einfügen falls geladen
        if pai_instructions:
            # Sicherheits-Kürzung für OpenAI Realtime API (max 16384 Tokens Session-Instructions Limit)
            max_context_chars = 4000
            truncated_context = pai_instructions
            if len(truncated_context) > max_context_chars:
                truncated_context = truncated_context[:max_context_chars] + "\n... [PAI-Kontext gekürzt wegen Realtime API Limit]"

            instructions += (
                f"\n\n--- DANIEL MIESSLER PAI LIFE OS CONTEXT ---\n"
                f"Du bist das ausführende Gehirn der Personal AI Infrastructure (PAI). "
                f"Deine Kern-Identität und Arbeitsgrundlage basiert direkt auf den folgenden Benutzer-Konfigurationen: "
                f"{truncated_context}"
            )
            if state.work_state:
                ws_filtered = dict(state.work_state)
                ws_filtered.pop("sessions", None)
                ws_str = json.dumps(ws_filtered, ensure_ascii=False, indent=2)
                instructions += (
                    "\n\n--- PAI WORK STATE ---\n"
                    f"{ws_str}"
                )
            
        instructions += extra_instructions

        # Gemeinsames Gehirn (Elite + Hermes Memory) in den Prompt laden
        try:
            brain_context = load_shared_brain_context()
            if brain_context:
                instructions += brain_context
        except Exception as brain_err:
            logger.warning("Shared Brain konnte nicht geladen werden: %s", brain_err)

        if llm_mode == "local":
            instructions += (
                "\n\nOFFLINE-MODUS: Du läufst lokal über Ollama. Antworte kurz auf Deutsch. "
                "CAD- und Musik-Befehle werden automatisch als Tools ausgeführt — nicht nur ankündigen. "
                "Alle anderen Desktop-Tools bleiben verfügbar wenn Ollama /v1 mit Tools läuft."
            )

        # VAD: Höherer threshold = weniger Hintergrund/TV (OpenAI server_vad 0.0–1.0)
        # voiceAssistant: 0 = Rauschfilter (empfohlen), 1 = hohe Empfindlichkeit, 2 = schnelle Antwort, 3 = Ultra-Strict VAD
        va_mode = int(config.get("voiceAssistant", 0))
        if va_mode == 1:
            threshold = 0.50
            silence_duration_ms = 750
            prefix_padding_ms = 450
        elif va_mode == 2:
            threshold = 0.52
            silence_duration_ms = 450
            prefix_padding_ms = 400
        elif va_mode == 3:
            threshold = 0.70
            silence_duration_ms = 1500
            prefix_padding_ms = 350
        else:
            threshold = 0.65
            silence_duration_ms = 1400
            prefix_padding_ms = 400

        # Strict modes (0/3): keine Auto-Antwort von Realtime — nur nach Wake-Word-Gate
        gate_auto_response = va_mode not in (0, 3)
        if va_mode == 0:
            # server_vad statt semantic_vad: zuverlässigere STT-Erkennung bei Deutsch,
            # moderater threshold filtert TV/Hintergrund weiterhin, verhindert aber Silben-Abschneiden.
            turn_detection = {
                "type": "server_vad",
                "threshold": 0.58,
                "prefix_padding_ms": prefix_padding_ms,
                "silence_duration_ms": silence_duration_ms,
                "create_response": gate_auto_response,
                "interrupt_response": True,
            }
        else:
            turn_detection = {
                "type": "server_vad",
                "threshold": threshold,
                "prefix_padding_ms": prefix_padding_ms,
                "silence_duration_ms": silence_duration_ms,
                "create_response": gate_auto_response,
                "interrupt_response": True,
            }

        self._gate_auto_response = gate_auto_response

        if llm_mode == "local":
            stack = build_local_voice_stack(config)
            ollama_model, ollama_url = resolve_ollama_model(config)
            logger.info(
                "Elite OFFLINE-KI: Whisper=%s, Ollama=%s @ %s, API=%s, TTS=%s",
                config.get("whisperModel", "base"),
                ollama_model,
                ollama_url,
                stack.ollama_api_mode,
                stack.tts_engine,
            )
            super().__init__(
                instructions=instructions,
                tools=ALL_TOOLS,
                vad=stack.vad,
                stt=stack.stt,
                llm=stack.llm,
                tts=stack.tts,
                turn_handling=_elite_turn_handling(),
                min_endpointing_delay=0.22,
                max_endpointing_delay=1.0,
                allow_interruptions=True,
            )
        else:
            super().__init__(
                instructions=instructions,
                llm=openai.realtime.RealtimeModel(
                    model=config.get("realtimeModel", "gpt-realtime-mini"),
                    voice=config.get("voice", "coral"),
                    modalities=["audio", "text"],
                    input_audio_transcription={
                        "model": "gpt-4o-mini-transcribe",
                        "language": "de",
                        "prompt": STT_DOMAIN_PROMPT,
                    },
                    input_audio_noise_reduction="near_field",
                    turn_detection=turn_detection,
                ),
                tools=ALL_TOOLS,
            )

def clean_text_for_speech(text: str) -> str:
    import re
    # Code-Blöcke komplett entfernen
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Inline-Code-Backticks entfernen
    text = text.replace('`', '')
    # Markdown-Sterne und Unterstriche entfernen
    text = text.replace('*', '').replace('_', '')
    # Eventuelle leere Zeilen bereinigen
    text = re.sub(r'\s+', ' ', text).strip()
    return text


async def entrypoint(ctx: JobContext):
    logger.info(f"--- Neue Session gestartet (Room: {ctx.room.name}) ---")
    try:
        # 1. Verbindung zum Raum herstellen
        await ctx.connect()
        logger.info("Mit LiveKit-Raum verbunden.")

        # Zentraler PAI Startup-Sync (Memory + MC Files + Context refresh)
        try:
            logger.info("Triggere zentralen PAI-Orchestrator Startup-Sync...")
            await PAI_ORCHESTRATOR.startup_sync()
        except Exception as e:
            logger.error("Fehler beim PAI-Orchestrator Startup-Sync: %s", e)

        try:
            participant = await ctx.wait_for_participant()
            logger.info(f"Teilnehmer beigetreten: {participant.identity}")
        except Exception as e:
            logger.error(f"Fehler beim Warten auf Teilnehmer: {e}")
            return

        user_name = "System Admin"
        if participant.metadata:
            try:
                metadata = json.loads(participant.metadata)
                user_name = metadata.get("userName", "System Admin")
            except:
                pass

        async def publish_room_data(payload: dict) -> None:
            try:
                if ctx.room.isconnected() and ctx.room.local_participant:
                    await ctx.room.local_participant.publish_data(
                        json.dumps(payload, ensure_ascii=False).encode("utf-8")
                    )
            except Exception as ne:
                logger.error("Fehler beim Senden von Room-Daten: %s", ne)

        config = load_config()
        llm_mode, llm_fallback_reason = resolve_effective_llm_mode(config)
        stack_ok, _, stack_msg, _ = validate_llm_stack(config)
        livekit_mode = str(config.get("livekitMode", "cloud")).lower()
        configured_mode = str(config.get("llmMode", "auto")).lower()
        write_agent_runtime_state(
            configured_llm_mode=configured_mode,
            effective_llm_mode=llm_mode,
            fallback_reason=llm_fallback_reason,
            llm_stack_ready=stack_ok,
            llm_stack_message=stack_msg or None,
        )
        if not stack_ok:
            logger.error("LLM-Stack nicht bereit — Session wird nicht gestartet: %s", stack_msg)
            await publish_room_data(
                {
                    "type": "llm_unavailable",
                    "message": stack_msg,
                    "effective": llm_mode,
                    "fallback": llm_fallback_reason,
                }
            )
            return
        logger.info(
            "Elite Agent startet fuer %s (Identity: %s, llmMode=%s, effective=%s, livekitMode=%s, openaiKey=%s)...",
            user_name,
            participant.identity,
            configured_mode,
            llm_mode,
            livekit_mode,
            "ja" if cloud_api_key_present() else "NEIN",
        )

        if llm_fallback_reason:
            if llm_fallback_reason == "insufficient_quota":
                logger.error(
                    "OpenAI-Guthaben aufgebraucht – wechsle auf Offline-KI (Ollama), "
                    "kein Realtime-Retry."
                )
                await publish_room_data(
                    {
                        "type": "openai_quota_exhausted",
                        "message": "OpenAI-Guthaben aufgebraucht. Offline-KI (Ollama) wird verwendet.",
                        "fallback": "local",
                    }
                )
            elif llm_fallback_reason == "no_key":
                logger.error(
                    "Cloud-Modus ohne OPENAI_API_KEY – Fallback auf Offline-KI. Datei anlegen: "
                    "%%LOCALAPPDATA%%\\EliteDesktopAgent\\backend\\.env.local"
                )
            else:
                logger.warning(
                    "OpenAI-Probe fehlgeschlagen (%s) – Fallback auf Offline-KI (Ollama).",
                    llm_fallback_reason,
                )

        if llm_mode == "local":
            ollama_model, ollama_url = resolve_ollama_model(config)
            logger.info("Offline-Ollama aktiv: %s @ %s", ollama_model, ollama_url)
            if str(config.get("offlineTtsEngine", "piper")).lower() != "pyttsx3":
                voice_id = str(config.get("piperVoice") or DEFAULT_PIPER_VOICE)
                try:
                    await asyncio.to_thread(ensure_piper_voice, voice_id)
                except Exception as pe:
                    logger.warning("Piper-Stimme konnte nicht vorgeladen werden: %s", pe)
            if check_ollama_reachable(ollama_url) and not check_ollama_openai_compatible(
                ollama_url, ollama_model
            ):
                await publish_room_data(
                    {
                        "type": "log_event",
                        "log": {
                            "type": "system",
                            "message": (
                                "Offline-KI: Ollama-Server ist veraltet (keine /v1-API). "
                                "Native /api/chat aktiv – bitte Ollama aktualisieren für volle Tool-Nutzung."
                            ),
                        },
                    }
                )

        # Agent Instanz erstellen
        agent = WebstarkAgent(user_name=user_name, llm_mode=llm_mode)
        agent.room = ctx.room # Direkt am Agenten speichern für einfachen Zugriff
        
        # Session starten – AEC-Warmup reduziert: Standard=3s blockiert Unterbrechungen zu lange
        session = AgentSession(
            aec_warmup_duration=0.5,
            turn_handling=_elite_turn_handling(),
            allow_interruptions=True,
        )
        active_reply_task: asyncio.Task | None = None
        last_activity_time = time.time()

        @session.on("close")
        def on_session_close(ev: CloseEvent) -> None:
            logger.warning(
                "AgentSession beendet: reason=%s error=%s",
                ev.reason,
                ev.error,
            )

            async def session_end_sync() -> None:
                try:
                    # Timeout verhindert ewiges Blockieren bei Executor-Shutdown
                    await asyncio.wait_for(
                        PAI_ORCHESTRATOR.session_end_sync(get_memory_file()),
                        timeout=10.0,
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        "Session-End PAI sync Timeout (10s) — Executor vermutlich bereits heruntergefahren"
                    )
                except RuntimeError as e:
                    # 'Executor shutdown' ist erwartbar bei Session-Ende — kein Alarm nötig
                    if "shutdown" in str(e).lower() or "cannot schedule" in str(e).lower():
                        logger.warning("Session-End PAI sync übersprungen (Executor beendet): %s", e)
                    else:
                        logger.error("Session-End PAI orchestrator sync failed: %s", e)
                except Exception as e:
                    logger.error("Session-End PAI orchestrator sync failed: %s", e)

            asyncio.create_task(session_end_sync())

        gate_auto_response = getattr(agent, "_gate_auto_response", True)
        _emit_debug_log(
            "H10",
            "backend/agent.py:gate",
            "vad-gate-config",
            {
                "va_mode": int(load_config().get("voiceAssistant", 0)),
                "gate_auto_response": gate_auto_response,
                "create_response": gate_auto_response,
            },
        )

        async def cut_agent_audio_once(transcript: str, reason: str) -> None:
            """Einmaliger sauberer Audio-Cut — kein Doppel-Interrupt."""
            nonlocal active_reply_task
            if active_reply_task and not active_reply_task.done():
                active_reply_task.cancel()
                try:
                    await active_reply_task
                except asyncio.CancelledError:
                    pass
                except Exception as cancel_err:
                    logger.debug("Reply-Task cancel: %s", cancel_err)
                active_reply_task = None
            try:
                session.clear_user_turn()
            except Exception:
                pass
            try:
                await session.interrupt(force=True)
                _emit_debug_log(
                    "H4",
                    "backend/agent.py:cut",
                    "interrupt-once-success",
                    {"transcript": transcript, "reason": reason},
                )
            except RuntimeError:
                logger.warning("[%s] Session nicht aktiv – interrupt übersprungen.", reason)
            except Exception as ie:
                logger.warning("[%s] interrupt fehlgeschlagen: %s", reason, ie)

        @session.on("user_input_transcribed")
        def on_user_transcribed(ev: UserInputTranscribedEvent) -> None:
            nonlocal active_reply_task, last_activity_time
            transcript = (ev.transcript or "").strip()
            if not transcript:
                return
            last_activity_time = time.time()

            if is_stop_command(transcript):
                logger.info(
                    "[StopCommand] Unterbrechung erkannt (%s): '%s'",
                    "final" if ev.is_final else "interim",
                    transcript,
                )

                async def handle_stop() -> None:
                    await cut_agent_audio_once(transcript, "StopCommand")
                    await publish_room_data(
                        {
                            "type": "log_event",
                            "log": {
                                "type": "system",
                                "message": "Sprachausgabe sofort gestoppt.",
                            },
                        }
                    )

                asyncio.create_task(handle_stop())
                return

            if not ev.is_final:
                return

            _emit_debug_log(
                "H5",
                "backend/agent.py:transcript",
                "final-transcript-received",
                {"transcript": transcript, "is_final": ev.is_final},
            )

            config = load_config()
            va_mode = int(config.get("voiceAssistant", 0))

            # Schweige-Befehl: nur Audio stoppen, keine neue Antwort erzeugen
            if is_silence_command(transcript, va_mode):
                logger.info("[SilenceCommand] Schweige-Befehl: '%s'", transcript)
                _emit_debug_log(
                    "H8",
                    "backend/agent.py:silence",
                    "silence-command-detected",
                    {"transcript": transcript, "va_mode": va_mode},
                )

                async def handle_silence() -> None:
                    await cut_agent_audio_once(transcript, "SilenceCommand")
                    await publish_room_data(
                        {
                            "type": "agent_silence",
                            "message": "Elite ist stumm.",
                        }
                    )
                    await publish_room_data(
                        {
                            "type": "log_event",
                            "log": {
                                "type": "system",
                                "message": "Elite bleibt stumm (Sprachausgabe beendet).",
                            },
                        }
                    )

                asyncio.create_task(handle_silence())
                return

            accepted = transcript_accepted(transcript, va_mode)
            _emit_debug_log(
                "H5",
                "backend/agent.py:filter",
                "wakeword-filter-evaluated",
                {"transcript": transcript, "va_mode": va_mode, "accepted": accepted},
            )

            if not accepted:
                safe_transcript = transcript.encode("ascii", errors="replace").decode("ascii")
                logger.info(
                    "[WakeWordFilter] Eingabe ignoriert (mode=%s): '%s'",
                    va_mode,
                    safe_transcript,
                )
                try:
                    session.clear_user_turn()
                except Exception:
                    pass
                # Kein interrupt() bei ignorierten Transkripten — verhindert Audio-Artefakte

                async def notify_ignored() -> None:
                    wake_hint = (
                        "Sage zuerst „Elite“ oder „Jarvis“, dann deinen Befehl."
                        if va_mode in (0, 3)
                        else "Sage „Elite“ + Befehl oder einen klaren Imperativ (z. B. „Öffne …“)."
                    )
                    await publish_room_data(
                        {
                            "type": "voice_rejected",
                            "transcript": transcript,
                            "message": wake_hint,
                        }
                    )
                    await publish_room_data(
                        {
                            "type": "log_event",
                            "log": {
                                "type": "system",
                                "message": (
                                    f"Sprache gehört, aber gefiltert: „{transcript}“ — {wake_hint}"
                                ),
                            },
                        }
                    )

                asyncio.create_task(notify_ignored())
                return

            if not gate_auto_response:

                # Timeout für generate_reply (verhindert endloses Hängen bei API-Problemen)
                _GATED_REPLY_TIMEOUT = 45  # Sekunden

                async def gated_reply() -> None:
                    try:
                        corrected_transcript = normalize_command_for_agent(transcript)
                        if corrected_transcript != transcript:
                            logger.info(
                                "[CommandCorrection] '%s' -> '%s'",
                                transcript,
                                corrected_transcript,
                            )
                            await publish_room_data(
                                {
                                    "type": "log_event",
                                    "log": {
                                        "type": "system",
                                        "message": f"STT-Korrektur: '{transcript}' -> '{corrected_transcript}'",
                                    },
                                }
                            )
                        _emit_debug_log(
                            "H10",
                            "backend/agent.py:reply",
                            "gated-reply-started",
                            {
                                "transcript": transcript,
                                "corrected_transcript": corrected_transcript,
                                "va_mode": va_mode,
                            },
                        )
                        cad_prompt = extract_cad_prompt(corrected_transcript)
                        music_intent = extract_music_intent(corrected_transcript)
                        if llm_mode == "local" and music_intent:
                            logger.info(
                                "[Musik-Intent] Direkt-Ausführung: %s",
                                music_intent,
                            )
                            _, short_reply = await dispatch_music_intent(
                                ctx.room, music_intent
                            )
                            await session.say(short_reply, allow_interruptions=True)
                            return
                        if llm_mode == "local" and cad_prompt:
                            logger.info("[CAD-Intent] Direkt-Ausführung: %s", cad_prompt)
                            await dispatch_cad_to_hud(ctx.room, cad_prompt)
                            await session.say(
                                "CAD-Modell wird erzeugt und im Widget angezeigt.",
                                allow_interruptions=True,
                            )
                            return
                        await asyncio.wait_for(
                            session.generate_reply(user_input=corrected_transcript),
                            timeout=_GATED_REPLY_TIMEOUT,
                        )
                    except asyncio.TimeoutError:
                        logger.error(
                            "[WakeWordGate] generate_reply Timeout nach %ss – LLM antwortet nicht",
                            _GATED_REPLY_TIMEOUT,
                        )
                        _emit_debug_log(
                            "H10",
                            "backend/agent.py:reply",
                            "gated-reply-timeout",
                            {
                                "transcript": transcript,
                                "timeout_s": _GATED_REPLY_TIMEOUT,
                                "llm_mode": llm_mode,
                            },
                        )
                        try:
                            await session.say(
                                "Entschuldigung, das Sprachmodell antwortet momentan nicht. "
                                "Bitte prüfe die API-Verbindung oder starte mich neu.",
                                allow_interruptions=True,
                            )
                        except Exception:
                            pass
                    except asyncio.CancelledError:
                        logger.info("[WakeWordGate] Antwort abgebrochen (Stopp)")
                        raise
                    except Exception as ge:
                        logger.error("[WakeWordGate] generate_reply fehlgeschlagen: %s", ge)
                        await publish_room_data(
                            {
                                "type": "log_event",
                                "log": {
                                    "type": "error",
                                    "message": (
                                        f"KI-Antwort fehlgeschlagen: {ge}. "
                                        "API-Key gültig? Ollama erreichbar?"
                                    ),
                                },
                            }
                        )
                        _emit_debug_log(
                            "H10",
                            "backend/agent.py:reply",
                            "gated-reply-failed",
                            {"transcript": transcript, "error": str(ge)},
                        )

                active_reply_task = asyncio.create_task(gated_reply())

        # Raum an die Tools übergeben (für FnContext-basierte Tools)
        if hasattr(agent, "_fnc_ctx") and agent._fnc_ctx:
            agent._fnc_ctx.extra_data["room"] = ctx.room
        elif hasattr(agent, "fnc_ctx") and agent.fnc_ctx:
            agent.fnc_ctx.extra_data["room"] = ctx.room

        await session.start(
            agent,
            room=ctx.room,
            room_options=room_io.RoomOptions(
                close_on_disconnect=False,
                audio_input=True,
                text_input=True,
            ),
        )
        
        logger.info("Elite Support-Session aktiv.")

        greeted_participant_ids: set[str] = set()
        greeting_lock = asyncio.Lock()

        async def deliver_startup_greeting(for_participant_id: str | None = None) -> None:
            async with greeting_lock:
                cfg = load_config()
                if not cfg.get("startupVoiceGreeting", True):
                    return

                greeting_text = await build_startup_greeting(
                    user_name,
                    elite_ready=True,
                    effective_llm_mode=llm_mode,
                )
                max_attempts = 8
                participant_id = for_participant_id

                for attempt in range(max_attempts):
                    if not participant_id and ctx.room.remote_participants:
                        participant_id = next(iter(ctx.room.remote_participants.keys()))
                    if not participant_id:
                        logger.debug(
                            "Startup-Greeting: warte auf HUD-Teilnehmer (Versuch %s/%s)",
                            attempt + 1,
                            max_attempts,
                        )
                        await asyncio.sleep(0.75 + attempt * 0.85)
                        continue
                    if participant_id in greeted_participant_ids:
                        return
                    if not ctx.room.isconnected():
                        await asyncio.sleep(0.5)
                        continue
                    if participant_id not in ctx.room.remote_participants:
                        logger.debug(
                            "Startup-Greeting: warte auf HUD-Teilnehmer %s (Versuch %s/%s)",
                            participant_id,
                            attempt + 1,
                            max_attempts,
                        )
                        await asyncio.sleep(0.75 + attempt * 0.85)
                        continue
                    await asyncio.sleep(0.35)
                    try:
                        await speak_startup_greeting(session, greeting_text, llm_mode)
                        greeted_participant_ids.add(participant_id)
                        greet_log = json.dumps({
                            "type": "log_event",
                            "log": {
                                "type": "system",
                                "message": f"[Begrüßung] {greeting_text}",
                            },
                        })
                        await ctx.room.local_participant.publish_data(greet_log.encode("utf-8"))
                        played = json.dumps({
                            "type": "startup_greeting_played",
                            "text": greeting_text,
                            "participant_id": participant_id,
                        })
                        await ctx.room.local_participant.publish_data(played.encode("utf-8"))
                        logger.info(
                            "Startup-Begrüßung gesprochen für %s (Versuch %s).",
                            participant_id,
                            attempt + 1,
                        )
                        return
                    except Exception as greet_err:
                        logger.warning(
                            "Startup-Begrüßung Versuch %s fehlgeschlagen: %s",
                            attempt + 1,
                            greet_err,
                        )

                if (
                    participant_id not in greeted_participant_ids
                    and ctx.room.isconnected()
                    and ctx.room.local_participant
                ):
                    fail_log = json.dumps({
                        "type": "log_event",
                        "log": {
                            "type": "error",
                            "message": f"Startup-Begrüßung fehlgeschlagen für {participant_id}",
                        },
                    })
                    await ctx.room.local_participant.publish_data(fail_log.encode("utf-8"))
                    logger.warning(
                        "Startup-Begrüßung fehlgeschlagen für %s.",
                        participant_id,
                    )
        
        # Heartbeat Datei schreiben (umgeleitet)
        heartbeat_path = get_writable_path("backend/agent_heartbeat.txt")
        with open(heartbeat_path, "w") as f:
            f.write(f"FULL AGENT STARTED at {time.ctime()} for room {ctx.room.name}\n")

        await MissionControl.post_activity("elite-agent", "CONNECTED", f"Session gestartet für {user_name}")
        
        # Initiale Begrüßung im Log
        mode_label = "Offline (Ollama)" if llm_mode == "local" else "Cloud (OpenAI)"
        init_log = json.dumps({
            "type": "log_event",
            "log": {
                "type": "system",
                "message": f"Elite-Sitzung für {user_name} gestartet · KI: {mode_label}",
            },
        })
        await ctx.room.local_participant.publish_data(init_log.encode('utf-8'))

        asyncio.create_task(deliver_startup_greeting())

        # 📊 Hintergrund-Task: System-Stats an Dashboard streamen
        async def system_monitor_task():
            while ctx.room.isconnected():
                try:
                    # psutil-Abfragen können blockieren, daher im Thread ausführen
                    cpu = await asyncio.to_thread(psutil.cpu_percent, interval=0.5)
                    ram_info = await asyncio.to_thread(psutil.virtual_memory)
                    ram = ram_info.percent
                    
                    def get_system_metrics():
                        disk_p = psutil.disk_usage('C:\\').percent if os.path.exists('C:\\') else 0
                        proc_c = len(psutil.pids())
                        return disk_p, proc_c
                    disk, proc_count = await asyncio.to_thread(get_system_metrics)

                    # Sende Daten an alle Teilnehmer im Raum
                    if ctx.room.isconnected() and ctx.room.local_participant:
                        stats_payload = json.dumps({
                            "type": "system_stats",
                            "cpu": cpu,
                            "ram": ram,
                            "disk": disk,
                            "process_count": proc_count,
                            "timestamp": datetime.now().isoformat()
                        })
                        try:
                            await ctx.room.local_participant.publish_data(stats_payload.encode('utf-8'))
                        except: pass
                    
                    # Auch an Mission Control melden (weniger frequent)
                    if int(time.time()) % 60 < 5: # Alle Minute
                        await MissionControl.post_activity(
                            "elite-agent", 
                            "STATS", 
                            f"CPU: {cpu}% | RAM: {ram}% | Disk: {disk}%"
                        )
                except Exception as e:
                    logger.error(f"System Monitor Error: {e}")
                await asyncio.sleep(5) # Alle 5 Sekunden

        async def meeting_guard_loop():
            # Lokaler State, um doppelte Aktionen zu vermeiden
            in_meeting = False
            while ctx.room.isconnected():
                try:
                    # Wir rufen das Tool direkt intern auf
                    from tools import check_active_meetings
                    result = await check_active_meetings(ctx)
                    
                    is_now_active = result.get("is_active", False)
                    
                    if is_now_active and not in_meeting:
                        in_meeting = True
                        logger.info("Meeting Guard: Call erkannt! Aktiviere Schutzmaßnahmen...")
                        
                        status_payload = json.dumps({
                            "type": "meeting_status",
                            "active": True,
                            "type_label": result.get("meeting_type", "Call")
                        })
                        await ctx.room.local_participant.publish_data(status_payload.encode('utf-8'))
                        
                        from tools import manage_dashboard_widgets, media_control
                        await media_control(ctx, "pause")
                        await manage_dashboard_widgets(ctx, "open", "notes")
                        
                        log_payload = json.dumps({
                            "type": "log_event",
                            "log": {
                                "type": "system",
                                "message": f"MEETING GUARD: {result.get('meeting_type')} erkannt. Musik pausiert. Notiz-Widget geöffnet. Elite auf Standby."
                            }
                        })
                        await ctx.room.local_participant.publish_data(log_payload.encode('utf-8'))

                    elif not is_now_active and in_meeting:
                        in_meeting = False
                        logger.info("Meeting Guard: Call beendet.")
                        status_payload = json.dumps({
                            "type": "meeting_status",
                            "active": False
                        })
                        await ctx.room.local_participant.publish_data(status_payload.encode('utf-8'))

                except Exception as e:
                    logger.error(f"Meeting Guard Error: {e}")
                
                await asyncio.sleep(20) # Alle 20 Sekunden prfen

        async def weather_streamer():
            """Streamt regelmäßig Wetterdaten an das Dashboard."""
            while ctx.room.isconnected():
                try:
                    async with aiohttp.ClientSession() as session_http:
                        async with session_http.get("https://wttr.in/Biel,Switzerland?format=%t|%C|%l", timeout=10) as resp:
                            if resp.status == 200:
                                text = await resp.text()
                                parts = text.split('|')
                                if len(parts) >= 2:
                                    weather_payload = json.dumps({
                                        "type": "weather_update",
                                        "temp": parts[0].strip(),
                                        "condition": parts[1].strip(),
                                        "location": parts[2].strip().split(',')[0] if len(parts) > 2 else "Biel"
                                    })
                                    if ctx.room.isconnected() and ctx.room.local_participant:
                                        await ctx.room.local_participant.publish_data(weather_payload.encode('utf-8'))
                except Exception as e:
                    logger.error(f"Weather Streamer Error: {e}")
                await asyncio.sleep(600) # Alle 10 Minuten aktualisieren

        async def clipboard_monitor_task():
            """Überwacht die Zwischenablage auf interessante Inhalte (URLs, Code, etc.)."""
            try:
                clip_start = await asyncio.to_thread(pyperclip.paste)
                last_clip = clip_start.strip() if clip_start else ""
            except Exception:
                last_clip = ""
            logger.info("Smart Clipboard Monitor gestartet.")
            
            # Initiale Meldung im Log
            init_clip = json.dumps({"type": "log_event", "log": {"type": "system", "message": "Smart Clipboard Überwachung aktiv"}})
            await ctx.room.local_participant.publish_data(init_clip.encode('utf-8'))
            
            while ctx.room.isconnected():
                try:
                    # Pyperclip.paste() ist blockierend, daher im Thread ausführen
                    clip_raw = await asyncio.to_thread(pyperclip.paste)
                    clip = clip_raw.strip() if clip_raw else ""
                    
                    if clip and clip != last_clip:
                        last_clip = clip
                        logger.info(f"Clipboard Change erkannt (pyperclip): {clip[:50]}...")
                        
                        # 1. Immer an den Text-Editor senden
                        payload_update = json.dumps({
                            "type": "clipboard_update",
                            "content": clip
                        })
                        if ctx.room.isconnected() and ctx.room.local_participant:
                            try:
                                await ctx.room.local_participant.publish_data(payload_update.encode('utf-8'))
                            except: pass

                        # 2. Spezielle Analyse (Suggestions)
                        suggestion = None
                        if clip.startswith("http"):
                            suggestion = "URL erkannt: Möchtest du eine Zusammenfassung dieser Seite?"
                        elif any(kw in clip for kw in ["error", "exception", "Error", "Exception", "traceback"]):
                            suggestion = "Fehlermeldung erkannt: Soll ich das selbstheilende System aktivieren? Nutze 'trigger_self_healing_workflow'."
                        elif len(clip) > 500:
                            suggestion = "Langer Text erkannt: Soll ich ihn für dich zusammenfassen?"
                        
                        if suggestion:
                            payload_sugg = json.dumps({
                                "type": "log_event",
                                "log": {
                                    "type": "suggestion",
                                    "message": f"SMART CLIPBOARD: {suggestion}",
                                    "data": {"clipboard": clip}
                                }
                            })
                            await ctx.room.local_participant.publish_data(payload_sugg.encode('utf-8'))
                except Exception as e:
                    logger.error(f"Clipboard Monitor Error: {e}")
                await asyncio.sleep(2) # Öfter prüfen für bessere Response

        async def hermes_hud_stream_task():
            """Tail Hermes gateway log + PAI work.json → HUD log stream."""
            log_path = get_hermes_gateway_log_path()
            pai_work = os.path.join(
                os.path.expanduser("~"), ".claude", "PAI", "MEMORY", "STATE", "work.json"
            )
            last_size = 0
            last_phase = ""

            async def publish_log(message: str, log_type: str = "system"):
                if not (ctx.room and ctx.room.isconnected() and ctx.room.local_participant):
                    return
                payload = json.dumps({
                    "type": "log_event",
                    "log": {"type": log_type, "message": message},
                })
                await ctx.room.local_participant.publish_data(payload.encode("utf-8"))

            while ctx.room.isconnected():
                try:
                    if log_path.is_file():
                        size = log_path.stat().st_size
                        if size > last_size:
                            with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                                f.seek(last_size)
                                chunk = f.read(size - last_size)
                            last_size = size
                            for line in chunk.splitlines():
                                line = line.strip()
                                if line:
                                    await publish_log(f"[Hermes] {line[:240]}", "system")
                    if os.path.isfile(pai_work):
                        with open(pai_work, "r", encoding="utf-8") as f:
                            work = json.load(f)
                        phase = str(work.get("phase", ""))
                        if phase and phase != last_phase:
                            last_phase = phase
                            await publish_log(f"[PAI] Phase → {phase}", "thinking")
                except Exception as stream_err:
                    logger.debug(f"Hermes HUD stream: {stream_err}")
                await asyncio.sleep(3)

        async def inactivity_monitor():
            nonlocal last_activity_time
            inactivity_timeout = 300  # 5 Minuten Standby
            logger.info("Inaktivitäts-Monitor aktiv. Timeout: %ds", inactivity_timeout)
            while ctx.room.isconnected():
                await asyncio.sleep(10)
                elapsed = time.time() - last_activity_time
                if elapsed > inactivity_timeout:
                    logger.info("Inaktivitäts-Timeout erreicht (%ds idle). Schließe Realtime-Session.", int(elapsed))
                    try:
                        await session.say(
                            "Elite geht in den Standby-Modus, um Ressourcen zu sparen. Klicke im Dashboard auf 'Elite aktivieren', wenn du mich wieder brauchst.",
                            allow_interruptions=False,
                        )
                        await asyncio.sleep(8)
                    except Exception as err:
                        logger.warning("Fehler beim Standby-Spruch: %s", err)
                    try:
                        await ctx.room.disconnect()
                    except Exception as err:
                        logger.warning("Inaktivitäts-Disconnect fehlgeschlagen: %s", err)
                    break

        # Starte die Tasks im Hintergrund
        asyncio.create_task(system_monitor_task())
        asyncio.create_task(meeting_guard_loop())
        asyncio.create_task(weather_streamer())
        asyncio.create_task(clipboard_monitor_task())
        asyncio.create_task(hermes_hud_stream_task())
        asyncio.create_task(inactivity_monitor())

        @ctx.room.on("data_received")
        def on_data_received(data_packet: rtc.DataPacket):
            nonlocal last_activity_time
            try:
                payload = data_packet.data.decode("utf-8")
                data = json.loads(payload)
                
                if data.get("type") == "hermes_speak":
                    text = data.get("text", "")
                    if text:
                        clean_text = clean_text_for_speech(text)
                        if clean_text:
                            async def speak_text():
                                try:
                                    await session.say(clean_text, allow_interruptions=True)
                                except Exception as err:
                                    logger.error("Hermes speak say failed: %s", err)
                            asyncio.create_task(speak_text())
                    return

                if data.get("type") in ("request_startup_greeting", "startup_greeting_ready"):
                    sender = data.get("participant_id")
                    if not sender and data_packet.participant:
                        sender = data_packet.participant.identity
                    asyncio.create_task(deliver_startup_greeting(sender))
                    return

                # 1. Vision Updates verarbeiten (Text oder direktes Bild)
                if data.get("type") == "vision_analysis":
                    msg = data.get("message", "")
                    logger.info(f"Vision Update (Text): {msg}")
                    log_vision = json.dumps({"type": "log_event", "log": {"type": "vision", "message": f"Vision-Update: {msg}"}})
                    asyncio.create_task(ctx.room.local_participant.publish_data(log_vision.encode('utf-8')))
                
                elif data.get("type") == "vision_frame":
                    last_activity_time = time.time()
                    logger.info("Echte Webcam-Analyse (Frame) gestartet...")
                    frame = data.get("frame")
                    if frame and hasattr(session, "assistant"):
                        async def do_analysis():
                            log_start = json.dumps({"type": "log_event", "log": {"type": "thinking", "message": "Analysiere Webcam-Frame..."}})
                            await ctx.room.local_participant.publish_data(log_start.encode('utf-8'))
                            description, gallery_entry = await analyze_frame_with_vision(frame)
                            log_result = json.dumps({"type": "log_event", "log": {"type": "result", "message": f"Vision: {description}"}})
                            await ctx.room.local_participant.publish_data(log_result.encode('utf-8'))
                            if gallery_entry:
                                img_payload = json.dumps({
                                    "type": "captured_image",
                                    "image": {
                                        "src": gallery_entry["src"],
                                        "labels": gallery_entry.get("labels", []),
                                        "confidence": gallery_entry.get("confidence", 0.95),
                                        "analysis": gallery_entry.get("analysis", {}),
                                    },
                                })
                                await ctx.room.local_participant.publish_data(img_payload.encode('utf-8'))
                                open_payload = json.dumps({
                                    "type": "widget_control",
                                    "action": "open",
                                    "widgetId": "imageGrid",
                                })
                                await ctx.room.local_participant.publish_data(open_payload.encode('utf-8'))
                        asyncio.create_task(do_analysis())
                
                # 2. Chat/Dashboard Befehle (kein Wake-Word nötig)
                elif data.get("message") or data.get("text"):
                    text = str(data.get("message") or data.get("text") or "").strip()
                    if not text:
                        return
                    last_activity_time = time.time()
                    logger.info("Dashboard Befehl: %s", text)

                    async def handle_dashboard_command() -> None:
                        try:
                            cad_prompt = extract_cad_prompt(text)
                            music_intent = extract_music_intent(text)
                            if llm_mode == "local" and music_intent:
                                _, short_reply = await dispatch_music_intent(
                                    ctx.room, music_intent
                                )
                                await session.say(short_reply, allow_interruptions=True)
                                return
                            if llm_mode == "local" and cad_prompt:
                                await dispatch_cad_to_hud(ctx.room, cad_prompt)
                                await session.say(
                                    "CAD-Modell wird erzeugt.",
                                    allow_interruptions=True,
                                )
                                return
                            await session.generate_reply(user_input=text)
                        except Exception as chat_err:
                            logger.error(
                                "Dashboard generate_reply fehlgeschlagen: %s", chat_err
                            )
                            err_payload = json.dumps(
                                {
                                    "type": "log_event",
                                    "log": {
                                        "type": "error",
                                        "message": f"Chat-Befehl fehlgeschlagen: {chat_err}",
                                    },
                                }
                            )
                            if ctx.room.isconnected() and ctx.room.local_participant:
                                await ctx.room.local_participant.publish_data(
                                    err_payload.encode("utf-8")
                                )

                    asyncio.create_task(handle_dashboard_command())

                elif data.get("type") == "tool_confirmation_response":
                    from tool_permissions import resolve_tool_confirmation
                    resolve_tool_confirmation(
                        str(data.get("id", "")),
                        bool(data.get("approved", False)),
                    )

                elif data.get("type") == "face_auth_result":
                    from face_auth_service import set_auth_state
                    set_auth_state(bool(data.get("authenticated", False)), float(data.get("score", 0)))

            except Exception as e:
                logger.error(f"Fehler bei data_received: {e}")

        # Am Leben bleiben, bis der Job beendet wird
        while True:
            await asyncio.sleep(1)

    except asyncio.CancelledError:
        logger.info("Job abgebrochen, trenne Verbindung...")
    except Exception as e:
        logger.error(f"Kritischer Fehler im Entrypoint: {e}", exc_info=True)
        # Optional: Mission Control informieren
        await MissionControl.post_activity("Elite Backend", "Crash", f"Agent Error: {str(e)}")


if __name__ == "__main__":
    bootstrap_elite_runtime()
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, port=7861))
