"""KI-Objekterkennung mit Bounding Boxes (OpenAI Vision / optional Ollama)."""

from __future__ import annotations

import json
import logging
import os
import re

import aiohttp

logger = logging.getLogger("object-vision")

OBJECT_COLORS = ["#00f2ff", "#33ff99", "#ffff66", "#ff66cc", "#9966ff", "#ff9933", "#66ccff"]

OBJECT_VISION_SYSTEM = (
    "Du bist ein präziser Objekt-Detektor für Webcam-Bilder. "
    "Antworte NUR mit gültigem JSON, ohne Markdown oder Erklärungen."
)

OBJECT_VISION_USER = """Analysiere NUR dieses eine aktuelle Webcam-Bild (Selfie/Spiegelansicht).
Ignoriere frühere Objekte oder Vermutungen – nur was JETZT sichtbar ist.

Gib exakt dieses JSON-Format zurück:
{
  "objects": [
    {
      "label": "Kurzer deutscher Name, z.B. Tastatur, Kugelschreiber, Feuerzeug, Zigarettenpackung, Tasse, Handy",
      "x": 12.5,
      "y": 40.0,
      "w": 25.0,
      "h": 18.0,
      "confidence": 0.92
    }
  ]
}

Regeln:
- x, y = linke obere Ecke in Prozent (0–100) der Bildbreite/-höhe
- w, h = Breite/Höhe in Prozent – möglichst ENG um das Objekt, nicht den ganzen Tisch
- Maximal 8 klar sichtbare Objekte; keine generischen Namen wie "Objekt" oder "Strukturelement"
- Gesichter/Personen als "Person" mit engem Kasten um Kopf/Gesicht
- confidence zwischen 0.5 und 1.0
- Wenn unsicher: weglassen statt raten
- Koordinaten immer auf das GESAMTE Bild (0–100), linke obere Ecke des Bildes = (0,0)"""


def _strip_data_url(frame_b64: str) -> str:
    if "," in frame_b64:
        return frame_b64.split(",", 1)[1]
    return frame_b64


def _parse_objects_json(text: str) -> list[dict]:
    raw = (text or "").strip()
    if "```" in raw:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if match:
            raw = match.group(1).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        raw = raw[start : end + 1]
    data = json.loads(raw)
    items = data.get("objects") or data.get("detections") or []
    if not isinstance(items, list):
        return []
    return items


def _clamp_box(item: dict, index: int) -> dict | None:
    try:
        label = str(item.get("label", "")).strip()
        if not label or len(label) < 2:
            return None
        x = float(item.get("x", 0))
        y = float(item.get("y", 0))
        w = float(item.get("w", 0))
        h = float(item.get("h", 0))
        conf = float(item.get("confidence", 0.85))
    except (TypeError, ValueError):
        return None

    x = max(0.0, min(100.0, x))
    y = max(0.0, min(100.0, y))
    w = max(1.5, min(100.0 - x, w))
    h = max(1.5, min(100.0 - y, h))
    conf = max(0.5, min(1.0, conf))

    generic = {"objekt", "strukturelement", "flaches objekt", "komponente", "element"}
    if label.lower() in generic or "strukturelement" in label.lower():
        return None

    color = OBJECT_COLORS[index % len(OBJECT_COLORS)]
    return {
        "id": f"ai_{index}",
        "label": label,
        "type": "face" if label.lower() in ("person", "gesicht", "person / gesicht") else "object",
        "confidence": round(conf, 2),
        "x": round(x, 2),
        "y": round(y, 2),
        "w": round(w, 2),
        "h": round(h, 2),
        "color": "#ff3366" if label.lower() in ("person", "gesicht") else color,
    }


async def _detect_openai(frame_b64: str) -> list[dict]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return []

    raw = _strip_data_url(frame_b64)
    model = os.environ.get("OBJECT_VISION_MODEL", "gpt-4o-mini")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": OBJECT_VISION_SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": OBJECT_VISION_USER},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{raw}",
                            "detail": os.environ.get("OBJECT_VISION_DETAIL", "high"),
                        },
                    },
                ],
            },
        ],
        "max_tokens": 900,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=aiohttp.ClientTimeout(total=45),
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                logger.error("Object vision API %s: %s", resp.status, body[:300])
                return []
            data = await resp.json()
            content = data["choices"][0]["message"]["content"]

    parsed = _parse_objects_json(content)
    results = []
    for i, item in enumerate(parsed):
        box = _clamp_box(item, i)
        if box:
            results.append(box)
    return results[:8]


async def _detect_ollama(frame_b64: str) -> list[dict]:
    base = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.environ.get("OLLAMA_VISION_MODEL", "llava")
    raw = _strip_data_url(frame_b64)

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": OBJECT_VISION_USER, "images": [raw]},
        ],
        "stream": False,
        "format": "json",
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{base}/api/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=90),
            ) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                content = data.get("message", {}).get("content", "")
    except Exception as exc:
        logger.debug("Ollama vision nicht verfügbar: %s", exc)
        return []

    parsed = _parse_objects_json(content)
    results = []
    for i, item in enumerate(parsed):
        box = _clamp_box(item, i)
        if box:
            results.append(box)
    return results[:8]


async def detect_objects_with_ai(frame_b64: str) -> tuple[list[dict], str]:
    """
    Returns (detections, source) where source is 'openai' | 'ollama' | 'none'.
    """
    if os.environ.get("OPENAI_API_KEY"):
        try:
            items = await _detect_openai(frame_b64)
            if items:
                return items, "openai"
        except Exception as exc:
            logger.warning("OpenAI object vision failed: %s", exc)

    if os.environ.get("ELITE_USE_OLLAMA_VISION", "").strip().lower() in ("1", "true", "yes"):
        try:
            items = await _detect_ollama(frame_b64)
            if items:
                return items, "ollama"
        except Exception as exc:
            logger.warning("Ollama object vision failed: %s", exc)

    return [], "none"
