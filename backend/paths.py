"""Writable paths for Elite Desktop Agent (MSIX / AppData compatible)."""
import os
import shutil


def get_writable_path(rel_path: str) -> str:
    """Returns a writable path under LOCALAPPDATA/EliteDesktopAgent (or dev fallback)."""
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    if not base:
        return os.path.abspath(os.path.join(os.path.dirname(__file__), rel_path))

    full_path = os.path.join(base, "EliteDesktopAgent", rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    return full_path


def get_screenshots_dir() -> str:
    """Directory for vision snapshots and gallery.json."""
    screenshots_dir = get_writable_path("screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)
    return screenshots_dir


def get_memory_file() -> str:
    """Langzeitgedächtnis (MEMORY.md) – immer unter %LOCALAPPDATA%\\EliteDesktopAgent."""
    memory_path = get_writable_path(os.path.join("memory", "MEMORY.md"))
    os.makedirs(os.path.dirname(memory_path), exist_ok=True)

    if not os.path.exists(memory_path):
        repo_memory = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "agents", "elite-agent", "MEMORY.md")
        )
        if os.path.exists(repo_memory):
            try:
                shutil.copy2(repo_memory, memory_path)
            except OSError:
                pass
        if not os.path.exists(memory_path):
            with open(memory_path, "w", encoding="utf-8") as f:
                f.write("# Elite Agent Memory\n\n")

    return memory_path


def get_data_dir(name: str) -> str:
    """Writable subfolder under AppData (leads, summaries, …)."""
    directory = get_writable_path(name)
    os.makedirs(directory, exist_ok=True)
    return directory
