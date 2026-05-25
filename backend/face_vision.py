"""GPT-4o Vision: Gesichtsästhetik-Report für Webcam-Frames."""

from __future__ import annotations

import base64
import logging
import os

try:
    from dotenv import load_dotenv
    _BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_BACKEND_DIR, ".env"))
    load_dotenv(os.path.join(_BACKEND_DIR, ".env.local"))
except ImportError:
    pass

import aiohttp

from prompts.face_aesthetics_report import (
    FACE_AESTHETICS_SYSTEM_PROMPT,
    FACE_AESTHETICS_USER_PROMPT,
)

logger = logging.getLogger("face-vision")


def _strip_data_url(frame_b64: str) -> str:
    if "," in frame_b64:
        return frame_b64.split(",", 1)[1]
    return frame_b64


async def analyze_face_aesthetics(frame_b64: str) -> dict:
    """
    Erstellt einen Editorial-Gesichtsästhetik-Report.
    Returns: { "report": str, "model": str } oder { "error": str }
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"error": "Kein OPENAI_API_KEY konfiguriert."}

    raw = _strip_data_url(frame_b64)

    payload = {
        "model": os.environ.get("FACE_AESTHETICS_MODEL", "gpt-4o"),
        "messages": [
            {"role": "system", "content": FACE_AESTHETICS_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": FACE_AESTHETICS_USER_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{raw}",
                            "detail": "high",
                        },
                    },
                ],
            },
        ],
        "max_tokens": int(os.environ.get("FACE_AESTHETICS_MAX_TOKENS", "2800")),
        "temperature": 0.4,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=aiohttp.ClientTimeout(total=90),
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error("Face aesthetics API %s: %s", resp.status, body[:400])
                    return {"error": f"Vision-API Fehler (HTTP {resp.status})"}

                data = await resp.json()
                report = data["choices"][0]["message"]["content"]
                return {
                    "report": report,
                    "model": payload["model"],
                }
    except Exception as e:
        logger.exception("Face aesthetics failed")
        return {"error": str(e)}
