# -*- coding: utf-8 -*-
"""
Selbstheilendes System für den Elite Desktop Agent.
KI-Agenten arbeiten zusammen, um Systemfehler zu analysieren, Code-Patches zu
erstellen, diese auf Sicherheit zu prüfen, einzuspielen und zu verifizieren.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import time
import py_compile
from datetime import datetime
from typing import Any

import aiohttp

from paths import get_data_dir

logger = logging.getLogger("elite-self-healing")

_BACKUP_RETRIES = 5
_BACKUP_INITIAL_DELAY_S = 0.15
_TSC_TIMEOUT_S = 180
# Default strikt: gesamtes tsc --noEmit muss grün sein. ELITE_SELF_HEAL_STRICT_TSC=0 = Datei-Filter (Escape-Hatch).
_STRICT_TSC_DEFAULT = True


def _healing_backup_dir() -> str:
    """Dediziertes Backup-Verzeichnis unter AppData (Windows-sicher, keine .bak neben Quelle)."""
    return get_data_dir("healing-backups")


def _make_backup_destination(target_file: str) -> str:
    abs_target = os.path.abspath(target_file)
    digest = hashlib.sha256(abs_target.encode("utf-8")).hexdigest()[:16]
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = os.path.basename(abs_target)
    return os.path.join(_healing_backup_dir(), f"{ts}_{digest}_{base}")


def _copy_with_retry(src: str, dst: str) -> None:
    """Atomisches Kopieren mit Retry (AV-Locks / geöffnete Dateien auf Windows)."""
    last_err: OSError | None = None
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".part"
    delay = _BACKUP_INITIAL_DELAY_S
    for attempt in range(1, _BACKUP_RETRIES + 1):
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
            shutil.copy2(src, tmp)
            os.replace(tmp, dst)
            src_size = os.path.getsize(src)
            dst_size = os.path.getsize(dst)
            if dst_size < 1 or dst_size != src_size:
                raise OSError(
                    f"Backup-Integrität fehlgeschlagen ({dst_size} Bytes, erwartet {src_size})"
                )
            with open(src, "rb") as src_fh, open(dst, "rb") as dst_fh:
                if hashlib.sha256(src_fh.read()).digest() != hashlib.sha256(dst_fh.read()).digest():
                    raise OSError("Backup-Integrität fehlgeschlagen (SHA-256)")
            return
        except OSError as exc:
            last_err = exc
            logger.warning(
                "Backup-Kopie Versuch %s/%s fehlgeschlagen: %s",
                attempt,
                _BACKUP_RETRIES,
                exc,
            )
            if attempt < _BACKUP_RETRIES:
                time.sleep(delay)
                delay = min(delay * 2, 2.0)
    raise OSError(
        f"Backup nach {_BACKUP_RETRIES} Versuchen fehlgeschlagen: {last_err}"
    ) from last_err


def create_healing_backup(target_file: str) -> tuple[str | None, str | None]:
    """Erstellt Backup unter AppData. Returns (backup_path, error_message)."""
    if not os.path.isfile(target_file):
        return None, f"Quelldatei existiert nicht: {target_file}"
    backup_path = _make_backup_destination(target_file)
    try:
        _copy_with_retry(target_file, backup_path)
        return backup_path, None
    except OSError as exc:
        return None, str(exc)


def restore_from_healing_backup(target_file: str, backup_path: str) -> tuple[bool, str | None]:
    """Stellt Original aus Backup wieder her (copy, kein move — Zieldatei kann gesperrt sein)."""
    if not backup_path or not os.path.isfile(backup_path):
        return False, f"Backup nicht gefunden: {backup_path}"
    delay = _BACKUP_INITIAL_DELAY_S
    last_err: OSError | None = None
    for attempt in range(1, _BACKUP_RETRIES + 1):
        try:
            _copy_with_retry(backup_path, target_file)
            return True, None
        except OSError as exc:
            last_err = exc
            if attempt < _BACKUP_RETRIES:
                time.sleep(delay)
                delay = min(delay * 2, 2.0)
    return False, str(last_err)


def discard_healing_backup(backup_path: str | None) -> None:
    if not backup_path:
        return
    for attempt in range(3):
        try:
            if os.path.isfile(backup_path):
                os.remove(backup_path)
            return
        except OSError as exc:
            logger.warning("Backup-Löschen fehlgeschlagen (%s): %s", attempt + 1, exc)
            time.sleep(0.1 * (attempt + 1))


def _language_label_for_path(target_file: str) -> str:
    ext = os.path.splitext(target_file)[1].lower()
    if ext == ".py":
        return "Python"
    if ext in (".ts", ".tsx", ".js", ".jsx"):
        return "TypeScript/JavaScript"
    return "Projekt"


def _bracket_balance_ok(text: str) -> bool:
    pairs = {"(": ")", "[": "]", "{": "}"}
    stack: list[str] = []
    in_string: str | None = None
    escape = False
    for ch in text:
        if in_string:
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == in_string:
                in_string = None
            continue
        if ch in ("'", '"', "`"):
            in_string = ch
            continue
        if ch in pairs:
            stack.append(pairs[ch])
        elif ch in pairs.values():
            if not stack or stack.pop() != ch:
                return False
    return not stack


def write_text_atomic(target_path: str, content: str, encoding: str = "utf-8") -> None:
    """Schreibt Text atomar (temp + os.replace) — robuster auf Windows als direktes Überschreiben."""
    abs_target = os.path.abspath(target_path)
    parent = os.path.dirname(abs_target) or "."
    os.makedirs(parent, exist_ok=True)
    temp_path = os.path.join(
        parent,
        f".{os.path.basename(abs_target)}.elite-heal-{os.getpid()}.tmp",
    )
    try:
        with open(temp_path, "w", encoding=encoding, newline="") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temp_path, abs_target)
    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except OSError:
            pass


def _find_tsconfig_project_dir(target_file: str) -> str | None:
    """Sucht das nächste Verzeichnis mit tsconfig.json (ohne node_modules)."""
    current = os.path.abspath(os.path.dirname(target_file))
    for _ in range(32):
        if "node_modules" in current.replace("\\", "/").split("/"):
            parent = os.path.dirname(current)
            if parent == current:
                break
            current = parent
            continue
        tsconfig = os.path.join(current, "tsconfig.json")
        if os.path.isfile(tsconfig):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return None


def _tsc_command(project_dir: str) -> list[str]:
    """Lokales tsc bevorzugen (Yarn/npm), sonst npx."""
    bin_name = "tsc.cmd" if os.name == "nt" else "tsc"
    local_tsc = os.path.join(project_dir, "node_modules", ".bin", bin_name)
    if os.path.isfile(local_tsc):
        return [local_tsc, "-p", project_dir, "--noEmit"]
    return ["npx", "--yes", "typescript", "tsc", "-p", project_dir, "--noEmit"]


def _strict_tsc_enabled() -> bool:
    """True = projektweites tsc --noEmit muss fehlerfrei sein (Default). ELITE_SELF_HEAL_STRICT_TSC=0 = Datei-Filter."""
    raw = os.environ.get("ELITE_SELF_HEAL_STRICT_TSC")
    if raw is None:
        return _STRICT_TSC_DEFAULT
    return raw.strip().lower() not in ("0", "false", "no", "off")


def _verify_typescript_project(target_file: str) -> tuple[bool, str | None]:
    """Führt tsc -p <nearest tsconfig> --noEmit aus (projektweit, ohne Datei-Filter im Strict-Modus)."""
    project_dir = _find_tsconfig_project_dir(target_file)
    if not project_dir:
        return True, None

    cmd = _tsc_command(project_dir)
    try:
        completed = subprocess.run(
            cmd,
            cwd=project_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=_TSC_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False, f"tsc --noEmit Timeout nach {_TSC_TIMEOUT_S}s ({project_dir})"
    except OSError as exc:
        return False, f"tsc konnte nicht gestartet werden: {exc}"

    output = ((completed.stdout or "") + (completed.stderr or "")).strip()
    if completed.returncode == 0:
        return True, None

    abs_target = os.path.abspath(target_file)
    rel_target = os.path.relpath(abs_target, project_dir).replace("\\", "/")

    if not _strict_tsc_enabled():
        norm_output = output.replace("\\", "/")
        target_markers = (
            rel_target,
            rel_target.lower(),
            abs_target.replace("\\", "/"),
            abs_target.replace("\\", "/").lower(),
            os.path.basename(target_file),
        )
        target_has_error = any(marker and marker in norm_output for marker in target_markers)
        if not target_has_error:
            logger.warning(
                "tsc meldet Fehler außerhalb von %s — Patch-Verifikation OK (ELITE_SELF_HEAL_STRICT_TSC=0)",
                rel_target,
            )
            return True, None

    logger.warning(
        "tsc --noEmit fehlgeschlagen (returncode=%s, strikt=%s, Projekt=%s, Zieldatei=%s)",
        completed.returncode,
        _strict_tsc_enabled(),
        project_dir,
        rel_target,
    )
    if len(output) > 1200:
        output = output[:1200] + "\n… (gekürzt)"
    mode = "strikt, projektweit" if _strict_tsc_enabled() else f"Fehler in {rel_target}"
    return (
        False,
        f"tsc --noEmit fehlgeschlagen ({mode}, returncode {completed.returncode}, {project_dir}):\n"
        f"{output or 'ohne Ausgabe'}",
    )


def verify_patched_file(target_file: str) -> tuple[bool, str | None]:
    """Syntax-/Integritätsprüfung je nach Dateityp."""
    ext = os.path.splitext(target_file)[1].lower()
    if ext == ".py":
        try:
            py_compile.compile(target_file, doraise=True)
            return True, None
        except py_compile.PyCompileError as exc:
            return False, str(exc)
    if ext == ".json":
        try:
            with open(target_file, encoding="utf-8") as handle:
                json.load(handle)
            return True, None
        except (json.JSONDecodeError, OSError) as exc:
            return False, str(exc)
    try:
        with open(target_file, "r", encoding="utf-8", errors="replace") as handle:
            content = handle.read()
        if not content.strip():
            return False, "Datei ist leer nach Patch."
        if ext in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"} and not _bracket_balance_ok(content):
            return False, "Klammerbalance fehlgeschlagen (heuristisch)"
    except OSError as exc:
        return False, str(exc)

    if ext in {".ts", ".tsx"}:
        return _verify_typescript_project(target_file)

    return True, None


async def emit_healing_log(context: Any, log_type: str, message: str) -> None:
    """Sendet einen Log-Eintrag an das Frontend-HUD (Vermeidet zirkuläre Imports)."""
    try:
        from tools import get_room_from_context
        room = get_room_from_context(context)
        if room:
            payload = json.dumps({
                "type": "log_event",
                "log": {
                    "type": log_type,
                    "message": f"[Self-Healing] {message}"
                }
            })
            await room.local_participant.publish_data(payload.encode('utf-8'))
    except Exception as e:
        logger.warning(f"Self-healing log failed: {e}")

async def call_chat_api(prompt: str, system_prompt: str) -> str:
    """Ruft die Chat-API (Cloud/OpenAI oder Lokal/Ollama) basierend auf der Konfiguration auf."""
    from elite_config import load_config, resolve_llm_mode
    config = load_config()
    llm_mode = resolve_llm_mode(config)
    
    if llm_mode == "local":
        base_url = config.get("ollamaBaseUrl", "http://127.0.0.1:11434/v1")
        model = config.get("ollamaModel", "llama3.1")
        url = f"{base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2
        }
        headers = {"Content-Type": "application/json"}
    else:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise Exception("Kein OPENAI_API_KEY in der Umgebung gefunden.")
        url = "https://api.openai.com/v1/chat/completions"
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data["choices"][0]["message"]["content"]
            else:
                err_text = await resp.text()
                raise Exception(f"LLM API Error (HTTP {resp.status}): {err_text}")

def _get_search_roots() -> list[str]:
    """Liefert alle bekannten Projekt-Wurzelverzeichnisse für die Dateisuche."""
    home = os.path.expanduser("~")
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    roots = [
        base_dir,                                                      # Elite-Desktop-Agent Root
        os.path.join(base_dir, "backend"),                             # Backend-Ordner
        os.path.join(base_dir, "frontend"),                            # Frontend-Ordner
        os.path.join(home, ".claude", "PAI"),                          # PAI Pulse/MEMORY
        os.path.join(home, ".claude", "PAI", "PULSE"),                 # PULSE Daemon
        os.path.join(home, ".claude", "PAI", "PULSE", "Observability"),# PULSE Observatory
        os.path.join(home, ".claude", "PAI", "MEMORY"),                # PAI Memory/State
    ]
    return [r for r in roots if os.path.isdir(r)]


def _fuzzy_find_file(error_message: str) -> str | None:
    """Durchsucht bekannte Projekt-Roots nach Dateien, die zur Fehlermeldung passen.
    
    Strategie:
    1. Explizite Dateinamen aus der Nachricht extrahieren (z.B. 'novelty-state.ts')
    2. Schlüsselwort-basierte Suche in Verzeichnissen
    3. Erweiterungstypen priorisieren (.py > .ts > .tsx > .json)
    """
    import glob as glob_mod
    msg_lower = error_message.lower()
    
    # --- Phase 1: Explizite Dateinamen finden ---
    # Suche nach Mustern wie 'dateiname.ext' in der Nachricht
    filename_patterns = re.findall(r'[\w\-]+\.(?:py|ts|tsx|js|jsx|json|md|yaml|yml)', msg_lower)
    if filename_patterns:
        for root in _get_search_roots():
            for pattern in filename_patterns:
                for match in glob_mod.glob(os.path.join(root, "**", pattern), recursive=True):
                    if os.path.isfile(match) and "node_modules" not in match and ".next" not in match:
                        logger.info(f"Fuzzy-Find: Datei '{match}' aus Fehlermeldung extrahiert.")
                        return match
    
    # --- Phase 2: Schlüsselwort → Datei Mapping ---
    keyword_file_map = {
        "loop":            ["lib/loops-api.ts", "Observability/src/components/activity/LoopsDashboard.tsx"],
        "novelty":         ["lib/novelty-state.ts", "Observability/src/app/novelty/page.tsx"],
        "self_heal":       ["backend/self_healing.py"],
        "self_learn":      ["backend/self_learning.py"],
        "agent":           ["backend/agent.py"],
        "tools":           ["backend/tools.py"],
        "observability":   ["Observability/observability.ts"],
        "pulse":           ["pulse.ts"],
        "dashboard":       ["Observability/src/app/agents/page.tsx"],
        "widget":          ["frontend/components/dashboard/widget-manager.tsx"],
        "system-status":   ["frontend/app/api/system-status/route.ts"],
        "mission control": ["lib/mission-control-client.ts"],
        "work":            ["lib/work-registry.ts"],
        "ladder":          ["lib/ladder-seed.ts"],
        "config":          ["frontend/elite.config.json", "backend/elite_config.py"],
        "memory":          [".agent/CONVERSATION_MEMORY.md", "MEMORY/STATE/novelty-state.json"],
    }
    
    for keyword, rel_paths in keyword_file_map.items():
        if keyword in msg_lower:
            for root in _get_search_roots():
                for rel_path in rel_paths:
                    candidate = os.path.join(root, rel_path)
                    if os.path.isfile(candidate):
                        logger.info(f"Fuzzy-Find: Schlüsselwort '{keyword}' → '{candidate}'")
                        return candidate
    
    # --- Phase 3: Fehlermeldung enthält vielleicht einen Pfad-Fragment ---
    path_fragments = re.findall(r'[A-Za-z]:\\[^\s"\'<>|]+', error_message)
    for frag in path_fragments:
        if os.path.isfile(frag):
            return frag
    
    # Unix-Pfade
    unix_fragments = re.findall(r'/[\w\-./]+\.\w+', error_message)
    for frag in unix_fragments:
        if os.path.isfile(frag):
            return frag
    
    return None


def extract_file_from_traceback(error_message: str) -> str | None:
    """Extrahiert den Pfad der fehlerhaften Datei aus einer Traceback-Meldung.
    Nutzt mehrstufige Erkennung: Python-Traceback → Fuzzy-Dateisuche → Hardcoded-Fallback.
    """
    # 1. Python-Traceback-Muster: File "C:\path\to\file.py", line 123
    pattern = r'File "([^"]+\.py)"'
    match = re.search(pattern, error_message)
    if match:
        return match.group(1)
    
    # 2. Intelligente Fuzzy-Suche über Schlüsselwörter und Dateinamen
    fuzzy_result = _fuzzy_find_file(error_message)
    if fuzzy_result:
        return fuzzy_result
    
    # 3. Letzter Fallback: hardcoded bekannte Dateien
    msg_lower = error_message.lower()
    if "agent.py" in msg_lower:
        return "backend/agent.py"
    if "tools.py" in msg_lower:
        return "backend/tools.py"
    return None

async def run_self_healing(context: Any, error_message: str, target_file: str = "") -> str:
    """Führt den kollaborativen Multi-Agenten-Fehlerbehebungs-Workflow aus."""
    await emit_healing_log(context, "thinking", "👁️ OBSERVE: Starte selbstheilenden Workflow...")
    
    # 1. Zieldatei ermitteln
    if not target_file:
        target_file = extract_file_from_traceback(error_message)
        
    if not target_file:
        await emit_healing_log(context, "error", 
            "Zieldatei konnte nicht automatisch bestimmt werden. "
            "Frage LLM nach der wahrscheinlichsten Datei...")
        
        # LLM-basierter Fallback: Frage die KI nach der Datei
        try:
            known_roots = "\n".join(_get_search_roots())
            llm_prompt = (
                f"Fehlermeldung:\n{error_message}\n\n"
                f"Bekannte Projektverzeichnisse:\n{known_roots}\n\n"
                "Welche einzelne Datei (vollständiger Pfad) ist am wahrscheinlichsten "
                "von diesem Fehler betroffen? Antworte NUR mit dem absoluten Dateipfad, "
                "nichts anderes. Wenn du dir unsicher bist, antworte mit 'UNKNOWN'."
            )
            llm_response = await call_chat_api(llm_prompt, "Du bist ein Fehleranalyst. Gib nur den Dateipfad aus.")
            candidate = llm_response.strip().strip('"').strip("'")
            if candidate and candidate != "UNKNOWN" and os.path.isfile(candidate):
                target_file = candidate
                await emit_healing_log(context, "thinking", f"LLM hat Zieldatei identifiziert: {os.path.basename(candidate)}")
            else:
                await emit_healing_log(context, "error", 
                    f"Selbstheilung abgebrochen: Zieldatei unbekannt. "
                    f"Tipp: Rufe 'trigger_self_healing_workflow' erneut auf mit dem Parameter target_file='pfad/zur/datei'.")
                return (
                    "Selbstheilung abgebrochen: Zieldatei konnte weder aus der Fehlermeldung noch via LLM bestimmt werden. "
                    "Nächster Schritt: Nutze 'execute_system_command' mit 'dir' oder 'Get-ChildItem' um den richtigen Pfad zu finden, "
                    "dann rufe 'trigger_self_healing_workflow' erneut mit dem korrekten target_file Parameter auf."
                )
        except Exception as llm_err:
            logger.warning(f"LLM-Dateifindung fehlgeschlagen: {llm_err}")
            await emit_healing_log(context, "error", 
                f"LLM-Fallback fehlgeschlagen: {llm_err}. "
                f"Nutze 'execute_system_command' + 'dir' um die Datei manuell zu finden.")
            return (
                "Selbstheilung abgebrochen: Zieldatei unbekannt und LLM-Fallback fehlgeschlagen. "
                "Nächster Schritt: Nutze 'execute_system_command' mit 'Get-ChildItem -Recurse -Filter *.py' "
                "um die betroffene Datei zu lokalisieren, dann rufe trigger_self_healing_workflow erneut auf."
            )
    
    # Pfad absolut auflösen
    if not os.path.isabs(target_file):
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        target_file = os.path.abspath(os.path.join(base_dir, target_file))
        
    # Sicherheitsprüfung
    from tools import _is_path_allowed_for_write
    if not _is_path_allowed_for_write(target_file):
        await emit_healing_log(context, "error", f"Fehler: Pfad '{target_file}' ist nicht schreibberechtigt.")
        return "Selbstheilung blockiert: Sicherheitsverletzung."
        
    if not os.path.exists(target_file):
        await emit_healing_log(context, "error", f"Fehler: Datei '{target_file}' existiert nicht.")
        return "Selbstheilung abgebrochen: Datei nicht gefunden."

    await emit_healing_log(context, "thinking", f"Ziel-Datei identifiziert: {os.path.basename(target_file)}")

    # 2. Datei einlesen
    try:
        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
            file_content = f.read()
    except Exception as e:
        await emit_healing_log(context, "error", f"Fehler beim Lesen der Datei: {e}")
        return f"Fehler beim Lesen der Datei: {e}"

    # 3. Diagnose-Agent (Elite-Diag)
    await emit_healing_log(context, "thinking", "🧠 THINK: Diagnose-Agent (Elite-Diag) analysiert den Fehler...")
    lang_label = _language_label_for_path(target_file)
    diag_system = (
        f"Du bist Elite-Diag, der Diagnose-Agent des Elite Desktop Agent Systems. Deine Aufgabe ist es, Fehler im "
        f"{lang_label}-Code zu analysieren und einen präzisen Code-Patch zu generieren. Gib NUR den Original-Code-Block "
        "(TARGET) und den Ersatz-Code-Block (REPLACE) aus. Halte dich exakt an das folgende Format und füge keine "
        "Erklärungen hinzu:\n\n"
        "=== TARGET ===\n[Der zu ersetzende Original-Code]\n=== REPLACE ===\n[Der neue korrigierte Code]\n==="
    )
    diag_prompt = (
        f"Fehlermeldung:\n{error_message}\n\n"
        f"Datei-Pfad: {target_file}\n\n"
        f"Datei-Inhalt:\n{file_content}\n\n"
        "Bitte erstelle den Patch."
    )
    
    try:
        diag_response = await call_chat_api(diag_prompt, diag_system)
        
        # Parsen der Antwort
        target_match = re.search(r'=== TARGET ===\s*(.*?)\s*=== REPLACE ===', diag_response, re.DOTALL)
        replace_match = re.search(r'=== REPLACE ===\s*(.*?)\s*===', diag_response, re.DOTALL)
        
        if not target_match or not replace_match:
            await emit_healing_log(context, "error", "Fehler: Ungültiges Ausgabeformat des Diagnose-Agenten.")
            return "Fehler beim Erstellen des Behebungsplans."
            
        orig_code = target_match.group(1)
        new_code = replace_match.group(1)
        
        await emit_healing_log(context, "thinking", "📋 PLAN: Diagnose-Agent hat einen Korrekturvorschlag erstellt.")
    except Exception as e:
        await emit_healing_log(context, "error", f"Diagnose fehlgeschlagen: {e}")
        return f"Fehler in der Diagnose-Phase: {e}"

    # 4. Code-Review-Agent (Elite-Auditor)
    await emit_healing_log(context, "warning", "👁️ AUDIT: Review-Agent (Elite-Auditor) prüft die Änderung...")
    auditor_system = (
        f"Du bist Elite-Auditor, der Code-Review-Agent. Prüfe {lang_label}-Patches auf Sicherheit, Korrektheit und "
        "Kompatibilität. REJECTED wenn: TARGET nicht eindeutig in der Datei, neuer Syntaxfehler wahrscheinlich, "
        "bare `except:` oder `except Exception: pass`, eval/exec, unsichere Pfade, entfernte Typannotationen ohne "
        "Grund, unbehandelte Promises/async, oder der Patch behebt den gemeldeten Fehler nicht. "
        "Antworte im Format:\n"
        "=== DECISION ===\n[APPROVED oder REJECTED]\n=== REASON ===\n[Deine Begründung auf Deutsch]"
    )
    auditor_prompt = (
        f"Datei: {target_file}\n"
        f"Fehlermeldung: {error_message}\n"
        f"Originaler Code-Ausschnitt:\n{orig_code}\n\n"
        f"Vorgeschlagener Code-Patch:\n{new_code}\n\n"
        "Entscheide, ob diese Korrektur sicher eingespielt werden kann."
    )
    
    try:
        audit_response = await call_chat_api(auditor_prompt, auditor_system)
        decision_match = re.search(r'=== DECISION ===\s*(APPROVED|REJECTED)', audit_response, re.IGNORECASE)
        reason_match = re.search(r'=== REASON ===\s*(.*)', audit_response, re.DOTALL)
        
        is_approved = decision_match and decision_match.group(1).upper() == "APPROVED"
        reason = reason_match.group(1).strip() if reason_match else "Keine Begründung angegeben."
        
        if not is_approved:
            await emit_healing_log(context, "error", f"REJECTED: Auditor hat die Änderung abgelehnt. Grund: {reason}")
            return f"Fehlerbehebung durch Auditor abgelehnt: {reason}"
            
        await emit_healing_log(context, "result", f"✅ APPROVED: Auditor hat die Änderung freigegeben. Begründung: {reason}")
    except Exception as e:
        await emit_healing_log(context, "error", f"Audit-Prüfung fehlgeschlagen: {e}")
        return f"Fehler in der Audit-Phase: {e}"

    # 5. Backup erstellen (AppData, Retry — ohne Backup kein Patch)
    backup_file, backup_err = create_healing_backup(target_file)
    if backup_err or not backup_file:
        await emit_healing_log(
            context,
            "error",
            f"Konnte kein Backup erstellen: {backup_err or 'unbekannter Fehler'}. Selbstheilung abgebrochen.",
        )
        return (
            "Backup-Erstellung fehlgeschlagen, Selbstheilung abgebrochen (keine Datei verändert). "
            f"Details: {backup_err or 'unbekannt'}"
        )
    logger.info("Backup erstellt unter %s", backup_file)
    await emit_healing_log(context, "thinking", f"Backup gesichert: {os.path.basename(backup_file)}")

    # 6. Patch einspielen (Elite-Executor)
    await emit_healing_log(context, "thinking", "🚀 EXECUTE: Executor-Agent (Elite-Executor) wendet den Patch an...")
    if orig_code not in file_content:
        # Falls Whitespace-Abweichungen vorliegen, versuchen wir es mit Strippen oder normalisieren
        orig_stripped = orig_code.strip()
        found = False
        if orig_stripped:
            # Einfache Zeilensuche versuchen
            lines = file_content.splitlines()
            orig_lines = orig_stripped.splitlines()
            # Finde die Zeilen im Code
            for i in range(len(lines) - len(orig_lines) + 1):
                chunk = "\n".join(l.strip() for l in lines[i:i+len(orig_lines)])
                match_chunk = "\n".join(l.strip() for l in orig_lines)
                if chunk == match_chunk:
                    # Direkte Ersetzung der Zeilen
                    lines[i:i+len(orig_lines)] = [new_code]
                    new_content = "\n".join(lines)
                    found = True
                    break
        
        if not found:
            await emit_healing_log(context, "error", "Fehler: Der zu ersetzende Code-Block wurde in der Original-Datei nicht exakt gefunden.")
            discard_healing_backup(backup_file)
            return "Fehler beim Patchen der Datei (Code-Block nicht gefunden)."
    else:
        new_content = file_content.replace(orig_code, new_code)

    # Schreiben (atomar)
    try:
        write_text_atomic(target_file, new_content)
    except OSError as e:
        await emit_healing_log(context, "error", f"Fehler beim Schreiben der Datei: {e}")
        ok, restore_err = restore_from_healing_backup(target_file, backup_file)
        if not ok:
            await emit_healing_log(context, "error", f"Wiederherstellung fehlgeschlagen: {restore_err}")
            return f"Schreibfehler und Wiederherstellung fehlgeschlagen: {e}; Backup: {backup_file}"
        discard_healing_backup(backup_file)
        return "Schreibfehler, Datei aus Backup wiederhergestellt."

    # 7. Verifizieren (Elite-Verifier)
    verify_hint = (
        "tsc --noEmit (TypeScript-Projekt)"
        if os.path.splitext(target_file)[1].lower() in {".ts", ".tsx"}
        else "Syntax/Integrität"
    )
    await emit_healing_log(context, "thinking", f"✅ VERIFY: Verifier prüft ({verify_hint})...")
    verified, verify_err = verify_patched_file(target_file)
    if verified:
        await emit_healing_log(
            context,
            "result",
            f"Erfolg: Verifikation von {os.path.basename(target_file)} war erfolgreich.",
        )
        discard_healing_backup(backup_file)
    else:
        await emit_healing_log(
            context,
            "error",
            f"Verifikation fehlgeschlagen: {verify_err or 'unbekannt'}",
        )
        await emit_healing_log(context, "warning", "Wiederherstellung: Spiele Backup-Datei wieder ein...")
        ok, restore_err = restore_from_healing_backup(target_file, backup_file)
        if not ok:
            await emit_healing_log(
                context,
                "error",
                f"KRITISCH: Wiederherstellung fehlgeschlagen — manuelles Backup: {backup_file}. {restore_err}",
            )
            return (
                f"Verifikation fehlgeschlagen ({verify_err}); Wiederherstellung fehlgeschlagen. "
                f"Backup unter: {backup_file}"
            )
        discard_healing_backup(backup_file)
        return f"Verifikation fehlgeschlagen, Datei wiederhergestellt: {verify_err}"

    # 8. Selbstlernen (Elite-Learner)
    await emit_healing_log(context, "result", "🎓 LEARN: Protokolliere Behebung im System-Gedächtnis...")
    try:
        # Im Langzeitgedächtnis notieren
        from tools import update_agent_memory
        memory_entry = f"Systemfehler selbstständig behoben in '{os.path.basename(target_file)}'. Fehler: {error_message[:100]}... Korrektur erfolgreich angewendet und verifiziert."
        await update_agent_memory(context, memory_entry, category="system")
    except Exception as learn_err:
        logger.warning(f"Could not update memory: {learn_err}")

    await emit_healing_log(context, "result", "🎉 Selbstheilung erfolgreich abgeschlossen!")
    return f"Erfolgreich repariert: {os.path.basename(target_file)} wurde korrigiert und verifiziert."
