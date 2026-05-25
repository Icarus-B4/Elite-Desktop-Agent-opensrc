import os
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger("livekit-agent")

@dataclass
class Skill:
    name: str
    description: str
    file_path: str
    base_dir: str
    disable_model_invocation: bool = False

def parse_skill_frontmatter(content: str) -> Dict[str, Any]:
    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}

    frontmatter: Dict[str, Any] = {}
    for index in range(1, len(lines)):
        line = lines[index]
        if line.strip() == "---":
            break
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value.lower() in {"true", "false"}:
            frontmatter[key] = value.lower() == "true"
        else:
            frontmatter[key] = value

    return frontmatter

def discover_skill_files(root_dir: str) -> List[str]:
    files: List[str] = []
    if not os.path.exists(root_dir):
        return files

    def _walk(path: str, root_level: bool) -> None:
        try:
            entries = list(os.scandir(path))
        except OSError:
            return

        for entry in entries:
            if entry.name.startswith(".") or entry.name == "node_modules":
                continue
            entry_path = entry.path
            try:
                if entry.is_dir(follow_symlinks=False):
                    _walk(entry_path, root_level=False)
                elif entry.is_file(follow_symlinks=False):
                    if root_level and entry.name.endswith(".md"):
                        files.append(entry_path)
                    elif not root_level and entry.name == "SKILL.md":
                        files.append(entry_path)
            except OSError:
                continue

    _walk(root_dir, root_level=True)
    return files

def load_skill_from_file(file_path: str) -> Optional[Skill]:
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as handle:
            content = handle.read()
    except OSError:
        return None

    frontmatter = parse_skill_frontmatter(content)
    description = str(frontmatter.get("description", "")).strip()
    if not description:
        return None

    base_dir = os.path.dirname(file_path)
    name = str(frontmatter.get("name") or os.path.basename(base_dir)).strip()
    disable_model_invocation = frontmatter.get("disable-model-invocation") is True

    return Skill(
        name=name,
        description=description,
        file_path=file_path,
        base_dir=base_dir,
        disable_model_invocation=disable_model_invocation,
    )

def load_skills(skills_dir: str) -> List[Skill]:
    skills_by_name: Dict[str, Skill] = {}
    seen_paths: set[str] = set()

    if not os.path.exists(skills_dir):
        return []

    for file_path in discover_skill_files(skills_dir):
        real_path = os.path.realpath(file_path)
        if real_path in seen_paths:
            continue
        skill = load_skill_from_file(file_path)
        if not skill:
            continue
        if skill.name in skills_by_name:
            continue
        skills_by_name[skill.name] = skill
        seen_paths.add(real_path)

    return list(skills_by_name.values())


def load_allowlisted_claude_skills(
    claude_skills_root: str,
    allowlist: set[str],
) -> List[Skill]:
    """Load only named PAI skills from .claude/skills (avoids injecting all PAI skills)."""
    if not allowlist or not os.path.isdir(claude_skills_root):
        return []

    loaded: List[Skill] = []
    for skill_name in sorted(allowlist):
        skill_md = os.path.join(claude_skills_root, skill_name, "SKILL.md")
        if not os.path.isfile(skill_md):
            logger.warning("Allowlisted Claude skill missing: %s", skill_md)
            continue
        skill = load_skill_from_file(skill_md)
        if skill:
            loaded.append(skill)
    return loaded

def format_skills_for_prompt(skills: List[Skill]) -> str:
    visible_skills = [skill for skill in skills if not skill.disable_model_invocation]
    if not visible_skills:
        return ""

    lines = [
        "\n--- VERFÜGBARE SKILLS ---",
        "Die folgenden Skills bieten spezialisierte Anweisungen für bestimmte Aufgaben.",
        "Nutze das 'read_file' Tool, um den Inhalt eines Skills zu lesen, wenn die Aufgabe zur Beschreibung passt.",
        "",
        "<available_skills>",
    ]

    for skill in visible_skills:
        lines.append("  <skill>")
        lines.append(f"    <name>{skill.name}</name>")
        lines.append(f"    <description>{skill.description}</description>")
        lines.append(f"    <location>{skill.file_path}</location>")
        lines.append("  </skill>")

    lines.append("</available_skills>")
    return "\n".join(lines)
