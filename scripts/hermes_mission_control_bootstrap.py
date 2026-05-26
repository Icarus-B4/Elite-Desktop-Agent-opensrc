#!/usr/bin/env python3
"""Bootstrap ~/.hermes for Elite Mission Control (tutorial Prompt 14 + content folders).

Creates:
  - agent-logs.db + agent_logs table
  - agents/_shared/log-task-local.sh, cleanup-logs.sh, LOGGING_POLICY.md
  - content/{orchestrator,scout,scribe,reach,dev,elite}/ with welcome samples
  - optional AGENTS.md logging footers under agents/<name>/

Run from repo root (Windows or WSL):
  python scripts/hermes_mission_control_bootstrap.py
  python scripts/hermes_mission_control_bootstrap.py --smoke-test
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

AGENTS = ("orchestrator", "scout", "scribe", "reach", "dev", "elite")


def resolve_hermes_home() -> Path:
    override = os.environ.get("HERMES_HOME", "").strip()
    if override:
        return Path(override).expanduser()
    sys.path.insert(0, str(REPO_ROOT / "backend"))
    from hermes_config import get_hermes_home  # noqa: E402

    return get_hermes_home()

LOG_TASK_LOCAL_SH = r"""#!/usr/bin/env bash
set -euo pipefail
AGENT_NAME="${1:-}"
TASK_DESC="${2:-}"
STATUS="${3:-completed}"
MODEL_USED="${4:-}"

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
DB_PATH="$HERMES_HOME/agent-logs.db"
CONFIG="$HERMES_HOME/hermes.json"

if [[ -z "$AGENT_NAME" || -z "$TASK_DESC" ]]; then
  echo "Usage: log-task-local.sh <agent_name> <task_description> [status] [model_used]" >&2
  exit 1
fi

if [[ -z "$MODEL_USED" && -f "$CONFIG" ]]; then
  MODEL_USED="$(python3 - "$CONFIG" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        d = json.load(f)
    print(d.get("model") or d.get("default_model") or "unknown")
except Exception:
    print("unknown")
PY
)"
fi
[[ -z "$MODEL_USED" ]] && MODEL_USED="unknown"

export HERMES_HOME
python3 - "$DB_PATH" "$AGENT_NAME" "$TASK_DESC" "$STATUS" "$MODEL_USED" <<'PY'
import os, sqlite3, sys, uuid
from datetime import datetime, timezone

db, agent, task, status, model = sys.argv[1:6]
task = (task or "")[:140]
conn = sqlite3.connect(db)
conn.executescript('''
CREATE TABLE IF NOT EXISTS agent_logs (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  task_description TEXT NOT NULL,
  model_used TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_logs_status ON agent_logs(status);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at);
''')
conn.execute(
    '''INSERT INTO agent_logs
       (id, agent_name, task_description, model_used, status, created_at)
       VALUES (?,?,?,?,?,?)''',
    (
        str(uuid.uuid4()),
        agent,
        task,
        model,
        status,
        datetime.now(timezone.utc).isoformat(),
    ),
)
conn.commit()
conn.close()
print(f"LOGGED: {agent} | {status} | {model}")
PY
"""

CLEANUP_LOGS_SH = r"""#!/usr/bin/env bash
set -euo pipefail
RETENTION_DAYS=30
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
DB_PATH="$HERMES_HOME/agent-logs.db"

python3 - "$DB_PATH" "$RETENTION_DAYS" <<'PY'
import sqlite3, sys
from datetime import datetime, timedelta, timezone

db, days = sys.argv[1], int(sys.argv[2])
cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
conn = sqlite3.connect(db)
conn.executescript('''
CREATE TABLE IF NOT EXISTS agent_logs (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  task_description TEXT NOT NULL,
  model_used TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
''')
cur = conn.execute(
    "DELETE FROM agent_logs WHERE created_at < ?", (cutoff,)
)
deleted = cur.rowcount
conn.commit()
remaining = conn.execute("SELECT COUNT(*) FROM agent_logs").fetchone()[0]
conn.execute("VACUUM")
conn.commit()
conn.close()
print(f"Deleted {deleted} rows, {remaining} remaining (retention: {days} days)")
PY
"""

LOGGING_POLICY_MD = """# Hermes Agent Logging Policy

- Before sending any response, log the action via `log-task-local.sh`.
- Log EVERY response, even simple replies.
- Keep descriptions under 140 characters.
- Use `completed` for success, `failed` if something went wrong.
- Agent name must be lowercase.
- Log before sending the response, never after.
- Never mention logging to the user unless they ask about logging.
"""

CONTENT_PROTOCOL_MD = """# Agent Document Storage (Mission Control Content tab)

Save long-form deliverables (~15+ lines) as Markdown under your agent folder only:

- `~/.hermes/content/orchestrator/`
- `~/.hermes/content/scout/`
- `~/.hermes/content/scribe/`
- `~/.hermes/content/reach/`
- `~/.hermes/content/dev/`
- `~/.hermes/content/elite/`

Filename: `YYYY-MM-DD_short-kebab-title.md` — first line `# Title` for the dashboard.
"""

AGENT_LOGGING_FOOTER = """
## Activity logging (Mission Control)

