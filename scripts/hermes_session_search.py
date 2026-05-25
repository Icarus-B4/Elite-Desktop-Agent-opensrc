#!/usr/bin/env python3
"""FTS5 session search against Hermes state.db — JSON stdout for HUD / PAI bridge."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from hermes_config import get_hermes_state_db  # noqa: E402


def search_sessions(query: str, limit: int = 20) -> dict:
    db_path = get_hermes_state_db()
    if not db_path.is_file():
        return {
            "ok": False,
            "error": "state_db_missing",
            "path": str(db_path),
            "results": [],
        }

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        # Hermes FTS virtual table naming may vary by version
        fts_candidates = [
            t
            for t in tables
            if "fts" in t.lower() or t in ("messages_fts", "session_messages_fts")
        ]
        if not fts_candidates and "messages" in tables:
            like = f"%{query}%"
            rows = conn.execute(
                """
                SELECT session_id, role, content, created_at
                FROM messages
                WHERE content LIKE ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (like, limit),
            ).fetchall()
            results = [dict(r) for r in rows]
            return {"ok": True, "mode": "like_fallback", "results": results}

        fts_table = fts_candidates[0] if fts_candidates else None
        if not fts_table:
            return {"ok": False, "error": "no_fts_table", "tables": sorted(tables), "results": []}

        rows = conn.execute(
            f"""
            SELECT session_id, role, content, created_at
            FROM {fts_table}
            WHERE {fts_table} MATCH ?
            LIMIT ?
            """,
            (query, limit),
        ).fetchall()
        return {"ok": True, "mode": "fts", "fts_table": fts_table, "results": [dict(r) for r in rows]}
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc), "results": []}
    finally:
        conn.close()


def session_stats() -> dict:
    db_path = get_hermes_state_db()
    if not db_path.is_file():
        return {"ok": False, "sessionCount": None, "path": str(db_path)}
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "sessions" in tables:
            count = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        elif "conversations" in tables:
            count = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        else:
            count = None
        return {"ok": True, "sessionCount": count, "tables": sorted(tables)}
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc), "sessionCount": None}
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Hermes FTS5 session search")
    parser.add_argument("query", nargs="?", default="", help="Search query")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--stats", action="store_true", help="Return session DB stats only")
    args = parser.parse_args()
    if args.stats:
        print(json.dumps(session_stats(), ensure_ascii=False))
        return
    if not args.query:
        print(json.dumps({"ok": False, "error": "missing_query", "results": []}))
        return
    print(json.dumps(search_sessions(args.query, args.limit), ensure_ascii=False))


if __name__ == "__main__":
    main()
