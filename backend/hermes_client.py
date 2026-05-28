"""HTTP client for Hermes Agent gateway (OpenAI-compatible API on :8642)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import aiohttp

from hermes_config import get_hermes_gateway_url, get_hermes_home, get_wsl_distro, should_use_wsl

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "hermes-agent"
_ENV_KEY_NAMES = ("HERMES_API_KEY", "API_SERVER_KEY")


def _shell_single_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_api_server_key() -> str | None:
    import os

    for name in _ENV_KEY_NAMES:
        val = os.environ.get(name, "").strip()
        if val:
            return val

    env_path = get_hermes_home() / ".env"
    if not env_path.is_file():
        return None
    try:
        raw = env_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        m = re.match(r"^(?:API_SERVER_KEY|HERMES_API_KEY)\s*=\s*(.+)$", line)
        if not m:
            continue
        value = m.group(1).strip().strip('"').strip("'")
        if value:
            return value
    return None


def _build_headers(session_id: str | None = None) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    key = load_api_server_key()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    if session_id and not re.search(r"[\r\n\x00]", session_id):
        headers["X-Hermes-Session-Id"] = session_id
    return headers


def extract_assistant_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        return "".join(parts).strip()
    return str(content or "").strip()


async def _probe_hermes_via_wsl(url: str, timeout_seconds: float) -> bool:
    if not should_use_wsl():
        return False
    distro = get_wsl_distro()
    timeout_sec = max(2, int(timeout_seconds))
    headers = _build_headers()
    header_flags = " ".join(
        f"-H {_shell_single_quote(f'{k}: {v}')}" for k, v in headers.items()
    )
    cmd = f"curl -s -o /dev/null -w '%{{http_code}}' --connect-timeout {timeout_sec} {header_flags} {_shell_single_quote(url)}"
    try:
        proc = await asyncio.create_subprocess_exec(
            "wsl.exe",
            "-d",
            distro,
            "-e",
            "bash",
            "-lc",
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds + 4)
        if proc.returncode == 0:
            status_code = stdout.decode("utf-8", errors="ignore").strip()
            try:
                code = int(status_code)
                return 200 <= code < 600
            except ValueError:
                return False
        return False
    except (asyncio.TimeoutError, OSError) as exc:
        logger.debug("Hermes WSL probe failed: %s", exc)
        return False


async def _hermes_chat_via_wsl(
    url: str,
    body: dict[str, Any],
    headers: dict[str, str],
    *,
    session_id: str | None,
    timeout_seconds: int,
) -> tuple[str, str | None]:
    distro = get_wsl_distro()
    header_flags = " ".join(
        f"-H {_shell_single_quote(f'{key}: {value}')}" for key, value in headers.items()
    )
    curl_cmd = (
        f"curl -sS -X POST {header_flags} -d @- {_shell_single_quote(url)} "
        f"-D {_shell_single_quote('/tmp/hermes-hdr')} "
        f"-w '\\n__STATUS__:%{{http_code}}' --connect-timeout {min(timeout_seconds, 120)}"
    )
    payload = json.dumps(body).encode("utf-8")
    proc = await asyncio.create_subprocess_exec(
        "wsl.exe",
        "-d",
        distro,
        "-e",
        "bash",
        "-lc",
        curl_cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(input=payload),
        timeout=timeout_seconds + 15,
    )
    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="ignore").strip()
        raise RuntimeError(err or f"Hermes WSL curl exit {proc.returncode}")

    raw_out = stdout.decode("utf-8", errors="ignore")
    status_match = re.search(r"\n__STATUS__:(\d+)$", raw_out)
    status = int(status_match.group(1)) if status_match else 502
    raw_body = raw_out[: status_match.start()] if status_match else raw_out

    if status >= 400:
        raise RuntimeError(f"Hermes HTTP {status}: {raw_body[:500]}")

    data = json.loads(raw_body or "{}")
    text = extract_assistant_text(data)
    new_session = session_id

    # Session-ID aus Response-Header (curl -D in WSL)
    hdr_proc = await asyncio.create_subprocess_exec(
        "wsl.exe",
        "-d",
        distro,
        "-e",
        "bash",
        "-lc",
        "grep -i '^x-hermes-session-id:' /tmp/hermes-hdr 2>/dev/null | tail -1",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    hdr_out, _ = await asyncio.wait_for(hdr_proc.communicate(), timeout=5)
    hdr_line = hdr_out.decode("utf-8", errors="ignore").strip()
    if hdr_line:
        _, _, sid = hdr_line.partition(":")
        sid = sid.strip()
        if sid:
            new_session = sid

    return text, new_session


async def hermes_chat(
    messages: list[dict[str, str]],
    *,
    session_id: str | None = None,
    timeout_seconds: int = 300,
    model: str | None = None,
) -> tuple[str, str | None]:
    """Send chat completion; returns (assistant_text, session_id)."""
    import os

    url = f"{get_hermes_gateway_url()}/v1/chat/completions"
    model_name = model or os.environ.get("HERMES_MODEL_NAME", _DEFAULT_MODEL)
    body = {
        "model": model_name,
        "messages": messages,
        "stream": False,
    }
    headers = _build_headers(session_id)
    timeout = aiohttp.ClientTimeout(total=timeout_seconds)

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=body, headers=headers, timeout=timeout) as resp:
                raw = await resp.text()
                if resp.status >= 400:
                    raise RuntimeError(f"Hermes HTTP {resp.status}: {raw[:500]}")
                data = json.loads(raw)
                text = extract_assistant_text(data)
                new_session = resp.headers.get("X-Hermes-Session-Id") or session_id
                return text, new_session
    except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as exc:
        if not should_use_wsl():
            raise
        logger.debug("Hermes direct HTTP failed (%s), trying WSL curl", exc)

    return await _hermes_chat_via_wsl(
        url,
        body,
        headers,
        session_id=session_id,
        timeout_seconds=timeout_seconds,
    )


async def probe_hermes_gateway(timeout_seconds: float = 2.0) -> bool:
    url = f"{get_hermes_gateway_url()}/v1/models"
    headers = _build_headers()
    try:
        timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=timeout) as resp:
                if 200 <= resp.status < 600:
                    return True
    except Exception:
        pass

    return await _probe_hermes_via_wsl(url, timeout_seconds)
