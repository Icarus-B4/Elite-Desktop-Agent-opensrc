"""TP-Link Kasa smart home (python-kasa, mock until hardware)."""

from __future__ import annotations

import asyncio
import logging

from elite_settings import load_elite_settings, save_elite_settings

logger = logging.getLogger("elite-kasa")

MOCK_DEVICES = [
    {"alias": "Wohnzimmer Lampe", "host": "192.168.1.50", "model": "Mock-Kasa", "mock": True},
    {"alias": "Schreibtisch", "host": "192.168.1.51", "model": "Mock-Kasa-Dimmer", "mock": True},
]


async def discover_devices(timeout: int = 3) -> list[dict]:
    settings = load_elite_settings()
    configured = list(settings.get("kasa_devices") or [])

    try:
        from kasa import Discover

        found = await Discover.discover(timeout=timeout)
        for ip, dev in found.items():
            await dev.update()
            configured.append({
                "alias": dev.alias or ip,
                "host": ip,
                "model": dev.model or "kasa",
                "mock": False,
            })
    except ImportError:
        logger.info("python-kasa nicht installiert – Mock-Geräte")
    except Exception as e:
        logger.warning("Kasa discovery failed: %s", e)

    if settings.get("mock_hardware", True):
        seen = {d.get("host") for d in configured}
        for mock in MOCK_DEVICES:
            if mock["host"] not in seen:
                configured.append(mock)

    save_elite_settings({"kasa_devices": configured})
    return configured


def get_kasa_devices() -> list[dict]:
    """Gibt die bereits konfigurierten Kasa-Geräte zurück, ohne das Netzwerk zu scannen (Deutsch)."""
    settings = load_elite_settings()
    configured = list(settings.get("kasa_devices") or [])

    if settings.get("mock_hardware", True):
        seen = {d.get("host") for d in configured}
        for mock in MOCK_DEVICES:
            if mock["host"] not in seen:
                configured.append(mock)

    return configured



async def control_device(
    host: str,
    action: str,
    brightness: int | None = None,
    color_temp: int | None = None,
) -> dict:
    settings = load_elite_settings()
    devices = settings.get("kasa_devices") or []
    target = next((d for d in devices if d.get("host") == host or d.get("alias") == host), None)

    if target and target.get("mock"):
        return {"success": True, "message": f"Mock: {action} auf {target.get('alias')}", "mock": True}

    try:
        from kasa import Discover

        dev = await Discover.discover_single(host, timeout=5)
        await dev.update()
        if action == "on":
            await dev.turn_on()
        elif action == "off":
            await dev.turn_off()
        elif action == "toggle":
            await dev.turn_off() if dev.is_on else await dev.turn_on()
        if brightness is not None and hasattr(dev, "set_brightness"):
            await dev.set_brightness(brightness)
        return {"success": True, "message": f"{action} auf {dev.alias} ausgeführt."}
    except ImportError:
        return {"success": True, "message": f"Mock {action} (python-kasa fehlt).", "mock": True}
    except Exception as e:
        if settings.get("mock_hardware"):
            return {"success": True, "message": f"Mock-Fallback: {action} – {e}", "mock": True}
        return {"success": False, "message": str(e)}
