"""Erkennt CAD-Sprachbefehle und publiziert STL-Ergebnisse ans HUD (ohne LLM-Tool-Calling)."""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger("elite-cad-intent")

CAD_TRIGGER = re.compile(
    r"\b(erstelle|generiere|mach|baue|konstruiere|designe|modelle|modelliere)\b",
    re.I,
)
CAD_CONTEXT = re.compile(
    r"\b(3d|cad|stl|modell|herz|heart|würfel|wuerfel|cube|kugel|sphere|kugeln|zylinder|cylinder|würfel)\b",
    re.I,
)


def extract_cad_prompt(transcript: str) -> str | None:
    """Liefert CAD-Prompt wenn der Nutzer ein 3D-Modell anfordert."""
    text = (transcript or "").strip()
    if not text:
        return None
    if not CAD_TRIGGER.search(text):
        return None
    if not CAD_CONTEXT.search(text):
        return None
    prompt = re.sub(r"^(hey[\s,]+)?(elite|jarvis)[,\s]+", "", text, flags=re.I).strip()
    return prompt or text


async def dispatch_cad_to_hud(room, prompt: str) -> dict:
    """Generiert STL und sendet cad_update + Widget-Open ans Frontend."""
    from cad_service import generate_cad

    logger.info("CAD-Intent: '%s'", prompt)
    result = await generate_cad(prompt)
    stl = result.get("stl_path", "")

    async def publish(payload: dict) -> None:
        if not room or not getattr(room, "local_participant", None):
            return
        try:
            await room.local_participant.publish_data(
                json.dumps(payload, ensure_ascii=False).encode("utf-8")
            )
        except Exception as exc:
            logger.warning("CAD HUD publish failed: %s", exc)

    if stl:
        await publish(
            {
                "type": "cad_update",
                "stl_path": stl,
                "prompt": prompt,
                "demo": result.get("demo", False),
                "shape": result.get("shape"),
            }
        )
        await publish({"type": "widget_control", "action": "open", "widgetId": "cad"})

    await publish(
        {
            "type": "log_event",
            "log": {
                "type": "result" if result.get("success") else "error",
                "message": result.get("message", "CAD abgeschlossen."),
            },
        }
    )
    return result
