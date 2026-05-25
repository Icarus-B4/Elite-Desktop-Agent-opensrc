import os
from datetime import datetime

memory_path = r"c:\Users\ed\Webdesign\webstark.org\webstark-landing-page-main\Elite-Desktop-Agent\.agent\CONVERSATION_MEMORY.md"

timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
entry_title = f"### {timestamp} - Integration des Elite Development Protocols & Persona Upgrade"

entry_content = f"""
{entry_title}
- **Neuer Skill**: `elite-dev-protocol` erstellt. Dieser Skill erzwingt "Docs-First", integriert `code-review` und automatisiert Python/Android-Workflows.
- **Persona-Upgrade (Elite-Aura)**: `SOUL.md` und `GEMINI.md` aktualisiert. Elite agiert nun noch minimalistischer ("Ich lache nicht, ich atme nicht").
- **Memory-System**: `memory-chat-conversation` Skill auf Deutsch umgestellt. Neue Regel: Chronologisches Appending am Ende der Historie statt Überschreiben.
- **Spracherkennung**: Optimale Einstellungen für VAD/STT in der `SOUL.md` hinterlegt.
- **Automatisierung**: Memory-Update ist nun der automatische Schlusspunkt jeder Aufgabe.
"""

if os.path.exists(memory_path):
    with open(memory_path, "a", encoding="utf-8") as f:
        f.write("\n" + entry_content)
    print(f"Memory updated successfully at {memory_path}")
else:
    print(f"Error: {memory_path} not found.")
