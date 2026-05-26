#!/usr/bin/env python3
"""Read agent_logs from ~/.hermes/agent-logs.db (stdout JSON). Used from WSL when Windows cannot open UNC SQLite."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path


def read_logs(limit: int = 50) -> list[dict]:
    db = Path.home() / ".hermes" / "agent-logs.db"
    if not db.is_file():
        return []
    conn = sqlite3.connect(db, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT id, agent_name, task_description, status, model_used, created_at
            FROM agent_logs
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            out.append(
                {
                    "id": d.get("id"),
                    "agent": d.get("agent_name") or "orchestrator",
                    "task": d.get("task_description") or "",
                    "status": d.get("status") or "completed",
                    "model": d.get("model_used") or "—",
                    "created_at": d.get("created_at"),
                }
            )
        return out
    except sqlite3.Error:
        return []
    finally:
        conn.close()


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(read_logs(limit), ensure_ascii=False))


if __name__ == "__main__":
    main()
