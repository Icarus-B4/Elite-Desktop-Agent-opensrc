#!/usr/bin/env python3
"""Read-only Mission Control snapshot for Elite HUD (Komputer Mechanic style dashboard)."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from hermes_config import (  # noqa: E402
    get_hermes_gateway_log_path,
    get_hermes_home,
    get_hermes_runtime_info,
    get_hermes_state_db,
)

AGENT_DEFS = [
    {
        "id": "orchestrator",
        "code": "ORCH",
        "name": "Hermes",
        "role": "Gateway orchestrator · multi-platform coordination",
        "platform": "Gateway",
        "color": "#A78BFA",
    },
    {
        "id": "elite",
        "code": "ELIT",
        "name": "Elite",
        "role": "Desktop voice agent · HUD & system automation",
        "platform": "LiveKit",
        "color": "#7DD3FC",
    },
    {
        "id": "scout",
        "code": "SCNT",
        "name": "Scout",
        "role": "Research · trends · verified sources",
        "platform": "Discord",
        "color": "#7DD3FC",
    },
    {
        "id": "scribe",
        "code": "SCRB",
        "name": "Scribe",
        "role": "Writing · SEO content · newsletters",
        "platform": "Discord",
        "color": "#F472B6",
    },
    {
        "id": "reach",
        "code": "RECH",
        "name": "Reach",
        "role": "Marketing · growth · campaigns",
        "platform": "Discord",
        "color": "#E879F9",
    },
    {
        "id": "dev",
        "code": "DEV",
        "name": "Dev",
        "role": "Full-stack · integrations · automation",
        "platform": "Discord",
        "color": "#A78BFA",
    },
]


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except (json.JSONDecodeError, OSError):
        return None


def _db_size_mb(home: Path) -> float:
    total = 0
    for p in home.glob("*.db"):
        try:
            total += p.stat().st_size
        except OSError:
            pass
    return round(total / (1024 * 1024), 2)


def gateway_data(home: Path) -> dict[str, Any]:
    raw = _read_json(home / "gateway_state.json") or {}
    start = raw.get("start_time")
    uptime_seconds = None
    if isinstance(start, (int, float)) and start > 0:
        uptime_seconds = max(0, int(time.time() - float(start)))
    platforms = raw.get("platforms") or {}
    connected = sum(
        1
        for p in platforms.values()
        if isinstance(p, dict) and p.get("state") == "connected"
    )
    return {
        "state": raw.get("gateway_state") or "unknown",
        "pid": raw.get("pid"),
        "active_agents": raw.get("active_agents", 0),
        "platforms": platforms,
        "platforms_connected": connected,
        "uptime_seconds": uptime_seconds,
        "updated_at": raw.get("updated_at"),
    }


def _parse_log_ts(line: str) -> float | None:
    m = re.match(r"^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})", line)
    if m:
        try:
            s = m.group(1).replace(" ", "T")
            return datetime.fromisoformat(s).replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            pass
    return None


def _infer_agent(line: str) -> str:
    lower = line.lower()
    for aid in ("scout", "scribe", "reach", "dev", "elite", "hermes", "orchestrator"):
        if aid in lower:
            return "elite" if aid == "elite" else (
                "orchestrator" if aid in ("hermes", "orchestrator") else aid
            )
    return "orchestrator"


def activity_from_logs(home: Path, limit: int = 50) -> list[dict[str, Any]]:
    log_path = get_hermes_gateway_log_path()
    if not log_path.is_file():
        return []
    try:
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-limit:]
    except OSError:
        return []
    out: list[dict[str, Any]] = []
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        ts = _parse_log_ts(line) or time.time() - (len(lines) - i)
        agent = _infer_agent(line)
        task = line.strip()[:240]
        status = "failed" if re.search(r"\b(error|fatal|failed)\b", line, re.I) else "completed"
        out.append(
            {
                "id": f"log-{i}",
                "agent": agent,
                "task": task,
                "status": status,
                "model": "gateway",
                "created_at": ts,
            }
        )
    return out[-limit:]


def _is_wsl_unc_home(home: Path) -> bool:
    return sys.platform == "win32" and str(home).startswith("\\\\")


def _activity_from_agent_db_wsl(limit: int) -> list[dict[str, Any]]:
    repo = Path(__file__).resolve().parent
    reader = repo / "hermes_read_agent_logs.py"
    wsl_repo = repo.as_posix()
    if sys.platform == "win32":
        try:
            r = subprocess.run(
                ["wsl.exe", "-e", "wslpath", "-a", str(repo.parent)],
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
            p = (r.stdout or "").strip()
            if p.startswith("/"):
                wsl_repo = f"{p}/scripts"
        except OSError:
            pass
    cmd = f"python3 '{wsl_repo}/hermes_read_agent_logs.py' {limit}"
    try:
        r = subprocess.run(
            ["wsl.exe", "-e", "bash", "-lc", cmd],
            capture_output=True,
            text=True,
            timeout=25,
            check=False,
        )
        if r.returncode != 0:
            return []
        return json.loads((r.stdout or "").strip() or "[]")
    except (OSError, json.JSONDecodeError):
        return []


def activity_from_agent_db(home: Path, limit: int = 50) -> list[dict[str, Any]]:
    db = home / "agent-logs.db"
    if not db.is_file():
        return []
    if _is_wsl_unc_home(home):
        rows = _activity_from_agent_db_wsl(limit)
        if rows:
            return rows
    try:
        conn = sqlite3.connect(str(db), timeout=10)
    except sqlite3.Error:
        return []
    conn.row_factory = sqlite3.Row
    try:
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "agent_logs" not in tables:
            return []
        rows = conn.execute(
            """
            SELECT * FROM agent_logs
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        normalized: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            normalized.append(
                {
                    "id": d.get("id"),
                    "agent": d.get("agent_name") or d.get("agent") or "orchestrator",
                    "task": d.get("task_description") or d.get("task") or "",
                    "status": d.get("status") or "completed",
                    "model": d.get("model_used") or d.get("model") or "—",
                    "created_at": d.get("created_at"),
                }
            )
        return normalized
    except sqlite3.Error:
        return _activity_from_agent_db_wsl(limit) if _is_wsl_unc_home(home) else []
    finally:
        conn.close()


