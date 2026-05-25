"""ADA v2 capability tools for Elite LiveKit agent."""

from __future__ import annotations

import json
import os

from livekit.agents import RunContext, function_tool

from face_auth_service import get_auth_status, is_authenticated, is_face_auth_enabled
from project_context import get_project_manager
from tool_permissions import publish_ada_event, require_tool_confirmation


async def _ensure_face_auth(context: RunContext) -> str | None:
    if not is_face_auth_enabled():
        return None
    if is_authenticated():
        return None
    status = get_auth_status()
    await publish_ada_event(context, "face_auth_required", status)
    return "Face Auth erforderlich. Bitte im Auth-Lock bestätigen."


async def _emit(context: RunContext, kind: str, message: str) -> None:
    from tools import emit_log

    await emit_log(context, kind, message)


@function_tool()
async def create_project(context: RunContext, name: str) -> str:
    """Erstellt ein neues Elite-Projekt mit CAD/Browser/Chat-Ordnern."""
    if err := await _ensure_face_auth(context):
        return err
    pm = get_project_manager()
    ok, msg = pm.create_project(name)
    if ok:
        await _emit(context, "result", msg)
    return msg


@function_tool()
async def switch_project(context: RunContext, name: str) -> str:
    """Wechselt das aktive Projekt für CAD, Browser-Artefakte und Chat-Historie."""
    if err := await _ensure_face_auth(context):
        return err
    pm = get_project_manager()
    ok, msg = pm.switch_project(name)
    if ok:
        ctx = pm.get_project_context(max_file_size=4000)
        await publish_ada_event(context, "project_switched", {"name": pm.current_project})
        await _emit(context, "result", msg)
        return f"{msg}\n\n{ctx[:3000]}"
    return msg


@function_tool()
async def list_projects(context: RunContext) -> str:
    """Listet alle Elite-Projekte auf."""
    pm = get_project_manager()
    projects = pm.list_projects()
    current = pm.current_project
    lines = [f"Aktiv: {current}", f"Projekte ({len(projects)}):"]
    lines.extend(f" - {p}" for p in projects)
    return "\n".join(lines)


@function_tool()
async def get_project_context(context: RunContext) -> str:
    """Liefert Datei- und Chat-Kontext des aktiven Projekts für die KI."""
    pm = get_project_manager()
    return pm.get_project_context()


@function_tool()
async def generate_cad_prototype(context: RunContext, prompt: str) -> str:
    """Erzeugt ein parametrisches 3D-Modell (build123d) als STL für das aktive Projekt."""
    if err := await _ensure_face_auth(context):
        return err
    if not await require_tool_confirmation(context, "generate_cad_prototype", prompt):
        return "CAD-Erstellung vom Nutzer abgelehnt."
    from cad_service import generate_cad

    await _emit(context, "tool_call", f"CAD: {prompt[:80]}...")
    result = await generate_cad(prompt)
    stl = result.get("stl_path", "")
    await publish_ada_event(
        context,
        "cad_update",
        {"stl_path": stl, "prompt": prompt, "demo": result.get("demo", False)},
    )
    await publish_ada_event(context, "widget_control", {"action": "open", "widgetId": "cad"})
    get_project_manager().log_chat("assistant", f"CAD: {prompt} -> {stl}")
    return result.get("message", "Fertig") + (f" STL: {stl}" if stl else "")


@function_tool()
async def iterate_cad_prototype(context: RunContext, iteration_note: str) -> str:
    """Iteriert das letzte CAD-Modell im aktiven Projekt."""
    if err := await _ensure_face_auth(context):
        return err
    if not await require_tool_confirmation(context, "iterate_cad_prototype", iteration_note):
        return "CAD-Iteration abgelehnt."
    from cad_service import iterate_cad

    await _emit(context, "tool_call", f"CAD Iteration: {iteration_note[:80]}...")
    result = await iterate_cad("", iteration_note)
    stl = result.get("stl_path", "")
    await publish_ada_event(context, "cad_update", {"stl_path": stl, "prompt": iteration_note})
    return result.get("message", "Fertig") + (f" STL: {stl}" if stl else "")


@function_tool()
async def discover_printers(context: RunContext) -> str:
    """Findet konfigurierte und Mock-3D-Drucker."""
    from printer_service import discover_printers as _discover

    printers = _discover()
    await publish_ada_event(context, "widget_control", {"action": "open", "widgetId": "printer"})
    if not printers:
        return "Keine Drucker gefunden. Konfiguriere einen in den Einstellungen."
    lines = ["Drucker:"]
    for p in printers:
        lines.append(f" - {p.get('name')} ({p.get('host')}) mock={p.get('mock', False)}")
    return "\n".join(lines)


