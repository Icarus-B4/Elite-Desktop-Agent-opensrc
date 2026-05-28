"""Parametric CAD via build123d (OpenAI default, Gemini optional)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import time
from pathlib import Path

import aiohttp

from elite_config import load_config, resolve_ollama_model
from elite_settings import gemini_api_key, openai_api_key
from project_context import get_project_manager

logger = logging.getLogger("elite-cad")

CAD_SYSTEM = (
    "Du schreibst Python-Code mit build123d. "
    "Exportiere am Ende mit export_stl(part, 'output.stl'). "
    "Antworte NUR mit ausführbarem Python-Code ohne Markdown."
)

SHAPE_ALIASES: dict[str, tuple[str, ...]] = {
    "heart": ("herz", "heart", "hertz"),
    "cube": ("würfel", "wuerfel", "cube", "wuerfeln", "wurfel"),
    "sphere": ("kugel", "sphere", "kugeln"),
    "cylinder": ("zylinder", "cylinder"),
}


def _cad_work_dir() -> Path:
    pm = get_project_manager()
    path = pm.get_current_project_path() / "cad"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _parse_size_mm(prompt: str, default: float = 25.0) -> float:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*mm", (prompt or "").lower())
    if match:
        return float(match.group(1).replace(",", "."))
    return default


def detect_builtin_shape(prompt: str) -> str | None:
    lower = (prompt or "").lower()
    for shape, aliases in SHAPE_ALIASES.items():
        for alias in aliases:
            if re.search(rf"\b{re.escape(alias)}\b", lower):
                return shape
    return None


def _write_cube_stl(output_path: Path, size_mm: float = 20.0) -> None:
    s = size_mm / 2.0
    vertices = [
        (-s, -s, -s), (s, -s, -s), (s, s, -s), (-s, s, -s),
        (-s, -s, s), (s, -s, s), (s, s, s), (-s, s, s),
    ]
    faces = [
        (0, 1, 2), (0, 2, 3), (4, 6, 5), (4, 7, 6),
        (0, 4, 5), (0, 5, 1), (2, 6, 7), (2, 7, 3),
        (0, 3, 7), (0, 7, 4), (1, 5, 6), (1, 6, 2),
    ]
    normals = [
        (0, 0, -1), (0, 0, -1), (0, 0, 1), (0, 0, 1),
        (0, -1, 0), (0, -1, 0), (0, 1, 0), (0, 1, 0),
        (-1, 0, 0), (-1, 0, 0), (1, 0, 0), (1, 0, 0),
    ]
    lines = ["solid demo_cube"]
    for tri, normal in zip(faces, normals):
        lines.append(f"  facet normal {normal[0]:.6f} {normal[1]:.6f} {normal[2]:.6f}")
        lines.append("    outer loop")
        for idx in tri:
            v = vertices[idx]
            lines.append(f"      vertex {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}")
        lines.append("    endloop")
        lines.append("  endfacet")
    lines.append("endsolid demo_cube")
    output_path.write_text("\n".join(lines), encoding="utf-8")


def _heart_build123d_script(size_mm: float) -> str:
    scale = size_mm / 30.0
    return f"""
from build123d import *
import math

scale = {scale}
size_mm = {size_mm}
n = 80
pts = []
for i in range(n):
    t = 2 * math.pi * i / n
    x = 16 * (math.sin(t) ** 3) * scale
    y = (13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)) * scale
    pts.append((x, y))

with BuildPart() as bp:
    with BuildSketch(Plane.XY) as sk:
        with BuildLine() as outline:
            Polyline(*pts, close=True)
        make_face()
    extrude(amount=size_mm * 0.35)
export_stl(bp.part, "output.stl")
"""


def _sphere_build123d_script(size_mm: float) -> str:
    radius = size_mm / 2.0
    return f"""
from build123d import *
with BuildPart() as bp:
    Sphere(radius={radius})
export_stl(bp.part, "output.stl")
"""


def _cylinder_build123d_script(size_mm: float) -> str:
    radius = size_mm / 2.0
    height = size_mm
    return f"""
from build123d import *
with BuildPart() as bp:
    Cylinder(radius={radius}, height={height})
export_stl(bp.part, "output.stl")
"""


def _cube_build123d_script(size_mm: float) -> str:
    return f"""
from build123d import *
with BuildPart() as bp:
    Box({size_mm}, {size_mm}, {size_mm})