def sessions_data() -> dict[str, Any]:
    db_path = get_hermes_state_db()
    if not db_path.is_file():
        return {"count": 0, "totals": {}, "recent": []}
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        count = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        totals = conn.execute(
            """
            SELECT
              COALESCE(SUM(message_count), 0) AS messages,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens
            FROM sessions
            """
        ).fetchone()
        recent = conn.execute(
            """
            SELECT id, title, model, started_at, message_count, input_tokens, output_tokens
            FROM sessions
            ORDER BY started_at DESC
            LIMIT 25
            """
        ).fetchall()
        return {
            "count": int(count),
            "totals": {
                "messages": int(totals["messages"] or 0),
                "input_tokens": int(totals["input_tokens"] or 0),
                "output_tokens": int(totals["output_tokens"] or 0),
                "cache_read_tokens": int(totals["cache_read_tokens"] or 0),
            },
            "recent": [dict(r) for r in recent],
        }
    except sqlite3.Error:
        return {"count": 0, "totals": {}, "recent": []}
    finally:
        conn.close()


def kanban_data(home: Path) -> dict[str, Any]:
    db = home / "kanban.db"
    if not db.is_file():
        return {"total": 0, "by_status": {}}
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        total = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        rows = conn.execute(
            "SELECT status, COUNT(*) FROM tasks GROUP BY status"
        ).fetchall()
        return {"total": int(total), "by_status": {r[0]: r[1] for r in rows}}
    except sqlite3.Error:
        return {"total": 0, "by_status": {}}
    finally:
        conn.close()