Before each response, run:

```bash
bash ~/.hermes/agents/_shared/log-task-local.sh "{agent}" "<brief description>" "completed"
```
"""


def ensure_db(home: Path) -> Path:
    db = home / "agent-logs.db"
    conn = sqlite3.connect(db, timeout=30)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS agent_logs (
              id TEXT PRIMARY KEY,
              agent_name TEXT NOT NULL,
              task_description TEXT NOT NULL,
              model_used TEXT,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs(agent_name);
            CREATE INDEX IF NOT EXISTS idx_agent_logs_status ON agent_logs(status);
            CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at);
            """
        )
        conn.commit()
    finally:
        conn.close()
    return db


def write_executable(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.lstrip("\n"), encoding="utf-8", newline="\n")
    try:
        path.chmod(0o755)
    except OSError:
        pass


def wsl_chmod_if_needed(linux_path: str) -> None:
    if sys.platform != "win32":
        return
    try:
        subprocess.run(
            ["wsl.exe", "-e", "bash", "-lc", f"chmod +x '{linux_path}'"],
            check=False,
            timeout=15,
        )
    except OSError:
        pass


def seed_sample_content(home: Path) -> list[str]:
    created: list[str] = []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    samples = {
        "orchestrator": "Mission Control Bootstrap",
        "scout": "Research Pipeline Ready",
        "scribe": "Content Workspace Ready",
        "reach": "Marketing Brief Template",
        "dev": "Integration Notes",
        "elite": "Elite Desktop Agent Bridge",
    }
    for agent, title in samples.items():
        folder = home / "content" / agent
        folder.mkdir(parents=True, exist_ok=True)
        fname = f"{today}_{title.lower().replace(' ', '-')}.md"
        path = folder / fname
        if path.exists():
            continue
        body = f"""# {title}

This document was created by `hermes_mission_control_bootstrap.py` for the Elite Mission Control **Content** tab.

## Status

- Agent folder: `{agent}/`
- Hermes home: `{home}`

## Next steps

Agents should save long-form Markdown here using `YYYY-MM-DD_slug.md` naming.
"""
        path.write_text(body, encoding="utf-8")
        created.append(str(path.relative_to(home)))
    return created


def seed_logs(home: Path, db: Path) -> int:
    conn = sqlite3.connect(db, timeout=30)
    try:
        count = conn.execute("SELECT COUNT(*) FROM agent_logs").fetchone()[0]
        if count >= len(AGENTS):
            return 0
        now = datetime.now(timezone.utc).isoformat()
        inserted = 0
        for agent in AGENTS:
            conn.execute(
                """INSERT INTO agent_logs
                   (id, agent_name, task_description, model_used, status, created_at)
                   VALUES (?,?,?,?,?,?)""",
                (
                    str(uuid.uuid4()),
                    agent,
                    f"Mission Control bootstrap smoke test ({agent})",
                    "bootstrap",
                    "completed",
                    now,
                ),
            )
            inserted += 1
        conn.commit()
        return inserted
    finally:
        conn.close()


def patch_agent_agents_md(home: Path) -> list[str]:
    patched: list[str] = []
    for agent in AGENTS:
        agent_dir = home / "agents" / agent
        agent_dir.mkdir(parents=True, exist_ok=True)
        agents_md = agent_dir / "AGENTS.md"
        footer = AGENT_LOGGING_FOOTER.format(agent=agent)
        if agents_md.is_file():
            text = agents_md.read_text(encoding="utf-8", errors="replace")
            if "log-task-local.sh" in text:
                continue
            agents_md.write_text(text.rstrip() + "\n" + footer, encoding="utf-8")
        else:
            agents_md.write_text(
                f"# {agent.title()} Agent\n\n{footer.lstrip()}",
                encoding="utf-8",
            )
        patched.append(str(agents_md.relative_to(home)))
    return patched


