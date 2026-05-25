# -*- coding: utf-8 -*-
"""Shared PAI directory resolution and voice-memory mirroring for Elite runtime."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Iterable

PAI_USER_FILES: tuple[tuple[str, str], ...] = (
    # SOUL.md omitted — loaded from agents/elite-agent/SOUL.md in agent.py to avoid duplication
    ("USER.md", "PAI USER PROFILE (Benutzerdaten)"),
    ("ACCESS_POLICY.md", "PAI ACCESS POLICY (Berechtigungen)"),
    ("HEARTBEAT.md", "PAI OPERATIVE HEARTBEAT (Routine)"),
    ("TELOS.md", "PAI TELOS (Leitbild)"),
    ("IDEAL_STATE.md", "PAI IDEAL STATE (Erfolgsbild)"),
    ("IDENTITY.md", "PAI IDENTITY (Richtlinien)"),
    ("DA_IDENTITY.md", "PAI DA IDENTITY (Agent-Charakter)"),
    ("PROJECTS/PROJECTS.md", "PAI PROJECTS (Projektstatus)"),
    ("TELOS/PRINCIPAL_TELOS.md", "PAI PRINCIPAL TELOS (Langfristige Ziele)"),
)

VOICE_LEARNING_FILENAME = "VOICE_NOTES.md"


def pai_user_dir_candidates() -> list[str]:
    """Prefer Claude PAI (Pulse/HUD), fallback legacy ~/PAI."""
    home = os.path.expanduser("~")
    explicit_root = os.environ.get("PAI_HOME", "").strip()
    candidates: list[str] = []
    if explicit_root:
        candidates.append(os.path.join(explicit_root, "USER"))
    candidates.extend(
        [
            os.path.join(home, ".claude", "PAI", "USER"),
            os.path.join(home, "PAI", "USER"),
        ]
    )
    # Preserve order and remove duplicates.
    dedup: list[str] = []
    for candidate in candidates:
        if candidate not in dedup:
            dedup.append(candidate)
    return dedup


def resolve_pai_user_dir() -> str | None:
    for path in pai_user_dir_candidates():
        if os.path.isdir(path):
            return path
    return None


def iter_pai_learning_dirs() -> Iterable[str]:
    home = os.path.expanduser("~")
    for root in (
        os.path.join(home, ".claude", "PAI", "USER", "LEARNING"),
        os.path.join(home, "PAI", "USER", "LEARNING"),
    ):
        yield root


def load_pai_user_context() -> str:
    """Load PAI markdown blocks for system prompt (excludes SOUL — repo SOUL is canonical)."""
    blocks: list[str] = []
    seen_paths: set[str] = set()

    for user_dir in pai_user_dir_candidates():
        if not os.path.isdir(user_dir):
            continue
        for md_file, title in PAI_USER_FILES:
            file_path = os.path.join(user_dir, md_file)
            norm = os.path.normcase(file_path)
            if norm in seen_paths or not os.path.isfile(file_path):
                continue
            seen_paths.add(norm)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                if content:
                    blocks.append(f"\n\n--- {title} ---\n{content}\n")
            except OSError:
                continue
    return "".join(blocks)


def mirror_voice_memory_to_pai(information: str, category: str = "general") -> None:
    """Append voice learning to PAI LEARNING/VOICE_NOTES.md in all PAI roots."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    line = f"\n- [{timestamp}] [{category.upper()}] {information}"
    header = "# Elite Voice Learning\n\nAutomatisch aus Sprach-/Chat-Gedächtnis (`update_agent_memory`).\n"

    for learning_dir in iter_pai_learning_dirs():
        try:
            os.makedirs(learning_dir, exist_ok=True)
            path = os.path.join(learning_dir, VOICE_LEARNING_FILENAME)
            if not os.path.exists(path):
                with open(path, "w", encoding="utf-8") as f:
                    f.write(header)
            with open(path, "a", encoding="utf-8") as f:
                f.write(line)
        except OSError:
            continue


def sync_appdata_memory_to_pai(memory_file: str) -> None:
    """Mirror full AppData MEMORY.md into PAI LEARNING for session-end sync."""
    if not os.path.isfile(memory_file):
        return
    try:
        with open(memory_file, "r", encoding="utf-8") as f:
            content = f.read().strip()
    except OSError:
        return
    if not content:
        return

    snapshot = (
        f"# Elite AppData Memory Snapshot\n\n"
        f"Synced at {datetime.now().isoformat(timespec='seconds')}\n\n"
        f"{content}\n"
    )

    for learning_dir in iter_pai_learning_dirs():
        try:
            os.makedirs(learning_dir, exist_ok=True)
            path = os.path.join(learning_dir, "ELITE_MEMORY_SNAPSHOT.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(snapshot)
        except OSError:
            continue
