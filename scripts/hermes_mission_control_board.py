#!/usr/bin/env python3
"""Personal operator task board for Elite Mission Control (separate from Hermes kanban.db)."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BOARD_DB = REPO_ROOT / ".mission-control" / "board.db"

SEED_TASKS = [
    ("Review Hermes gateway health", "pending", "high", "Check /api/hermes/overview and gateway log"),
    ("Sync PAI memory bridge", "pending", "medium", "yarn sync:hermes-pai when USER.md changes"),
    ("Test Elite voice trigger", "in_progress", "medium", "Say Elite — confirm LiveKit connects"),
    ("Update HERMES_INTEGRATION.md", "pending", "low", "Document new Mission Control route"),
    ("Verify dashboard port 9119", "done", "medium", "Official NousResearch UI, not workspace fork"),
    ("Mission Control theme QA", "in_progress", "high", "Glass UI at /hermes/mission-control"),
    ("Archive old JARVIS MC assets", "done", "low", "Abadoned/mission-control-jarvis-legacy"),
    ("Configure agent-logs.db", "pending", "low", "Optional tutorial logging for Agents tab"),
]


def _connect() -> sqlite3.Connection:
    BOARD_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(BOARD_DB)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'medium',
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
        """
    )
    return conn


def _seed_if_empty(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    if count > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    for title, status, priority, notes in SEED_TASKS:
        conn.execute(
            """
            INSERT INTO tasks (id, title, status, priority, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), title, status, priority, notes, now, now),
        )
    conn.commit()


def list_tasks() -> list[dict]:
    conn = _connect()
    try:
        _seed_if_empty(conn)
        rows = conn.execute(
            "SELECT * FROM tasks ORDER BY created_at ASC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def create_task(title: str, priority: str, notes: str) -> dict:
    conn = _connect()
    try:
        _seed_if_empty(conn)
        now = datetime.now(timezone.utc).isoformat()
        tid = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO tasks (id, title, status, priority, notes, created_at, updated_at)
            VALUES (?, ?, 'pending', ?, ?, ?, ?)
            """,
            (tid, title.strip(), priority, notes.strip(), now, now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def update_task(task_id: str, fields: dict) -> dict | None:
    allowed = {"title", "status", "priority", "notes"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        return None
    conn = _connect()
    try:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        sets = ", ".join(f"{k} = ?" for k in updates)
        vals = list(updates.values()) + [task_id]
        conn.execute(f"UPDATE tasks SET {sets} WHERE id = ?", vals)
        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_task(task_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list")

    create_p = sub.add_parser("create")
    create_p.add_argument("--title", required=True)
    create_p.add_argument("--priority", default="medium")
    create_p.add_argument("--notes", default="")

    upd_p = sub.add_parser("update")
    upd_p.add_argument("--id", required=True)
    upd_p.add_argument("--json", required=True, help="JSON object of fields")

    del_p = sub.add_parser("delete")
    del_p.add_argument("--id", required=True)

    args = parser.parse_args()
    if args.cmd == "list":
        print(json.dumps({"ok": True, "tasks": list_tasks()}, ensure_ascii=False))
    elif args.cmd == "create":
        task = create_task(args.title, args.priority, args.notes)
        print(json.dumps({"ok": True, "task": task}, ensure_ascii=False))
    elif args.cmd == "update":
        fields = json.loads(args.json)
        task = update_task(args.id, fields)
        print(json.dumps({"ok": bool(task), "task": task}, ensure_ascii=False))
    elif args.cmd == "delete":
        ok = delete_task(args.id)
        print(json.dumps({"ok": ok}, ensure_ascii=False))


if __name__ == "__main__":
    main()
