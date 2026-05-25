"""Hermes Agent URL resolution (gateway API 8642, dashboard 9119)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

_BACKEND = Path(__file__).resolve().parent
load_dotenv(_BACKEND / ".env")
load_dotenv(_BACKEND / ".env.local")

_DEFAULT_GATEWAY = "http://127.0.0.1:8642"
_DEFAULT_DASHBOARD = "http://127.0.0.1:9119"


def _hermes_runtime_mode() -> str:
    return os.environ.get("ELITE_HERMES_MODE", "auto").strip().lower()


def _wsl_available() -> bool:
    if sys.platform != "win32":
        return False
    try:
        r = subprocess.run(
            ["wsl.exe", "--status"],
            capture_output=True,
            timeout=8,
            check=False,
        )
        return r.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _should_use_wsl() -> bool:
    if sys.platform != "win32":
        return False
    mode = _hermes_runtime_mode()
    if mode == "native":
        return False
    if mode == "wsl":
        return _wsl_available()
    return _wsl_available()


def _wsl_distro() -> str:
    explicit = os.environ.get("HERMES_WSL_DISTRO", "").strip()
    if explicit:
        return explicit
    try:
        r = subprocess.run(
            ["wsl.exe", "-l", "-q"],
            capture_output=True,
            timeout=8,
            check=False,
        )
        raw = r.stdout.decode("utf-16-le", errors="ignore")
        for line in raw.splitlines():
            name = line.strip().replace("\x00", "")
            if name and not name.lower().startswith("windows"):
                return name
    except (OSError, subprocess.TimeoutExpired):
        pass
    return "Ubuntu"


def _linux_path_to_wsl_unc(distro: str, linux_path: str) -> Path:
    rel = linux_path.lstrip("/").replace("/", "\\")
    for prefix in (rf"\\wsl.localhost\{distro}", rf"\\wsl$\{distro}"):
        candidate = Path(f"{prefix}\\{rel}")
        if candidate.exists():
            return candidate
    return Path(rf"\\wsl.localhost\{distro}\{rel}")


def _resolve_wsl_hermes_home() -> Path | None:
    distro = _wsl_distro()
    try:
        r = subprocess.run(
            [
                "wsl.exe",
                "-d",
                distro,
                "-e",
                "bash",
                "-lc",
                'printf %s "$HOME/.hermes"',
            ],
            capture_output=True,
            timeout=15,
            check=False,
        )
        linux_path = r.stdout.decode("utf-8", errors="ignore").strip()
        if r.returncode != 0 or not linux_path:
            return None
        return _linux_path_to_wsl_unc(distro, linux_path)
    except (OSError, subprocess.TimeoutExpired):
        return None


def get_hermes_home() -> Path:
    override = os.environ.get("HERMES_HOME", "").strip()
    if override:
        return Path(override).expanduser()
    if _should_use_wsl():
        wsl_home = _resolve_wsl_hermes_home()
        if wsl_home is not None:
            return wsl_home
    local = os.environ.get("LOCALAPPDATA", "")
    if local and sys.platform == "win32":
        return Path(local) / "hermes"
    return Path.home() / ".hermes"


def get_hermes_gateway_url() -> str:
    return os.environ.get("HERMES_GATEWAY_URL", _DEFAULT_GATEWAY).rstrip("/")


def get_hermes_dashboard_url() -> str:
    return os.environ.get("HERMES_DASHBOARD_URL", _DEFAULT_DASHBOARD).rstrip("/")


def get_hermes_state_db() -> Path:
    return get_hermes_home() / "state.db"


def get_hermes_gateway_log_path() -> Path:
    home = get_hermes_home()
    for candidate in (home / "logs" / "gateway.log", home / "gateway.log"):
        if candidate.is_file():
            return candidate
    return home / "logs" / "gateway.log"


def get_hermes_runtime_info() -> dict[str, str | bool | None]:
    active = "wsl" if _should_use_wsl() else ("native" if sys.platform == "win32" else "linux")
    return {
        "mode": _hermes_runtime_mode(),
        "active": active,
        "wslAvailable": _wsl_available(),
        "distro": _wsl_distro() if active == "wsl" else None,
        "home": str(get_hermes_home()),
    }


def should_use_wsl() -> bool:
    """True when Hermes runs in WSL2 (Windows localhost :8642 often unreachable)."""
    return _should_use_wsl()


def get_wsl_distro() -> str:
    return _wsl_distro()


# Backward compatibility for legacy imports (mc_config → Hermes gateway health)
def get_mc_url() -> str:
    return get_hermes_gateway_url()


def get_mc_api() -> str:
    explicit = os.environ.get("MC_API_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    return f"{get_hermes_gateway_url()}/v1"
