"""ADA-style capability settings persisted under AppData."""

from __future__ import annotations

import json
import os
from copy import deepcopy

from paths import get_writable_path

DEFAULT_ELITE_SETTINGS: dict = {
    "face_auth_enabled": False,
    "camera_flipped": False,
    "cad_output_dir": "",
    "mock_hardware": True,
    "clap_sensitivity": 3,
    "tool_permissions": {
        "generate_cad_prototype": False,
        "iterate_cad_prototype": False,
        "run_web_agent": True,
        "slice_stl": True,
        "start_print": True,
        "kasa_control": True,
        "write_file": True,
    },
    "printers": [],
    "kasa_devices": [],
}


def settings_path() -> str:
    return get_writable_path("settings.json")


def load_elite_settings() -> dict:
    path = settings_path()
    merged = deepcopy(DEFAULT_ELITE_SETTINGS)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            for key, value in loaded.items():
                if key == "tool_permissions" and isinstance(value, dict):
                    merged["tool_permissions"].update(value)
                else:
                    merged[key] = value
        except Exception:
            pass
    if not merged.get("cad_output_dir"):
        merged["cad_output_dir"] = get_writable_path("projects")
    return merged


def save_elite_settings(updates: dict) -> dict:
    current = load_elite_settings()
    for key, value in updates.items():
        if key == "tool_permissions" and isinstance(value, dict):
            current["tool_permissions"].update(value)
        else:
            current[key] = value
    path = settings_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2, ensure_ascii=False)
    return current


def gemini_api_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "").strip()


def openai_api_key() -> str:
    return os.environ.get("OPENAI_API_KEY", "").strip()
