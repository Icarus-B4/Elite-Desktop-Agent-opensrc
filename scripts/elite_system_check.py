#!/usr/bin/env python3
"""Elite Desktop Agent — System-Diagnose & Setup."""
from __future__ import annotations

import argparse
import json
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

GREEN, RED, YELLOW, CYAN, RESET, BOLD = "\033[92m", "\033[91m", "\033[93m", "\033[96m", "\033[0m", "\033[1m"
CHECK, CROSS, WARN, INFO = f"{GREEN}OK{RESET}", f"{RED}FAIL{RESET}", f"{YELLOW}WARN{RESET}", f"{CYAN}INFO{RESET}"

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))


def check_url(url, timeout=5):
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return True, f"HTTP {resp.status}"
    except Exception as e:
        return False, str(e)[:100]


def check_port(port, timeout=3):
    try:
        s = socket.create_connection(("127.0.0.1", port), timeout=timeout)
        s.close()
        return True
    except OSError:
        return False


def check_openai():
    try:
        from elite_config import probe_openai_api

        ok, reason = probe_openai_api()
        if ok:
            return True, "API erreichbar"
        return False, reason
    except Exception as e:
        return False, str(e)[:80]


def check_llm_stack():
    try:
        from elite_config import validate_llm_stack

        ok, mode, msg, fallback = validate_llm_stack()
        if ok:
            return True, f"Stack bereit (effective={mode})"
        detail = msg or fallback or "unbekannt"
        return False, detail[:120]
    except Exception as e:
        return False, str(e)[:80]


def check_ollama():
    if not check_port(11434):
        return False, "Ollama nicht erreichbar (Port 11434)"
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/version", timeout=3) as resp:
            data = json.loads(resp.read())
            version = data.get("version", "?")
    except Exception:
        version = "?"
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=5) as resp:
            data = json.loads(resp.read())
            models = [m.get("name", "?") for m in data.get("models", [])]
    except Exception:
        models = []
    v1_ok = False
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/v1/models", timeout=5) as resp:
            v1_ok = resp.status == 200
    except Exception:
        pass
    issues = []
    if version != "?" and version < "0.3.0":
        issues.append(f"VERALTET (v{version} → Update nötig)")
    if not models:
        issues.append("Keine Modelle")
    if not v1_ok:
        issues.append("/v1 API fehlt (kein Tool-Calling)")
    if issues:
        return False, "; ".join(issues)
    return True, f"v{version}, {len(models)} Modelle, /v1 OK"


def check_hermes():
    ok, detail = check_url("http://127.0.0.1:8642/v1/models")
    if ok:
        return True, f"Erreichbar ({detail})"
    return False, f"Nicht erreichbar: {detail}"


def check_hud():
    ok, _ = check_url("http://127.0.0.1:3000", timeout=3)
    return ok, "Erreichbar" if ok else "NICHT erreichbar → START_JARVIS.bat ausführen"


def check_pulse():
    ok, _ = check_url("http://127.0.0.1:31337/api/pulse/health", timeout=3)
    return ok, "Erreichbar" if ok else "Nicht erreichbar"


def check_dashboard():
    ok, _ = check_url("http://127.0.0.1:9119", timeout=3)
    return ok, "Erreichbar" if ok else "Nicht erreichbar"


def check_agent_timeout():
    agent_py = BACKEND_DIR / "agent.py"
    if not agent_py.is_file():
        return False, "agent.py fehlt"
    content = agent_py.read_text(encoding="utf-8")
    if "gated-reply-timeout" in content:
        return True, "Timeout-Fix AKTIV (45s)"
    return False, "Timeout-Fix FEHLT"


def run_checks():
    return [
        ("llm_stack", "LLM-Stack (Cloud/Ollama)", check_llm_stack),
        ("openai", "OpenAI API", check_openai),
        ("ollama", "Ollama (Lokale KI)", check_ollama),
        ("hermes", "Hermes Gateway :8642", check_hermes),
        ("dashboard", "Hermes Dashboard :9119", check_dashboard),
        ("hud", "Elite HUD :3000", check_hud),
        ("pulse", "PAI Pulse :31337", check_pulse),
        ("agent_timeout", "agent.py Timeout-Fix", check_agent_timeout),
    ]


def main():
    parser = argparse.ArgumentParser(description="Elite Desktop Agent System-Diagnose")
    parser.add_argument("--json", action="store_true", help="JSON-Ausgabe")
    args = parser.parse_args()

    checks = run_checks()
    results = []
    passed = 0
    critical_fail = False

    for key, label, fn in checks:
        ok, detail = fn()
        if ok:
            passed += 1
        if key in ("llm_stack", "hud") and not ok:
            critical_fail = True
        results.append({"id": key, "label": label, "ok": ok, "detail": detail})

    if args.json:
        payload = {
            "passed": passed,
            "total": len(checks),
            "critical_fail": critical_fail,
            "checks": results,
        }
        print(json.dumps(payload, ensure_ascii=True, indent=2))
        sys.exit(1 if critical_fail else 0)

    print(f"\n{BOLD}{CYAN}=== ELITE DESKTOP AGENT — SYSTEM-DIAGNOSE ==={RESET}\n")
    for item in results:
        icon = CHECK if item["ok"] else CROSS
        print(f"  {icon} {item['label']:<24}: {item['detail']}")
    print(f"\n{BOLD}── Ergebnis: {passed}/{len(checks)} Checks bestanden ──{RESET}")
    if passed < len(checks):
        print(f"\n{BOLD}AKTION NÖTIG:{RESET}")
        llm = next((c for c in results if c["id"] == "llm_stack"), None)
        if llm and not llm["ok"]:
            print(f"  • {RED}{llm['detail']}{RESET}")
        if not next((c for c in results if c["id"] == "hud" and c["ok"]), False):
            print("  • HUD starten: START_JARVIS.bat (Windows)")
        print("  • Dann: python scripts/elite_system_check.py")

    sys.exit(1 if critical_fail else 0)


if __name__ == "__main__":
    main()
