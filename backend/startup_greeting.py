"""Kurze Startup-Begrüßung für Elite (HUD + Sprachausgabe)."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    pass


def _day_period(hour: int) -> str:
    if 5 <= hour < 11:
        return "morning"
    if 11 <= hour < 17:
        return "day"
    if 17 <= hour < 22:
        return "evening"
    return "night"


def build_startup_greeting(
    user_name: str = "Chef",
    *,
    elite_ready: bool = True,
    effective_llm_mode: str | None = None,
    now: datetime | None = None,
) -> str:
    """Ein Satz für session.say() — kurz, autoritär, einmal pro App-Start."""
    dt = now or datetime.now()
    period = _day_period(dt.hour)
    name = "Chef" if not user_name or user_name == "System Admin" else user_name

    time_greeting = {
        "morning": f"Guten Morgen, {name}.",
        "day": f"Guten Tag, {name}.",
        "evening": f"Guten Abend, {name}.",
        "night": f"Gute Nacht, {name}. Elite bleibt wach.",
    }[period]

    if not elite_ready:
        return f"{time_greeting} Backend startet noch — Text-Chat steht bereit."

    mode_hint = ""
    if effective_llm_mode == "local":
        mode_hint = " Offline-KI aktiv."
    elif effective_llm_mode == "cloud":
        mode_hint = " Cloud-KI bereit."

    tail = {
        "morning": "Systeme online. Was steht an?",
        "day": "Elite ist bereit.",
        "evening": "Elite steht bereit.",
        "night": "Sprache oder Chat — ich höre zu.",
    }[period]

    return f"{time_greeting}{mode_hint} {tail}".strip()


async def _wait_for_playout(handle: Any, *, timeout: float = 45.0) -> None:
    if handle is None or not hasattr(handle, "wait_for_playout"):
        return
    try:
        await asyncio.wait_for(handle.wait_for_playout(), timeout=timeout)
    except asyncio.TimeoutError:
        pass


async def speak_startup_greeting(session: Any, text: str, llm_mode: str) -> None:
    """Cloud: Realtime generate_reply (say() hat kein TTS). Local: Piper/pyttsx3 say()."""
    if llm_mode == "local":
        handle = await session.say(text, allow_interruptions=True)
        await _wait_for_playout(handle)
        return

    handle = await session.generate_reply(
        instructions=(
            "STARTUP-BEGRÜSSUNG beim App-Start (einzige Ausnahme von der Stille-Regel). "
            f"Sage exakt diesen einen Satz auf Deutsch — kein Smalltalk, nichts weiter:\n\"{text}\""
        ),
        allow_interruptions=True,
    )
    await _wait_for_playout(handle)