def vps_health(home: Path) -> dict[str, Any]:
    """Host metrics — works on Linux/WSL; coarse fallback elsewhere."""
    out: dict[str, Any] = {
        "cpu_pct": None,
        "mem_pct": None,
        "mem_used_mb": None,
        "mem_total_mb": None,
        "disk_pct": None,
        "disk_used_gb": None,
        "disk_total_gb": None,
        "db_size_mb": _db_size_mb(home),
    }
    if sys.platform == "win32":
        try:
            import psutil  # type: ignore

            out["cpu_pct"] = round(psutil.cpu_percent(interval=0.2), 1)
            mem = psutil.virtual_memory()
            out["mem_pct"] = round(mem.percent, 1)
            out["mem_used_mb"] = round(mem.used / (1024 * 1024))
            out["mem_total_mb"] = round(mem.total / (1024 * 1024))
            disk = psutil.disk_usage(str(home.drive if hasattr(home, "drive") and home.drive else "C:\\"))
            out["disk_pct"] = round(disk.percent, 1)
            out["disk_used_gb"] = round(disk.used / (1024**3), 1)
            out["disk_total_gb"] = round(disk.total / (1024**3), 1)
        except Exception:
            pass
        return out

    try:
        with open("/proc/stat") as f:
            parts = f.readline().split()[1:]
            idle1 = int(parts[3])
            total1 = sum(int(x) for x in parts)
        time.sleep(0.15)
        with open("/proc/stat") as f:
            parts = f.readline().split()[1:]
            idle2 = int(parts[3])
            total2 = sum(int(x) for x in parts)
        dt = max(1, total2 - total1)
        out["cpu_pct"] = round(100 * (1 - (idle2 - idle1) / dt), 1)
    except OSError:
        pass

    try:
        mem: dict[str, int] = {}
        with open("/proc/meminfo") as f:
            for line in f:
                k, _, v = line.partition(":")
                mem[k.strip()] = int(v.strip().split()[0])
        total = mem.get("MemTotal", 0)
        avail = mem.get("MemAvailable", mem.get("MemFree", 0))
        used = max(0, total - avail)
        if total:
            out["mem_pct"] = round(100 * used / total, 1)
            out["mem_used_mb"] = round(used / 1024)
            out["mem_total_mb"] = round(total / 1024)
    except OSError:
        pass

    try:
        st = os.statvfs(str(home))
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        used = total - free
        if total:
            out["disk_pct"] = round(100 * used / total, 1)
            out["disk_used_gb"] = round(used / (1024**3), 1)
            out["disk_total_gb"] = round(total / (1024**3), 1)
    except OSError:
        pass

    return out


def cron_jobs() -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    hermes_home = str(get_hermes_home()).replace("\\", "/")
    cron_dir = Path(hermes_home) / "cron" if Path(hermes_home).exists() else None
    if cron_dir and cron_dir.is_dir():
        for p in sorted(cron_dir.glob("*.json"))[:20]:
            raw = _read_json(p)
            if not raw:
                continue
            jobs.append(
                {
                    "source": str(p),
                    "schedule": raw.get("schedule") or raw.get("cron") or "—",
                    "command": raw.get("name") or p.stem,
                    "owner": "hermes",
                    "description": raw.get("description") or "Hermes scheduled job",
                }
            )
    return jobs


def list_content(home: Path) -> list[dict[str, Any]]:
    root = home / "content"
    if not root.is_dir():
        return []
    docs: list[dict[str, Any]] = []
    for agent_dir in sorted(root.iterdir()):
        if not agent_dir.is_dir():
            continue
        for md in sorted(agent_dir.glob("*.md")):
            try:
                text = md.read_text(encoding="utf-8", errors="replace")
                title = md.stem
                for line in text.splitlines()[:12]:
                    if line.startswith("# "):
                        title = line[2:].strip()
                        break
                st = md.stat()
                docs.append(
                    {
                        "agent": agent_dir.name,
                        "filename": md.name,
                        "path": f"{agent_dir.name}/{md.name}",
                        "title": title,
                        "modified_at": st.st_mtime,
                        "size": st.st_size,
                    }
                )
            except OSError:
                continue
    return docs


