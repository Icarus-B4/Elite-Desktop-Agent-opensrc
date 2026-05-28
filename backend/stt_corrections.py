"""Deutsche STT-Nachkorrektur (Whisper/OpenAI) + Domain-Prompt für CAD & Wake-Words."""

from __future__ import annotations

import re

WHISPER_INITIAL_PROMPT = ""


def _normalize_ws(text: str) -> str:
    t = re.sub(r"[,!.?;:]+", " ", (text or "").strip().lower())
    return re.sub(r"\s+", " ", t).strip()


def apply_german_stt_corrections(text: str) -> str:
    """Korrigiert häufige Whisper-Fehlhörungen bei deutschen Imperativen / CAD."""
    original = (text or "").strip()
    if not original:
        return original

    t = _normalize_ws(original)
    if not t:
        return original

    corrected = t

    corrected = re.sub(r"\b(es stelle|er stelle|is stelle|estelle)\b", "erstelle", corrected)
    corrected = re.sub(r"\b(generier|generiere)\b", "generiere", corrected)

    corrected = re.sub(r"\beine dreite\b", "ein 3d", corrected)
    corrected = re.sub(r"\bein dreite\b", "ein 3d", corrected)
    corrected = re.sub(r"\bdreite\b", "3d", corrected)
    corrected = re.sub(r"\b3 d\b", "3d", corrected)
    corrected = re.sub(r"\bdreid\b", "3d", corrected)
    corrected = re.sub(r"\bd 3 d\b", "3d", corrected)
    corrected = re.sub(r"\bdreidimensional\b", "3d", corrected)

    corrected = re.sub(r"\bhurt\b", "herz", corrected)
    corrected = re.sub(r"\bherts?\b", "herz", corrected)
    corrected = re.sub(r"\bherdt\b", "herz", corrected)
    corrected = re.sub(r"\bhairz\b", "herz", corrected)
    corrected = re.sub(r"\bhertz\b", "herz", corrected)

    corrected = re.sub(r"\bwörful\b", "würfel", corrected)
    corrected = re.sub(r"\bwuerfel\b", "würfel", corrected)
    corrected = re.sub(r"\bwürfel\b", "würfel", corrected)

    corrected = re.sub(r"\belit\b", "elite", corrected)
    corrected = re.sub(r"\bellit\b", "elite", corrected)
    corrected = re.sub(r"\bellie\b", "elite", corrected)

    corrected = re.sub(r"\böffnet\b", "öffne", corrected)

    # Phonetische Korrekturen für Schweizerdeutsch & Whisper-Fehlhörer
    corrected = re.sub(r"\b(klon\s*jobs?|klon\s*jops?)\b", "cronjob", corrected)
    corrected = re.sub(r"\bhermit\b", "hermes", corrected)
    corrected = re.sub(r"\bläden\b", "leeren", corrected)

    if corrected != t:
        return corrected
    return original
