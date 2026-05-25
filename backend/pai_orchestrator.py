# -*- coding: utf-8 -*-
"""Central PAI orchestration for context loading, sync, and runtime state."""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from pai_paths import load_pai_user_context, resolve_pai_user_dir, sync_appdata_memory_to_pai
from sync_mc_files import sync_files as sync_mc_files
from sync_pai_memory import sync_pai_memory


def _pai_roots() -> list[str]:
    home = os.path.expanduser("~")
    return [
        os.path.join(home, ".claude", "PAI"),
        os.path.join(home, "PAI"),
    ]


def _work_state_candidates() -> list[str]:
    candidates: list[str] = []
    for root in _pai_roots():
        candidates.extend(
            [
                os.path.join(root, "MEMORY", "STATE", "work.json"),
                os.path.join(root, "USER", "WORK", "work.json"),
                os.path.join(root, "USER", "WORK", "CURRENT_WORK.json"),
            ]
        )
    return candidates


@dataclass
class PaiState:
    online: bool
    user_dir: str | None
    context: str
    work_state: dict[str, Any] | None
    synced_at: str


class PaiOrchestrator:
    def __init__(self) -> None:
        self._state = PaiState(
            online=False,
            user_dir=None,
            context="",
            work_state=None,
            synced_at=datetime.now().isoformat(timespec="seconds"),
        )

    def _read_work_state(self) -> dict[str, Any] | None:
        for candidate in _work_state_candidates():
            if not os.path.isfile(candidate):
                continue
            try:
                with open(candidate, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                if isinstance(payload, dict):
                    return payload
            except Exception:
                continue
        return None

    def refresh_context(self) -> PaiState:
        user_dir = resolve_pai_user_dir()
        context = load_pai_user_context()
        work_state = self._read_work_state()
        self._state = PaiState(
            online=bool(user_dir),
            user_dir=user_dir,
            context=context,
            work_state=work_state,
            synced_at=datetime.now().isoformat(timespec="seconds"),
        )
        return self._state

    async def startup_sync(self) -> PaiState:
        await asyncio.to_thread(sync_pai_memory)
        await asyncio.to_thread(sync_mc_files)
        return self.refresh_context()

    async def session_end_sync(self, memory_file: str) -> PaiState:
        await asyncio.to_thread(sync_pai_memory)
        await asyncio.to_thread(sync_mc_files)
        await asyncio.to_thread(sync_appdata_memory_to_pai, memory_file)
        return self.refresh_context()

    def get_state(self) -> PaiState:
        return self._state


PAI_ORCHESTRATOR = PaiOrchestrator()