def build_agent_stats(
    activity: list[dict[str, Any]], activity_by_day: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    now = time.time()
    counts: dict[str, int] = defaultdict(int)
    failed = 0
    completed = 0
    last_seen: dict[str, float] = {}
    last_task: dict[str, str] = {}

    for row in activity:
        aid = str(row.get("agent") or "orchestrator").lower()
        counts[aid] += 1
        ts = row.get("created_at")
        if isinstance(ts, (int, float)):
            last_seen[aid] = max(last_seen.get(aid, 0), float(ts))
        status = str(row.get("status") or "").lower()
        if status == "failed":
            failed += 1
        else:
            completed += 1
        if row.get("task"):
            last_task[aid] = str(row["task"])[:200]

    total_responses = sum(counts.values()) or 1
    agents_out: list[dict[str, Any]] = []

    for spec in AGENT_DEFS:
        aid = spec["id"]
        responses = counts.get(aid, 0)
        share = responses / total_responses if total_responses else 0
        seen = last_seen.get(aid)
        if seen and now - seen < 600:
            status = "active"
        elif seen and now - seen < 21600:
            status = "idle"
        else:
            status = "dormant"
        day_counts = []
        for day in activity_by_day:
            agents_map = day.get("agents") or {}
            day_counts.append(int(agents_map.get(aid, 0)))

        agents_out.append(
            {
                **spec,
                "responses": responses,
                "failed": 0,
                "success_pct": 100 if responses == 0 else 100,
                "model": "—",
                "status": status,
                "last_seen": seen,
                "last_task": last_task.get(aid, "—"),
                "load_share": round(share * 100, 1),
                "activity_7d": day_counts,
            }
        )

    stats = {
        "total": completed + failed,
        "completed": completed,
        "failed": failed,
        "integrity_pct": round(100 * completed / max(1, completed + failed), 2),
    }
    return agents_out, stats


def activity_by_day(activity: list[dict[str, Any]], days: int = 7) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for row in activity:
        ts = row.get("created_at")
        if not isinstance(ts, (int, float)):
            continue
        day = datetime.fromtimestamp(float(ts), tz=timezone.utc).strftime("%Y-%m-%d")
        if day not in buckets:
            buckets[day] = {"date": day, "total": 0, "agents": defaultdict(int)}
        buckets[day]["total"] += 1
        buckets[day]["agents"][str(row.get("agent") or "orchestrator")] += 1

    ordered = sorted(buckets.keys())[-days:]
    out = []
    for day in ordered:
        b = buckets[day]
        out.append(
            {
                "date": day,
                "total": b["total"],
                "agents": dict(b["agents"]),
            }
        )
    while len(out) < days:
        out.insert(0, {"date": "", "total": 0, "agents": {}})
    return out[-days:]


def build_snapshot() -> dict[str, Any]:
    home = get_hermes_home()
    activity = activity_from_agent_db(home)
    if not activity:
        activity = activity_from_logs(home)
    activity_by_day = activity_by_day_list(activity)
    agents, stats = build_agent_stats(activity, activity_by_day)

    return {
        "ok": True,
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "runtime": get_hermes_runtime_info(),
        "hermes_home": str(home),
        "gateway": gateway_data(home),
        "activity": activity,
        "activity_by_day": activity_by_day,
        "agents": agents,
        "stats": stats,
        "sessions": sessions_data(),
        "kanban": kanban_data(home),
        "vps": vps_health(home),
        "crons": cron_jobs(),
        "content_index": list_content(home),
        "warnings": [],
    }


def activity_by_day_list(activity: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return activity_by_day(activity)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(build_snapshot(), ensure_ascii=False))


if __name__ == "__main__":
    main()
