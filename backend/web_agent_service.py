"""Autonomous web agent (Playwright + optional Gemini Computer Use)."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import tempfile
import time
from typing import Any

import aiohttp

from elite_settings import gemini_api_key, load_elite_settings, openai_api_key
from project_context import get_project_manager

logger = logging.getLogger("elite-web-agent")

_playwright = None
_browser = None
_page = None


async def _ensure_browser():
    global _playwright, _browser, _page
    if _page is not None:
        return _page
    try:
        from playwright.async_api import async_playwright
    except ImportError as e:
        raise RuntimeError("Playwright nicht installiert. pip install playwright && playwright install chromium") from e
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.launch(headless=True)
    _page = await _browser.new_page(viewport={"width": 1280, "height": 800})
    return _page


async def _screenshot_b64(page) -> str:
    png = await page.screenshot(type="png")
    return base64.b64encode(png).decode("ascii")


async def _gemini_computer_step(task: str, screenshot_b64: str, history: list[str]) -> dict:
    key = gemini_api_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY für Computer-Use nicht gesetzt.")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
    hist = "\n".join(history[-5:])
    prompt = (
        f"Aufgabe: {task}\nVerlauf:\n{hist}\n"
        "Analysiere den Screenshot. Antworte als JSON: "
        '{"action":"click"|"type"|"scroll"|"navigate"|"done","x":0,"y":0,"text":"","url":"","summary":""}'
    )
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/png", "data": screenshot_b64}},
            ],
        }],
        "generationConfig": {"temperature": 0.1},
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, timeout=60) as resp:
            data = await resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0]
    return json.loads(text)


async def _openai_step(task: str, screenshot_b64: str, url: str) -> dict:
    key = openai_api_key()
    if not key:
        return {"action": "done", "summary": f"Seite geladen: {url}. Kein OpenAI für weitere Schritte."}
    payload = {
        "model": os.environ.get("ELITE_WEB_AGENT_MODEL", "gpt-4.1-mini"),
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Aufgabe: {task}. URL: {url}. Nächster Schritt als JSON action/summary."},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}},
                ],
            }
        ],
        "max_tokens": 300,
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60,
        ) as resp:
            data = await resp.json()
            text = data["choices"][0]["message"]["content"]
    return {"action": "done", "summary": text[:500]}


async def run_web_task(task: str, start_url: str = "https://www.google.com", max_turns: int = 8) -> dict:
    settings = load_elite_settings()
    page = await _ensure_browser()
    history: list[str] = []
    turns: list[dict[str, Any]] = []

    await page.goto(start_url, wait_until="domcontentloaded", timeout=30000)
    pm = get_project_manager()

    for turn in range(max_turns):
        shot = await _screenshot_b64(page)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(base64.b64decode(shot))
            saved = pm.save_browser_screenshot(tmp.name, f"turn_{turn}")
        os.unlink(tmp.name)

        try:
            if gemini_api_key():
                step = await _gemini_computer_step(task, shot, history)
            else:
                step = await _openai_step(task, shot, page.url)
        except Exception as e:
            step = {"action": "done", "summary": str(e)}

        summary = step.get("summary", "")
        history.append(summary)
        turns.append({"turn": turn + 1, "url": page.url, "screenshot_b64": shot, "summary": summary})

        action = step.get("action", "done")
        if action == "navigate" and step.get("url"):
            await page.goto(step["url"], wait_until="domcontentloaded", timeout=30000)
        elif action == "click":
            x, y = int(step.get("x", 0)), int(step.get("y", 0))
            await page.mouse.click(x, y)
        elif action == "type" and step.get("text"):
            await page.keyboard.type(step["text"])
            await page.keyboard.press("Enter")
        elif action == "scroll":
            await page.mouse.wheel(0, 400)
        else:
            break
        await asyncio.sleep(0.8)

    if settings.get("mock_hardware"):
        turns.append({"turn": len(turns) + 1, "url": page.url, "summary": "Mock-Hardware-Modus aktiv.", "screenshot_b64": turns[-1]["screenshot_b64"] if turns else ""})

    return {"success": True, "turns": turns, "final_url": page.url}
