# -*- coding: utf-8 -*-
"""
Selbstlernendes System für den Elite Desktop Agent.
KI-Agenten arbeiten zusammen, um aus dem Chatverlauf und Logs dauerhafte Regeln
und Benutzer-Präferenzen zu extrahieren und zu konsolidieren.
"""

import os
import json
import logging
import aiohttp
import asyncio
from datetime import datetime
from self_healing import call_chat_api, emit_healing_log

logger = logging.getLogger("elite-self-learning")

async def run_learning_cycle(context) -> str:
    """Führt einen kollaborativen Selbstlern-Zyklus aus."""
    await emit_healing_log(context, "thinking", "🎓 LEARN: Starte selbstlernenden Zyklus...")

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    local_memory_file = os.path.join(base_dir, ".agent", "CONVERSATION_MEMORY.md")
    learned_rules_file = os.path.join(base_dir, ".agent", "LEARNED_RULES.md")
    
    # 1. Konversationsgedächtnis einlesen
    if not os.path.exists(local_memory_file):
        await emit_healing_log(context, "warning", "Lernzyklus abgebrochen: Kein Konversationsgedächtnis gefunden.")
        return "Keine Daten zum Lernen vorhanden."
        
    try:
        with open(local_memory_file, "r", encoding="utf-8", errors="replace") as f:
            memory_content = f.read()
    except Exception as e:
        await emit_healing_log(context, "error", f"Fehler beim Lesen des Gedächtnisses: {e}")
        return f"Fehler: {e}"

    # Letzte 5000 Zeichen lesen, falls das File zu lang ist, für LLM-Context-Effizienz
    recent_history = memory_content[-6000:] if len(memory_content) > 6000 else memory_content

    # Vorhandene Regeln lesen
    existing_rules = ""
    if os.path.exists(learned_rules_file):
        try:
            with open(learned_rules_file, "r", encoding="utf-8") as f:
                existing_rules = f.read()
        except: pass

    # 2. Learner-Agent (Elite-Learner)
    await emit_healing_log(context, "thinking", "🧠 THINK: Learner-Agent (Elite-Learner) analysiert Historie...")
    learner_system = (
        "Du bist Elite-Learner, der selbstlernende Extraktor-Agent. Deine Aufgabe ist es, aus der letzten Aktivitäts-Historie "
        "des Elite Desktop Agents wichtige Erkenntnisse über den Benutzer (Ed), seine Wünsche, Präferenzen, bevorzugten Pfade "
        "oder gelöste Probleme zu extrahieren. Halte dich extrem kurz und nenne nur neue, konkrete Stichpunkte auf Deutsch."
    )
    learner_prompt = (
        f"Hier ist die kürzliche Historie:\n{recent_history}\n\n"
        f"Bereits bekannte Regeln:\n{existing_rules or 'Keine bisherigen Regeln.'}\n\n"
        "Welche neuen Erkenntnisse, bevorzugte Apps, Pfade oder Regeln für die Zukunft lassen sich daraus extrahieren? "
        "Nenne sie stichpunktartig."
    )

    try:
        extracted_learnings = await call_chat_api(learner_prompt, learner_system)
        await emit_healing_log(context, "thinking", "🧠 THINK: Learner-Agent hat neue Erkenntnisse extrahiert.")
    except Exception as e:
        await emit_healing_log(context, "error", f"Lernen fehlgeschlagen: {e}")
        return f"Fehler beim Extrahieren der Learnings: {e}"

    # 3. Synthesizer-Agent (Elite-Synthesizer)
    await emit_healing_log(context, "thinking", "📋 PLAN: Synthesizer-Agent (Elite-Synthesizer) konsolidiert die Regeln...")
    synth_system = (
        "Du bist Elite-Synthesizer. Deine Aufgabe ist es, die neu extrahierten Erkenntnisse mit der bestehenden Regel-Datenbank "
        "zu mergen. Entferne Redundanzen, formuliere präzise Verhaltensregeln und gib ein sauberes Markdown-Dokument aus, "
        "das alle konsolidierten Regeln listet. Nutze Kategorien wie [Präferenzen], [System], [Pfade], [Fehlerbehebungen]."
    )
    synth_prompt = (
        f"Bestehende Regeln:\n{existing_rules or 'Keine.'}\n\n"
        f"Neu extrahierte Erkenntnisse:\n{extracted_learnings}\n\n"
        "Gib das aktualisierte, vollständige Markdown-Dokument aus."
    )

    try:
        consolidated_markdown = await call_chat_api(synth_prompt, synth_system)
    except Exception as e:
        await emit_healing_log(context, "error", f"Konsolidierung fehlgeschlagen: {e}")
        return f"Fehler bei der Synthese: {e}"

    # 4. Regeln speichern
    try:
        os.makedirs(os.path.dirname(learned_rules_file), exist_ok=True)
        with open(learned_rules_file, "w", encoding="utf-8") as f:
            f.write(consolidated_markdown)
        await emit_healing_log(context, "result", f"Erfolg: Regeldatenbank aktualisiert unter {os.path.basename(learned_rules_file)}")
    except Exception as e:
        await emit_healing_log(context, "error", f"Fehler beim Speichern der Regeln: {e}")
        return f"Fehler beim Speichern: {e}"

    # 5. Spiegeln in PAI-Verzeichnisse (Integrieren)
    await emit_healing_log(context, "result", "🚀 INTEGRATE: Spiegele Regeln in das PAI Life OS System...")
    try:
        from sync_pai_memory import sync_pai_memory
        # Wir rufen sync_pai_memory auf, um die Daten auf PAI zu spiegeln.
        # Da learned_rules_file neu ist, kopieren wir es zusätzlich als LEARNED_RULES.md nach USER/LEARNING
        import shutil
        from pai_paths import iter_pai_learning_dirs
        for learning_dir in iter_pai_learning_dirs():
            os.makedirs(learning_dir, exist_ok=True)
            shutil.copy2(learned_rules_file, os.path.join(learning_dir, "LEARNED_RULES.md"))
        
        # PAI Synchronisation starten
        await asyncio.to_thread(sync_pai_memory)
        await emit_healing_log(context, "result", "Learnings erfolgreich synchronisiert.")
    except Exception as mirror_err:
        logger.warning(f"PAI sync failed in learning cycle: {mirror_err}")

    await emit_healing_log(context, "result", "🎉 Lernzyklus erfolgreich abgeschlossen!")
    return "Lernzyklus abgeschlossen. Neue Verhaltensregeln wurden konsolidiert."
