"""Musik-Sprachbefehle direkt ausführen (Offline-Ollama ohne Tool-Calling)."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Literal

logger = logging.getLogger("elite-music-intent")

MusicAction = Literal["play_random", "play_title", "pause", "next", "prev"]


@dataclass
class MusicIntent:
    action: MusicAction
    title_query: str = ""


def _norm(text: str) -> str:
    t = (text or "").strip().lower()
    t = re.sub(r"[,!.?;:]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def extract_music_intent(transcript: str) -> MusicIntent | None:
    """Erkennt Musik-Wünsche ohne LLM-Tools."""
    t = _norm(transcript)
    if not t:
        return None

    if re.search(r"\b(pausiere|pause|musik\s+aus|music\s+off|stopp\s+musik)\b", t):
        return MusicIntent("pause")
    if re.search(r"\b(nächster|nächstes|next\s+track|skip)\b", t) and re.search(
        r"\b(musik|music|song|lied|track)\b", t
    ):
        return MusicIntent("next")
    if re.search(r"\b(vorheriger|zurück|previous|prev)\b", t) and re.search(
        r"\b(musik|music|song|lied|track)\b", t
    ):
        return MusicIntent("prev")

    has_music = bool(
        re.search(r"\b(musik|music|song|lied|spotify|playlist|hör|höre)\b", t)
    )
    has_play = bool(re.search(r"\b(spiele|play|starte|abspielen)\b", t))

    if re.search(r"\b(musik\s+an|music\s+on|spiele\s+musik|play\s+music)\b", t):
        return MusicIntent("play_random")

    if has_play and has_music:
        m = re.search(
            r"(?:spiele|play|starte)\s+(?:mir\s+|bitte\s+|mal\s+)?(?:das\s+)?(?:lied\s+)?(.+)$",
            t,
        )
        if m:
            tail = m.group(1).strip()
            generic = {
                "musik",
                "music",
                "eine musik",
                "some music",
                "musik ab",
                "lied",
                "song",
            }
            if tail and tail not in generic and len(tail) > 2:
                return MusicIntent("play_title", tail)
        return MusicIntent("play_random")

    if has_music and re.search(r"\b(an|start|wiedergabe)\b", t):
        return MusicIntent("play_random")

    if has_play:
        m = re.search(
            r"(?:spiele|play|starte)\s+(?:mir\s+|bitte\s+|mal\s+)?(?:das\s+)?(?:lied\s+)?(.+)$",
            t,
        )
        if m:
            tail = m.group(1).strip()
            generic = {
                "musik",
                "music",
                "eine musik",
                "some music",
                "musik ab",
                "lied",
                "song",
            }
            if tail and tail not in generic and len(tail) > 2:
                return MusicIntent("play_title", tail)

    return None


def _tool_context(room) -> SimpleNamespace:
    return SimpleNamespace(room=room)


def _reply_from_result(result: str, intent: MusicIntent) -> str:
    r = result or ""
    if "PLAY_SUCCESS:" in r:
        name = r.split("PLAY_SUCCESS:", 1)[-1].strip()
        return f"Alles klar, ich spiele {name}."
    if "FALLBACK_YOUTUBE" in r:
        return "Keine lokale Bibliothek gefunden — ich öffne Musik auf YouTube."
    if intent.action == "pause":
        return "Musik pausiert."
    if intent.action == "next":
        return "Nächster Titel."
    if intent.action == "prev":
        return "Vorheriger Titel."
    if "Keine Musik" in r or "nicht gefunden" in r.lower():
        return "Ich habe keine passende Musikdatei gefunden."
    if "Fehler" in r:
        return f"Musik konnte nicht gestartet werden: {r[:120]}"
    return "Musikbefehl ausgeführt."


async def _play_title(ctx, query: str) -> str:
    from tools import (
        _collect_music_files,
        _get_music_dir,
        _play_song_file,
        _load_cached_music_paths,
        _sync_music_to_dashboard,
        play_random_music,
    )

    music_dir = _get_music_dir()
    found = _collect_music_files(music_dir, query) if music_dir else []
    if not found:
        cached = _load_cached_music_paths()
        q = query.lower()
        found = [s for s in cached if q in s.lower()]
    if found:
        if music_dir:
            await _sync_music_to_dashboard(ctx, found)
        return await _play_song_file(ctx, found[0])
    return await play_random_music(ctx)


async def dispatch_music_intent(room, intent: MusicIntent) -> tuple[str, str]:
    """Führt Musik-Tool aus, öffnet Widget, liefert (tool_result, kurze Antwort)."""
    from tools import media_control, play_random_music

    ctx = _tool_context(room)
    logger.info("Musik-Intent: %s %s", intent.action, intent.title_query or "")

    if intent.action == "play_random":
        result = await play_random_music(ctx)
    elif intent.action == "play_title":
        result = await _play_title(ctx, intent.title_query)
    elif intent.action == "pause":
        result = await media_control(ctx, "playpause")
    elif intent.action == "next":
        result = await media_control(ctx, "next")
    elif intent.action == "prev":
        result = await media_control(ctx, "prev")
    else:
        result = "Unbekannte Musik-Aktion."

    reply = _reply_from_result(result, intent)

    async def publish(payload: dict) -> None:
        if not room or not getattr(room, "local_participant", None):
            return
        try:
            await room.local_participant.publish_data(
                json.dumps(payload, ensure_ascii=False).encode("utf-8")
            )
        except Exception as exc:
            logger.warning("Musik HUD publish failed: %s", exc)

    await publish({"type": "widget_control", "action": "open", "widgetId": "music"})
    if "PLAY_SUCCESS:" in result:
        song = result.split("PLAY_SUCCESS:", 1)[-1].strip()
        await publish({"type": "music_item", "song": song})
    await publish(
        {
            "type": "log_event",
            "log": {"type": "result", "message": reply},
        }
    )
    return result, reply
