"""Deprecated shim — use hermes_config.py (Mission Control → Hermes Agent)."""

from hermes_config import get_mc_api, get_mc_url, get_hermes_dashboard_url, get_hermes_gateway_url

__all__ = [
    "get_mc_url",
    "get_mc_api",
    "get_hermes_gateway_url",
    "get_hermes_dashboard_url",
]
