# -*- coding: utf-8 -*-
"""Gemeinsames Gehirn für Elite und Hermes — bidirektionale Memory-Synchronisation.

Beim Agent-Start werden alle Memory-Quellen gelesen und zu einem kompakten
Kontext-Block zusammengeführt, der direkt in den System-Prompt injiziert wird.

Memory-Quellen:
  1. Elite MEMORY.md        — %LOCALAPPDATA%/EliteDesktopAgent/memory/MEMORY.md
  2. Hermes MEMORY.md       — ~/.hermes/memories/MEMORY.md (via WSL)
  3. Hermes USER.md          — ~/.hermes/memories/USER.md (via WSL)
  4. Elite LEARNED_RULES.md — .agent/LEARNED_RULES.md

Sync-Richtung:
  - Elite update_agent_memory → spiegelt nach Hermes MEMORY.md
  - Hermes memory tool         → wird beim nächsten Elite-Start gelesen
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("elite-shared-brain")

# Maximale Zeichen für den System-Prompt-Kontext (Token-Budget schonen)
MAX_BRAIN_CONTEXT_CHARS = 3000
MAX_PER_SOURCE_CHARS = 1200

# Hermes Memory-Pfade (innerhalb WSL)
_HERMES_MEMORY_PATH = "/home/deepcor/.hermes/memories/MEMORY.md"
_HERMES_USER_PATH = "/home/deepcor/.hermes/memories/USER.md"


def _read_wsl_file(wsl_path: str, max_chars: int = MAX_PER_SOURCE_CHARS) -> str:
    """Liest eine Datei aus WSL (Hermes-Umgebung) via wsl.exe."""
    try:
        result = subprocess.run(
            ["wsl.exe", "-d", "Ubuntu", "-u", "root", "--", "cat", wsl_path],
            capture_output=True,
            text=True,
            timeout=5,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode == 0 and result.stdout.strip():
            content = result.stdout.strip()
            if len(content) > max_chars:
                content = content[-max_chars:]  # Letzte Einträge sind relevanter
            return content
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        logger.debug("WSL-Datei nicht lesbar (%s): %s", wsl_path, e)
    return ""


def _read_local_file(path: str, max_chars: int = MAX_PER_SOURCE_CHARS) -> str:
    """Liest eine lokale Datei mit Zeichenlimit."""
    if not os.path.isfile(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read().strip()
        if len(content) > max_chars:
            content = content[-max_chars:]
        return content
    except OSError as e:
        logger.debug("Lokale Datei nicht lesbar (%s): %s", path, e)
        return ""


def load_shared_brain_context() -> str:
    """Lädt alle Memory-Quellen und erzeugt einen konsolidierten Kontext-Block.

    Wird beim Agent-Start aufgerufen und direkt in den System-Prompt injiziert.
    """
    from paths import get_memory_file

    sections: list[str] = []

    # 1. Elite eigenes Langzeitgedächtnis
    elite_memory = _read_local_file(get_memory_file())
    if elite_memory:
        sections.append(f"[ELITE MEMORY]\n{elite_memory}")

    # 2. Gelernte Regeln (Self-Learning Zyklus)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    rules_file = os.path.join(base_dir, ".agent", "LEARNED_RULES.md")
    rules = _read_local_file(rules_file, max_chars=800)
    if rules:
        sections.append(f"[GELERNTE REGELN]\n{rules}")

    # 3. Hermes Gedächtnis (System-Wissen aus WSL)
    hermes_memory = _read_wsl_file(_HERMES_MEMORY_PATH)
    if hermes_memory:
        # § Delimiter in Zeilenumbrüche umwandeln für bessere Lesbarkeit
        hermes_memory = hermes_memory.replace("\n§\n", "\n- ")
        sections.append(f"[HERMES MEMORY]\n{hermes_memory}")

    # 4. Hermes Nutzerprofil (Wer ist der Chef?)
    hermes_user = _read_wsl_file(_HERMES_USER_PATH)
    if hermes_user:
        hermes_user = hermes_user.replace("\n§\n", "\n- ")
        sections.append(f"[NUTZERPROFIL]\n{hermes_user}")

    if not sections:
        logger.info("Shared Brain: Keine Memory-Quellen gefunden.")
        return ""

    combined = "\n\n".join(sections)

    # Gesamtlänge begrenzen
    if len(combined) > MAX_BRAIN_CONTEXT_CHARS:
        combined = combined[:MAX_BRAIN_CONTEXT_CHARS] + "\n... [Kontext gekürzt]"

    logger.info(
        "Shared Brain geladen: %d Zeichen aus %d Quellen",
        len(combined),
        len(sections),
    )

    return (
        "\n\n--- GEMEINSAMES GEDÄCHTNIS (Elite + Hermes) ---\n"
        "Die folgenden Informationen hast du dir in früheren Sessions gemerkt. "
        "Nutze sie aktiv, um den Nutzer persönlich anzusprechen und kontextbezogen zu reagieren. "
        "Wenn der Nutzer fragt 'Was weißt du über mich?', antworte aus diesem Wissen.\n\n"
        f"{combined}\n"
    )


def sync_elite_memory_to_hermes(information: str, category: str = "general") -> None:
    """Spiegelt einen Elite-Memory-Eintrag nach Hermes MEMORY.md (via WSL append).

    Wird nach jedem `update_agent_memory` Call aufgerufen.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    # Hermes nutzt § als Delimiter
    entry = f"\n§\n[Elite {timestamp}] [{category.upper()}] {information}"
    # Shell-sichere Kodierung
    safe_entry = entry.replace("'", "'\\''")

    try:
        result = subprocess.run(
            [
                "wsl.exe", "-d", "Ubuntu", "-u", "deepcor", "--",
                "bash", "-c",
                f"echo '{safe_entry}' >> {_HERMES_MEMORY_PATH}",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            logger.info("Elite Memory nach Hermes gespiegelt: %s", information[:80])
        else:
            logger.warning(
                "Hermes-Spiegelung fehlgeschlagen (exit %d): %s",
                result.returncode,
                result.stderr[:200],
            )
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        logger.debug("Hermes-Spiegelung nicht möglich: %s", e)
