"""HUD tool confirmation gate (ADA-style)."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from livekit.agents import RunContext

from elite_settings import load_elite_settings

logger = logging.getLogger("elite-tool-permissions")

_pending: dict[str, asyncio.Future[bool]] = {}


def resolve_tool_confirmation(confirm_id: str, approved: bool) -> bool:
    future = _pending.get(confirm_id)
    if future and not future.done():
        future.set_result(approved)
        return True
    return False


async def require_tool_confirmation(
    context: RunContext,
    tool_key: str,
    summary: str,
    timeout: float = 90.0,
) -> bool:
    from tools import emit_log, get_room_from_context

    settings = load_elite_settings()
    if not settings.get("tool_permissions", {}).get(tool_key, False):
        return True

    confirm_id = str(uuid.uuid4())
    loop = asyncio.get_running_loop()
    future: asyncio.Future[bool] = loop.create_future()
    _pending[confirm_id] = future

    room = get_room_from_context(context)
    if room:
        payload = json.dumps(
            {
                "type": "tool_confirmation_request",
                "id": confirm_id,
                "tool": tool_key,
                "summary": summary,
            }
        )
        try:
            await room.local_participant.publish_data(payload.encode("utf-8"))
        except Exception as e:
            logger.warning("tool_confirmation_request failed: %s", e)
            _pending.pop(confirm_id, None)
            return True

    await emit_log(context, "system", f"Bestätigung erforderlich: {tool_key} – {summary}")
    try:
        return await asyncio.wait_for(future, timeout=timeout)
    except asyncio.TimeoutError:
        await emit_log(context, "error", f"Bestätigung für {tool_key} abgelaufen.")
        return False
    finally:
        _pending.pop(confirm_id, None)


async def publish_ada_event(context: RunContext, event_type: str, data: dict[str, Any]) -> None:
    from tools import get_room_from_context

    room = get_room_from_context(context)
    if not room:
        return
    payload = json.dumps({"type": event_type, **data})
    try:
        await room.local_participant.publish_data(payload.encode("utf-8"))
    except Exception as e:
        logger.debug("publish_ada_event failed: %s", e)
