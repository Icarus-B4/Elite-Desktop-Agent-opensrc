"""3D printer integration (OrcaSlicer + Moonraker/OctoPrint, mock until hardware)."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path

import aiohttp

from elite_settings import load_elite_settings, save_elite_settings
from paths import get_writable_path

logger = logging.getLogger("elite-printer")

MOCK_PRINTERS = [
    {"name": "Mock Moonraker", "host": "192.168.1.100", "type": "moonraker", "mock": True},
    {"name": "Mock OctoPrint", "host": "192.168.1.101", "type": "octoprint", "mock": True},
]


def _orca_paths() -> list[str]:
    candidates = [
        r"C:\Program Files\OrcaSlicer\orca-slicer-console.exe",
        r"C:\Program Files\OrcaSlicer\OrcaSlicer.exe",
        shutil.which("orca-slicer") or "",
        shutil.which("OrcaSlicer") or "",
    ]
    return [p for p in candidates if p and os.path.exists(p)]


def discover_printers() -> list[dict]:
    settings = load_elite_settings()
    configured = list(settings.get("printers") or [])
    if settings.get("mock_hardware", True):
        seen = {p.get("host") for p in configured}
        for mock in MOCK_PRINTERS:
            if mock["host"] not in seen:
                configured.append(mock)
    return configured


def add_printer(name: str, host: str, printer_type: str = "moonraker") -> dict:
    settings = load_elite_settings()
    printers = list(settings.get("printers") or [])
    entry = {"name": name, "host": host, "type": printer_type, "mock": False}
    printers.append(entry)
    save_elite_settings({"printers": printers})
    return entry


async def slice_stl(stl_path: str, profile: str = "") -> dict:
    if not os.path.exists(stl_path):
        return {"success": False, "message": f"STL nicht gefunden: {stl_path}"}
    out_dir = Path(get_writable_path("slices"))
    out_dir.mkdir(parents=True, exist_ok=True)
    gcode = out_dir / (Path(stl_path).stem + ".gcode")

    orca = _orca_paths()
    if orca:
        cmd = [orca[0], "--slice", "0", "--export-gcode", str(gcode), stl_path]
        if profile:
            cmd.extend(["--load-settings", profile])
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if proc.returncode == 0 and gcode.exists():
                return {"success": True, "gcode_path": str(gcode), "message": "Slice abgeschlossen."}
            return {"success": False, "message": proc.stderr or proc.stdout or "Slice fehlgeschlagen."}
        except Exception as e:
            logger.warning("OrcaSlicer failed: %s", e)

    # Mock slice
    gcode.write_text(f"; Mock G-code for {stl_path}\nG28\nG1 Z0.2\n; end\n", encoding="utf-8")
    return {"success": True, "gcode_path": str(gcode), "message": "Mock-G-code erzeugt (OrcaSlicer nicht gefunden).", "mock": True}


async def start_print(gcode_path: str, printer_host: str = "") -> dict:
    settings = load_elite_settings()
    if settings.get("mock_hardware", True) and not printer_host:
        return {"success": True, "message": "Mock-Druck gestartet.", "mock": True}

    printers = discover_printers()
    target = next((p for p in printers if p.get("host") == printer_host), printers[0] if printers else None)
    if not target:
        return {"success": False, "message": "Kein Drucker konfiguriert."}
    if target.get("mock"):
        return {"success": True, "message": f"Mock-Druck auf {target['name']} gestartet.", "mock": True}

    ptype = target.get("type", "moonraker")
    host = target.get("host")
    try:
        async with aiohttp.ClientSession() as session:
            if ptype == "moonraker":
                url = f"http://{host}/server/files/upload"
                # Simplified – real upload needs multipart
                async with session.get(f"http://{host}/printer/info", timeout=5) as resp:
                    if resp.status == 200:
                        return {"success": True, "message": f"Moonraker {host} erreichbar. Upload manuell konfigurieren."}
            else:
                async with session.get(f"http://{host}/api/version", timeout=5) as resp:
                    if resp.status == 200:
                        return {"success": True, "message": f"OctoPrint {host} erreichbar."}
    except Exception as e:
        return {"success": False, "message": str(e)}
    return {"success": False, "message": "Drucker nicht erreichbar."}


async def get_print_status(printer_host: str = "") -> dict:
    printers = discover_printers()
    target = next((p for p in printers if p.get("host") == printer_host), printers[0] if printers else None)
    if not target:
        return {"state": "offline", "progress": 0, "message": "Kein Drucker"}
    if target.get("mock"):
        return {"state": "printing", "progress": 42, "message": "Mock-Druck läuft", "mock": True}
    return {"state": "unknown", "progress": 0, "message": f"Status für {target['name']} nicht abrufbar (Mock)."}