export_stl(bp.part, "output.stl")
"""


def _builtin_script(shape: str, size_mm: float) -> str | None:
    if shape == "heart":
        return _heart_build123d_script(size_mm)
    if shape == "sphere":
        return _sphere_build123d_script(size_mm)
    if shape == "cylinder":
        return _cylinder_build123d_script(size_mm)
    if shape == "cube":
        return _cube_build123d_script(size_mm)
    return None


async def _generate_builtin_shape(shape: str, prompt: str, work_dir: Path, timestamp: int) -> dict:
    size_mm = _parse_size_mm(prompt, default=25.0 if shape != "heart" else 30.0)
    script = _builtin_script(shape, size_mm)
    if script:
        script_path = work_dir / f"builtin_{timestamp}_{shape}.py"
        script_path.write_text(script.strip() + "\n", encoding="utf-8")
        ok, msg, stl = _run_build123d_script(script_path, work_dir)
        if ok and stl:
            final = work_dir / f"{timestamp}_{shape}.stl"
            stl.replace(final)
            saved = get_project_manager().save_cad_artifact(str(final), prompt)
            labels = {"heart": "Herz", "cube": "Würfel", "sphere": "Kugel", "cylinder": "Zylinder"}
            return {
                "success": True,
                "stl_path": saved or str(final),
                "message": f"{labels.get(shape, shape)} ({size_mm:.0f} mm) als STL erzeugt.",
                "shape": shape,
            }
        logger.warning("build123d builtin %s failed: %s", shape, msg)

    if shape == "cube":
        fallback = work_dir / f"{timestamp}_cube.stl"
        _write_cube_stl(fallback, size_mm)
    else:
        fallback = work_dir / f"{timestamp}_{shape}.stl"
        _write_cube_stl(fallback, min(size_mm, 20.0))

    saved = get_project_manager().save_cad_artifact(str(fallback), prompt)
    return {
        "success": True,
        "stl_path": saved or str(fallback),
        "message": f"STL-Fallback für {shape} (build123d nicht verfügbar).",
        "shape": shape,
        "demo": True,
    }


async def _llm_cad_code_ollama(prompt: str, prior_code: str = "") -> str:
    model, base_url = resolve_ollama_model(load_config())
    root = base_url.rstrip("/").replace("/v1", "")
    user = prompt if not prior_code else f"{prompt}\n\nVorheriger Code:\n{prior_code}\n\nVerbessere den Code."
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": CAD_SYSTEM},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "options": {"temperature": 0.2},
    }
    timeout = aiohttp.ClientTimeout(total=120)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"{root}/api/chat", json=payload) as resp:
            body = await resp.text()
            if resp.status != 200:
                raise RuntimeError(f"Ollama CAD HTTP {resp.status}: {body[:300]}")
            data = json.loads(body)
            return str(data.get("message", {}).get("content", "") or "")


async def _llm_cad_code(prompt: str, prior_code: str = "") -> str:
    user = prompt if not prior_code else f"{prompt}\n\nVorheriger Code:\n{prior_code}\n\nVerbessere den Code."
    gemini = gemini_api_key()
    openai_key = openai_api_key()
    if gemini:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini}"
        payload = {
            "contents": [{"parts": [{"text": f"{CAD_SYSTEM}\n\n{user}"}]}],
            "generationConfig": {"temperature": 0.2},
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=90) as resp:
                data = await resp.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
    if openai_key:
        payload = {
            "model": os.environ.get("ELITE_CAD_MODEL", "gpt-4o-mini"),
            "messages": [
                {"role": "system", "content": CAD_SYSTEM},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=90,
            ) as resp:
                data = await resp.json()
                return data["choices"][0]["message"]["content"]
    return await _llm_cad_code_ollama(prompt, prior_code)


def _strip_code_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        lines = t.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines)
    return t


def _run_build123d_script(script_path: Path, work_dir: Path) -> tuple[bool, str, Path | None]:
    stl_path = work_dir / "output.stl"
    if stl_path.exists():
        stl_path.unlink()
    try:
        proc = subprocess.run(
            ["python", str(script_path)],
            cwd=str(work_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if proc.returncode != 0:
            return False, proc.stderr or proc.stdout or "CAD-Skript fehlgeschlagen.", None
        if stl_path.exists():
            return True, proc.stdout, stl_path
        return False, "Keine output.stl erzeugt.", None
    except subprocess.TimeoutExpired:
        return False, "CAD-Skript Timeout (120s).", None
    except Exception as e:
        return False, str(e), None


async def generate_cad(prompt: str, max_retries: int = 3) -> dict:
    work_dir = _cad_work_dir()
    timestamp = int(time.time())
    shape = detect_builtin_shape(prompt)
    if shape:
        builtin = await _generate_builtin_shape(shape, prompt, work_dir, timestamp)
        if builtin.get("success"):
            return builtin

    last_error = ""
    code = ""

    for attempt in range(max_retries):
        try:
            raw = await _llm_cad_code(prompt if attempt == 0 else f"{prompt}\nFix: {last_error}", code)
            code = _strip_code_fence(raw)
            script_path = work_dir / f"gen_{timestamp}_a{attempt}.py"
            script_path.write_text(code, encoding="utf-8")
            ok, msg, stl = _run_build123d_script(script_path, work_dir)
            if ok and stl:
                final = work_dir / f"{timestamp}_model.stl"
                stl.replace(final)
                saved = get_project_manager().save_cad_artifact(str(final), prompt)
                return {
                    "success": True,
                    "stl_path": saved or str(final),
                    "message": msg or "STL erzeugt.",
                    "attempt": attempt + 1,
                }
            last_error = msg
        except Exception as e:
            last_error = str(e)
            logger.warning("CAD attempt %s failed: %s", attempt + 1, e)

    fallback_shape = shape or "cube"
    fallback = await _generate_builtin_shape(fallback_shape, prompt, work_dir, timestamp)
    fallback["message"] = (
        f"{fallback.get('message', 'STL erzeugt.')} "
        f"(LLM/build123d: {last_error})"
    )
    fallback["demo"] = True
    return fallback


async def iterate_cad(prompt: str, iteration_note: str) -> dict:
    work_dir = _cad_work_dir()
    stls = sorted(work_dir.glob("*.stl"), key=lambda p: p.stat().st_mtime, reverse=True)
    prior = ""
    if stls:
        py_files = sorted(work_dir.glob("gen_*.py"), key=lambda p: p.stat().st_mtime, reverse=True)
        if py_files:
            prior = py_files[0].read_text(encoding="utf-8", errors="ignore")
    combined = f"{iteration_note}\nBezug auf letztes Modell: {stls[0].name if stls else 'keins'}"
    return await generate_cad(combined if not prior else f"{combined}\n\n{prior}")
