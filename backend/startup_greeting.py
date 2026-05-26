"""Kurze Startup-Begrüßung für Elite (HUD + Sprachausgabe)."""

from __future__ import annotations

import asyncio
import urllib.request
import xml.etree.ElementTree as ET
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


def _fetch_weather_sync() -> str | None:
    """Holt das aktuelle Wetter für Biel, Schweiz von wttr.in (synchron)."""
    url = "https://wttr.in/Biel,Switzerland?format=%t|%C&lang=de"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "curl/7.81.0"}  # curl User-Agent erzwingt Plain Text
        )
        with urllib.request.urlopen(req, timeout=2.0) as response:
            if response.status == 200:
                raw = response.read().decode("utf-8").strip()
                parts = raw.split("|")
                if len(parts) == 2:
                    temp = parts[0].strip().lstrip("+").replace("°C", " Grad")
                    condition = parts[1].strip()
                    if condition:
                        # Erste Buchstaben klein machen für flüssigen Satzbau (z.B. "leicht bewölkt")
                        condition = condition[0].lower() + condition[1:]
                    return f"aktuell {temp} und {condition}"
    except Exception:
        pass
    return None


async def fetch_weather() -> str | None:
    """Holt das Wetter asynchron über einen Threadpool, um den Event-Loop nicht zu blockieren."""
    try:
        return await asyncio.to_thread(_fetch_weather_sync)
    except Exception:
        return None


def _fetch_news_sync() -> str | None:
    """Holt die 2 neuesten Schlagzeilen von tagesschau.de (synchron)."""
    url = "https://www.tagesschau.de/xml/rss2"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "curl/7.81.0"}
        )
        with urllib.request.urlopen(req, timeout=2.0) as response:
            if response.status == 200:
                root = ET.fromstring(response.read())
                items = root.findall('.//item')
                titles = []
                for item in items[:2]:
                    title_node = item.find('title')
                    if title_node is not None and title_node.text:
                        t = title_node.text.strip()
                        if t.startswith("Liveblog:"):
                            t = t[9:].strip()
                        titles.append(t)
                if len(titles) == 2:
                    return f"Die Schlagzeilen: {titles[0]}, sowie: {titles[1]}."
                elif len(titles) == 1:
                    return f"Die Schlagzeile: {titles[0]}."
    except Exception:
        pass
    return None


async def fetch_news() -> str | None:
    """Holt die Nachrichten asynchron über einen Threadpool."""
    try:
        return await asyncio.to_thread(_fetch_news_sync)
    except Exception:
        return None


async def build_startup_greeting(
    user_name: str = "Chef",
    *,
    elite_ready: bool = True,
    effective_llm_mode: str | None = None,
    now: datetime | None = None,
    include_weather: bool = True,
    include_news: bool = True,
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

    # Wetter und News parallel abfragen
    tasks = []
    if include_weather:
        tasks.append(fetch_weather())
    else:
        tasks.append(asyncio.sleep(0, result=None))

    if include_news:
        tasks.append(fetch_news())
    else:
        tasks.append(asyncio.sleep(0, result=None))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    weather_desc = None
    news_desc = None

    if include_weather and len(results) > 0 and not isinstance(results[0], Exception):
        weather_desc = results[0]
    if include_news and len(results) > 1 and not isinstance(results[1], Exception):
        news_desc = results[1]

    weather_hint = ""
    if weather_desc:
        weather_hint = f" In Biel ist es {weather_desc}."

    news_hint = ""
    if news_desc:
        news_hint = f" {news_desc}"

    # Abwechslungsreiche Schlusssätze zur Vermeidung von Monotonie (Elite-Aura konform)
    morning_tails = [
        "Systeme online. Was steht an?",
        "Alle Kanäle aktiv. Ich bin bereit.",
        "Systemdiagnose abgeschlossen. Alles im grünen Bereich.",
        "Bereit für den Tag. Ich höre zu.",
    ]
    day_tails = [
        "Elite ist bereit.",
        "Bereit, Chef. Sagen Sie einfach Bescheid.",
        "Alle Systeme laufen stabil.",
        "Ich stehe zu Ihrer Verfügung.",
    ]
    evening_tails = [
        "Elite steht bereit.",
        "Einen angenehmen Abend. Ich höre zu.",
        "Systeme laufen im Abendmodus. Was gibt es zu tun?",
        "Bereit für spätere Aufgaben.",
    ]
    night_tails = [
        "Sprache oder Chat — ich höre zu.",
        "Systeme im Bereitschaftsmodus. Ich wache.",
        "Die Verbindung bleibt aktiv.",
    ]

    tail_choices = {
        "morning": morning_tails,
        "day": day_tails,
        "evening": evening_tails,
        "night": night_tails,
    }[period]

    # Deterministische Auswahl basierend auf dem Kalendertag
    day_index = dt.day
    tail = tail_choices[day_index % len(tail_choices)]

    return f"{time_greeting}{mode_hint}{weather_hint}{news_hint} {tail}".strip()


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