@function_tool()
async def slice_stl(context: RunContext, stl_path: str = "") -> str:
    """Sliced eine STL-Datei zu G-code (OrcaSlicer oder Mock)."""
    if not await require_tool_confirmation(context, "slice_stl", stl_path or "letztes STL"):
        return "Slice abgelehnt."
    from printer_service import slice_stl as _slice

    if not stl_path:
        pm = get_project_manager()
        cad_dir = pm.get_current_project_path() / "cad"
        stls = sorted(cad_dir.glob("*.stl"), key=lambda p: p.stat().st_mtime, reverse=True) if cad_dir.exists() else []
        if not stls:
            return "Keine STL im Projekt. Erst generate_cad_prototype nutzen."
        stl_path = str(stls[0])
    result = await _slice(stl_path)
    await publish_ada_event(context, "printer_update", result)
    return result.get("message", str(result))


@function_tool()
async def start_print(context: RunContext, printer_host: str = "", gcode_path: str = "") -> str:
    """Startet einen Druck auf Moonraker/OctoPrint (Mock bis Hardware da)."""
    if not await require_tool_confirmation(context, "start_print", printer_host or "Standard-Drucker"):
        return "Druckstart abgelehnt."
    from printer_service import start_print as _start

    result = await _start(gcode_path, printer_host)
    await publish_ada_event(context, "printer_update", result)
    return result.get("message", str(result))


@function_tool()
async def get_print_status(context: RunContext, printer_host: str = "") -> str:
    """Fragt Druckstatus ab."""
    from printer_service import get_print_status as _status

    result = await _status(printer_host)
    await publish_ada_event(context, "printer_update", result)
    return json.dumps(result, ensure_ascii=False)


@function_tool()
async def run_web_agent(context: RunContext, task: str, start_url: str = "https://www.google.com") -> str:
    """Autonomer Browser-Agent für mehrstufige Web-Aufgaben (Playwright + Gemini/OpenAI Vision)."""
    if err := await _ensure_face_auth(context):
        return err
    if not await require_tool_confirmation(context, "run_web_agent", task):
        return "Web-Agent abgelehnt."
    from web_agent_service import run_web_task

    await _emit(context, "tool_call", f"Web-Agent: {task[:80]}...")
    await publish_ada_event(context, "widget_control", {"action": "open", "widgetId": "browserAgent"})
    result = await run_web_task(task, start_url)
    for turn in result.get("turns", []):
        await publish_ada_event(context, "web_agent_turn", turn)
    summary = result.get("turns", [{}])[-1].get("summary", "Fertig") if result.get("turns") else "Fertig"
    get_project_manager().log_chat("assistant", f"Web-Agent: {task} -> {summary}")
    return f"Web-Agent fertig: {summary} (URL: {result.get('final_url')})"


@function_tool()
async def kasa_discover(context: RunContext) -> str:
    """Entdeckt TP-Link Kasa Smart-Home-Geräte (Mock bis Hardware da)."""
    from kasa_service import discover_devices

    devices = await discover_devices()
    await publish_ada_event(context, "widget_control", {"action": "open", "widgetId": "kasa"})
    if not devices:
        return "Keine Kasa-Geräte gefunden."
    lines = ["Kasa-Geräte:"]
    for d in devices:
        lines.append(f" - {d.get('alias')} @ {d.get('host')} mock={d.get('mock', False)}")
    return "\n".join(lines)


@function_tool()
async def kasa_control(
    context: RunContext,
    device: str,
    action: str,
    brightness: int = 0,
) -> str:
    """Steuert ein Kasa-Gerät (on/off/toggle, optional Helligkeit 0-100)."""
    if not await require_tool_confirmation(context, "kasa_control", f"{action} @ {device}"):
        return "Kasa-Befehl abgelehnt."
    from kasa_service import control_device

    bright = brightness if brightness > 0 else None
    result = await control_device(device, action, brightness=bright)
    await publish_ada_event(context, "kasa_update", result)
    return result.get("message", str(result))


@function_tool()
async def enroll_face_reference(context: RunContext) -> str:
    """Fordert im HUD die Aufnahme eines Referenzfotos für Face Auth an."""
    await publish_ada_event(context, "face_auth_enroll", {})
    await publish_ada_event(context, "widget_control", {"action": "open", "widgetId": "authLock"})
    return "Bitte Referenzfoto im Auth-Lock aufnehmen."


ADA_TOOLS = [
    create_project,
    switch_project,
    list_projects,
    get_project_context,
    generate_cad_prototype,
    iterate_cad_prototype,
    discover_printers,
    slice_stl,
    start_print,
    get_print_status,
    run_web_agent,
    kasa_discover,
    kasa_control,
    enroll_face_reference,
]
