"""Project-scoped memory (ADA project_manager port for Elite)."""

from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path

from paths import get_writable_path

_manager: "ProjectContext | None" = None


class ProjectContext:
    def __init__(self, workspace_root: str | None = None):
        self.workspace_root = Path(workspace_root or get_writable_path("projects"))
        self.projects_dir = self.workspace_root
        self.current_project = "default"
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        if not (self.projects_dir / "default").exists():
            self.create_project("default")

    def create_project(self, name: str) -> tuple[bool, str]:
        safe = self._safe_name(name)
        project_path = self.projects_dir / safe
        if project_path.exists():
            return False, f"Projekt '{safe}' existiert bereits."
        project_path.mkdir(parents=True)
        (project_path / "cad").mkdir(exist_ok=True)
        (project_path / "browser").mkdir(exist_ok=True)
        return True, f"Projekt '{safe}' erstellt."

    def switch_project(self, name: str) -> tuple[bool, str]:
        safe = self._safe_name(name)
        project_path = self.projects_dir / safe
        if not project_path.exists():
            return False, f"Projekt '{safe}' existiert nicht."
        self.current_project = safe
        self._mirror_active_project_to_pai()
        return True, f"Zu Projekt '{safe}' gewechselt."

    def _mirror_active_project_to_pai(self) -> None:
        """Schreibt Projekt-Snippet für PAI WORK (task-scoped Memory)."""
        snippet = self.get_project_context(max_file_size=4000)
        local_path = get_writable_path(os.path.join("memory", "ACTIVE_PROJECT.md"))
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "w", encoding="utf-8") as f:
            f.write(f"# Elite Active Project: {self.current_project}\n\n{snippet}\n")

        user_home = os.path.expanduser("~")
        pai_roots = [
            os.environ.get("PAI_HOME", "").strip(),
            os.path.join(user_home, "PAI"),
            os.path.join(user_home, ".claude", "PAI"),
        ]
        for root in pai_roots:
            if not root or not os.path.isdir(root):
                continue
            work_file = os.path.join(root, "USER", "WORK", "CURRENT_WORK.md")
            try:
                os.makedirs(os.path.dirname(work_file), exist_ok=True)
                with open(work_file, "w", encoding="utf-8") as f:
                    f.write(
                        f"# Elite Active Project: {self.current_project}\n\n"
                        f"{snippet[:8000]}\n"
                    )
            except OSError:
                continue

    def list_projects(self) -> list[str]:
        return sorted(
            d.name for d in self.projects_dir.iterdir() if d.is_dir()
        )

    def get_current_project_path(self) -> Path:
        return self.projects_dir / self.current_project

    def log_chat(self, sender: str, text: str) -> None:
        log_file = self.get_current_project_path() / "chat_history.jsonl"
        entry = {"timestamp": time.time(), "sender": sender, "text": text}
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def save_cad_artifact(self, source_path: str, prompt: str) -> str | None:
        if not os.path.exists(source_path):
            return None
        timestamp = int(time.time())
        safe_prompt = "".join(c for c in prompt if c.isalnum() or c in (" ", "-", "_"))[:30]
        safe_prompt = safe_prompt.strip().replace(" ", "_") or "model"
        filename = f"{timestamp}_{safe_prompt}.stl"
        dest = self.get_current_project_path() / "cad" / filename
        try:
            shutil.copy2(source_path, dest)
            return str(dest)
        except OSError:
            return None

    def save_browser_screenshot(self, source_path: str, label: str = "capture") -> str | None:
        if not os.path.exists(source_path):
            return None
        dest = self.get_current_project_path() / "browser" / f"{int(time.time())}_{label}.png"
        try:
            shutil.copy2(source_path, dest)
            return str(dest)
        except OSError:
            return None

    def get_project_context(self, max_file_size: int = 10000) -> str:
        project_path = self.get_current_project_path()
        if not project_path.exists():
            return f"Projekt '{self.current_project}' existiert nicht."
        lines = [
            f"=== Projekt: {self.current_project} ===",
            f"Pfad: {project_path}",
            "",
        ]
        files: list[str] = []
        for root, _, names in os.walk(project_path):
            for name in names:
                rel = os.path.relpath(os.path.join(root, name), project_path)
                files.append(rel.replace("\\", "/"))
        if not files:
            lines.append("(Noch keine Dateien)")
        else:
            lines.append(f"Dateien ({len(files)}):")
            for rel in sorted(files):
                lines.append(f" - {rel}")
        text_ext = {".txt", ".py", ".json", ".md", ".jsonl", ".js", ".ts", ".tsx"}
        for rel in files:
            if os.path.splitext(rel)[1].lower() not in text_ext:
                continue
            full = project_path / rel
            try:
                if full.stat().st_size > max_file_size:
                    continue
                content = full.read_text(encoding="utf-8", errors="ignore")
                lines.extend(["", f"--- {rel} ---", content])
            except OSError:
                continue
        return "\n".join(lines)

    def get_recent_chat_history(self, limit: int = 10) -> list[dict]:
        log_file = self.get_current_project_path() / "chat_history.jsonl"
        if not log_file.exists():
            return []
        try:
            lines = log_file.read_text(encoding="utf-8").splitlines()
            out: list[dict] = []
            for line in lines[-limit:]:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
            return out
        except OSError:
            return []

    @staticmethod
    def _safe_name(name: str) -> str:
        return "".join(c for c in name if c.isalnum() or c in (" ", "-", "_")).strip() or "default"


def get_project_manager() -> ProjectContext:
    global _manager
    if _manager is None:
        _manager = ProjectContext()
    return _manager
