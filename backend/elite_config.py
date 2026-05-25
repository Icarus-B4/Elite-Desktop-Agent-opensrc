"""Gemeinsame Elite-Konfiguration (AppData + Defaults)."""

from __future__ import annotations

import json
import logging
import os
import shutil
import urllib.error
import urllib.request
from datetime import datetime, timezone

from paths import get_writable_path

logger = logging.getLogger("elite-config")

DEFAULT_CONFIG = {
    "soulMatrix": 0,
    "voiceAssistant": 1,
    "hudAesthetics": 0,
    "systemAccess": 1,
    "livekitMode": "cloud",
    "llmMode": "auto",
    "ollamaModel": "llama3.1",
    "ollamaBaseUrl": "http://127.0.0.1:11434/v1",
    "whisperModel": "medium",
    "offlineTtsEngine": "piper",
    "piperVoice": "de_DE-thorsten-high",
    "startupVoiceGreeting": True,
}


def resolve_runtime_state_path() -> str:
    return get_writable_path("backend/agent_runtime.json")


def write_agent_runtime_state(
    *,
    configured_llm_mode: str,
    effective_llm_mode: str,
    fallback_reason: str | None = None,
) -> None:
    """Schreibt effektiven KI-Modus für HUD/API (z. B. Quota-Fallback)."""
    path = resolve_runtime_state_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = {
        "configuredLlmMode": configured_llm_mode,
        "effectiveLlmMode": effective_llm_mode,
        "llmFallbackReason": fallback_reason,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except OSError as e:
        logger.warning("agent_runtime.json konnte nicht geschrieben werden: %s", e)


def resolve_config_path() -> str:
    bundled = os.path.join(os.path.dirname(__file__), "config.json")
    appdata = get_writable_path("backend/config.json")
    if os.path.exists(appdata):
        return appdata
    if os.path.exists(bundled):
        try:
            shutil.copy2(bundled, appdata)
            return appdata
        except OSError:
            return bundled
    return appdata if os.path.exists(appdata) else bundled


def load_config() -> dict:
    config = dict(DEFAULT_CONFIG)
    path = resolve_config_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                config.update(json.load(f))
        except Exception:
            pass
    return config


def resolve_llm_mode(config: dict | None = None) -> str:
    """
    cloud  – OpenAI Realtime (Credits nötig)
    local  – Ollama + Whisper + Piper-TTS (offline-fähig)
    auto   – Cloud wenn OPENAI_API_KEY, sonst local
    """
    cfg = config or load_config()
    mode = str(cfg.get("llmMode", "auto")).lower()
    if mode == "auto":
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if key and not os.environ.get("ELITE_FORCE_LOCAL", "").strip():
            return "cloud"
        return "local"
    if mode in ("cloud", "local"):
        return mode
    return "cloud"


def is_local_llm_active(config: dict | None = None) -> bool:
    return resolve_llm_mode(config) == "local"


def probe_openai_api() -> tuple[bool, str]:
    """
    Kurzer Sync-Check gegen die Chat-Completions-API.
    Returns (True, "ok") oder (False, reason).
    """
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        return False, "no_key"

    body_bytes = json.dumps(
        {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body_bytes,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if 200 <= resp.status < 300:
                return True, "ok"
            err_body = resp.read().decode("utf-8", errors="replace")
            if "insufficient_quota" in err_body:
                return False, "insufficient_quota"
            return False, f"http_{resp.status}"
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        if "insufficient_quota" in err_body or (
            e.code == 429 and "quota" in err_body.lower()
        ):
            return False, "insufficient_quota"
        return False, f"http_{e.code}"
    except Exception as e:
        return False, f"error:{e}"


def resolve_effective_llm_mode(config: dict | None = None) -> tuple[str, str | None]:
    """
    Wie resolve_llm_mode, aber bei Cloud vorab OpenAI prüfen.
    Bei Quota/Key/Probe-Fehler Fallback auf local mit Grund für Logging/UI.
    """
    cfg = config or load_config()
    mode = resolve_llm_mode(cfg)
    if mode != "cloud":
        return mode, None

    ok, reason = probe_openai_api()
    if ok:
        return "cloud", None

    logger.warning(
        "OpenAI-Probe fehlgeschlagen (%s) – Fallback auf Offline-KI (Ollama)",
        reason,
    )
    return "local", reason


def _ollama_tags(base_url: str) -> list[str]:
    root = str(base_url or "http://127.0.0.1:11434/v1").rstrip("/").replace("/v1", "")
    try:
        with urllib.request.urlopen(f"{root}/api/tags", timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        names: list[str] = []
        for item in data.get("models") or []:
            name = str(item.get("name") or "").strip()
            if name:
                names.append(name)
        return names
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
        logger.warning("Ollama /api/tags nicht erreichbar (%s): %s", root, e)
        return []


def _normalize_ollama_name(name: str) -> str:
    return name.split(":")[0] if ":" in name else name


def resolve_ollama_model(config: dict | None = None) -> tuple[str, str]:
    """
    Wählt ein installiertes Ollama-Modell.
    Bevorzugt config.ollamaModel; sonst erstes verfügbares Modell.
    """
    cfg = config or load_config()
    base_url = str(cfg.get("ollamaBaseUrl") or "http://127.0.0.1:11434/v1").strip()
    preferred = str(cfg.get("ollamaModel") or "llama3.1").strip()
    available = _ollama_tags(base_url)

    if not available:
        return preferred, base_url

    preferred_names = {preferred, f"{preferred}:latest"}
    for tag in available:
        if tag in preferred_names or _normalize_ollama_name(tag) == preferred:
            logger.info("Ollama-Modell: %s (konfiguriert: %s)", tag, preferred)
            return tag, base_url

    fallback = available[0]
    logger.warning(
        "Ollama-Modell '%s' nicht installiert. Fallback: %s (verfügbar: %s)",
        preferred,
        fallback,
        ", ".join(available[:5]),
    )
    return fallback, base_url


def cloud_api_key_present() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY", "").strip())