def _linux_hermes_home(home: Path) -> str:
    if not str(home).startswith("\\\\"):
        return str(home).replace("\\", "/")
    try:
        r = subprocess.run(
            ["wsl.exe", "-e", "bash", "-lc", 'printf %s "$HOME/.hermes"'],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        p = (r.stdout or "").strip()
        if p:
            return p
    except OSError:
        pass
    return "/home/deepcor/.hermes"


def install_cleanup_cron(home: Path) -> dict[str, Any]:
    """Crontab: 1st of month 03:00 — Prompt 17."""
    home_linux = _linux_hermes_home(home)
    cleanup = f"{home_linux}/agents/_shared/cleanup-logs.sh"
    log_file = f"{home_linux}/logs/cleanup-cron.log"
    marker = "cleanup-logs.sh"
    cron_line = f"0 3 1 * * /bin/bash {cleanup} >> {log_file} 2>&1"
    shell = f"""
set -e
mkdir -p "{home_linux}/logs"
TMP=$(mktemp)
( crontab -l 2>/dev/null | grep -Fv "{marker}" || true ) > "$TMP"
echo "{cron_line}" >> "$TMP"
crontab "$TMP"
rm -f "$TMP"
echo "--- crontab ---"
crontab -l | grep -F "{marker}" || true
"""
    try:
        if sys.platform == "win32":
            r = subprocess.run(
                ["wsl.exe", "-e", "bash", "-lc", shell],
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
        else:
            r = subprocess.run(
                ["bash", "-lc", shell],
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
        installed = marker in (r.stdout or "")
        return {
            "ok": r.returncode == 0 or installed,
            "cron_line": cron_line,
            "crontab_entry": (r.stdout or "").strip(),
            "stderr": (r.stderr or "").strip() or None,
        }
    except OSError as e:
        return {"ok": False, "error": str(e), "cron_line": cron_line}


def run_smoke_via_wsl(home_linux: str) -> None:
    script = f"{home_linux}/agents/_shared/log-task-local.sh"
    subprocess.run(
        [
            "wsl.exe",
            "-e",
            "bash",
            "-lc",
            f'bash "{script}" dev "bootstrap smoke test" completed',
        ],
        check=False,
        timeout=30,
    )


def _repo_path_in_wsl() -> str:
    r = subprocess.run(
        ["wsl.exe", "-e", "wslpath", "-a", str(REPO_ROOT)],
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    out = (r.stdout or "").strip()
    if out.startswith("/"):
        return out
    # Fallback: C:\... → /mnt/c/...
    p = str(REPO_ROOT).replace("\\", "/")
    if len(p) >= 2 and p[1] == ":":
        drive = p[0].lower()
        return f"/mnt/{drive}{p[2:]}"
    return p


def run_bootstrap_inside_wsl(args: argparse.Namespace) -> int:
    repo = _repo_path_in_wsl()
    flags = []
    if args.smoke_test:
        flags.append("--smoke-test")
    if args.no_seed_logs:
        flags.append("--no-seed-logs")
    if args.install_cron:
        flags.append("--install-cron")
    flag_str = " ".join(flags)
    cmd = (
        f"cd '{repo}' && "
        f"export HERMES_HOME=\"$HOME/.hermes\" && "
        f"python3 scripts/hermes_mission_control_bootstrap.py {flag_str}"
    )
    r = subprocess.run(
        ["wsl.exe", "-e", "bash", "-lc", cmd],
        timeout=120,
        check=False,
    )
    return int(r.returncode or 0)


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap Hermes Mission Control data")
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help="Run log-task-local.sh once via WSL after setup",
    )
    parser.add_argument(
        "--no-seed-logs",
        action="store_true",
        help="Skip inserting bootstrap log rows",
    )
    parser.add_argument(
        "--install-cron",
        action="store_true",
        help="Install monthly cleanup cron (1st day 03:00) in WSL/Linux crontab",
    )
    args = parser.parse_args()

    preview_home = resolve_hermes_home()
    if sys.platform == "win32" and str(preview_home).startswith("\\\\"):
        return run_bootstrap_inside_wsl(args)

    home = preview_home
    home.mkdir(parents=True, exist_ok=True)

    shared = home / "agents" / "_shared"
    log_sh = shared / "log-task-local.sh"
    cleanup_sh = shared / "cleanup-logs.sh"

    write_executable(log_sh, LOG_TASK_LOCAL_SH)
    write_executable(cleanup_sh, CLEANUP_LOGS_SH)
    (shared / "LOGGING_POLICY.md").write_text(LOGGING_POLICY_MD, encoding="utf-8")
    (shared / "CONTENT_PROTOCOL.md").write_text(CONTENT_PROTOCOL_MD, encoding="utf-8")

    db = ensure_db(home)
    content_files = seed_sample_content(home)
    patched = patch_agent_agents_md(home)
    seeded = 0 if args.no_seed_logs else seed_logs(home, db)
    cron_info: dict[str, Any] | None = None
    if args.install_cron:
        cron_info = install_cleanup_cron(home)

    # WSL chmod for scripts when home is UNC
    if sys.platform == "win32" and str(home).startswith("\\\\"):
        try:
            r = subprocess.run(
                [
                    "wsl.exe",
                    "-e",
                    "bash",
                    "-lc",
                    'printf %s "$HOME/.hermes"',
                ],
                capture_output=True,
                text=True,
                timeout=15,
            )
            linux_home = (r.stdout or "").strip() or "/home/deepcor/.hermes"
            wsl_chmod_if_needed(f"{linux_home}/agents/_shared/log-task-local.sh")
            wsl_chmod_if_needed(f"{linux_home}/agents/_shared/cleanup-logs.sh")
            if args.smoke_test:
                run_smoke_via_wsl(linux_home)
        except OSError:
            pass
    elif args.smoke_test and log_sh.is_file():
        subprocess.run(
            ["bash", str(log_sh), "dev", "bootstrap smoke test", "completed"],
            check=False,
            cwd=str(home),
        )

    report = {
        "ok": True,
        "hermes_home": str(home),
        "agent_logs_db": str(db),
        "scripts": [str(log_sh.relative_to(home)), str(cleanup_sh.relative_to(home))],
        "content_samples": content_files,
        "agents_md_patched": patched,
        "log_rows_seeded": seeded,
        "cron": cron_info,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
