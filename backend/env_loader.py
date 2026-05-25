"""Lädt Secrets aus AppData (MSIX) und Dev-Fallbacks."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

from paths import get_writable_path


def _backend_dir() -> Path:
    return Path(__file__).resolve().parent


def elite_env_paths() -> list[Path]:
    """Reihenfolge: AppData zuerst, dann gebündeltes backend/ (Dev)."""
    appdata_backend = Path(get_writable_path("backend"))
    bundled = _backend_dir()
    names = (".env", ".env.local")
    paths: list[Path] = []
    for base in (appdata_backend, bundled):
        for name in names:
            p = base / name
            if p.is_file():
                paths.append(p)
    return paths


def load_elite_dotenv() -> list[str]:
    """Dotenv laden; gibt geladene Dateipfade zurück."""
    loaded: list[str] = []
    for path in elite_env_paths():
        if load_dotenv(path, override=False):
            loaded.append(str(path))
    return loaded


def ensure_appdata_env_template() -> str | None:
    """
    Legt %LOCALAPPDATA%/EliteDesktopAgent/backend/.env.local an,
    wenn noch keine Datei existiert (Kopie aus Dev-Repo oder .env.example).
    """
    target = Path(get_writable_path("backend/.env.local"))
    if target.is_file():
        return str(target)

    target.parent.mkdir(parents=True, exist_ok=True)
    bundled = _backend_dir()
    for name in (".env.local", ".env", ".env.example"):
        src = bundled / name
        if src.is_file():
            try:
                import shutil

                shutil.copy2(src, target)
                return str(target)
            except OSError:
                pass
    return None
