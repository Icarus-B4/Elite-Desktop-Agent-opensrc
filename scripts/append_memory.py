# -*- coding: utf-8 -*-
import os
import sys

def append_to_memory():
    memory_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".agent", "CONVERSATION_MEMORY.md")
    
    entry = """

### 2026-05-18 09:15 - Integration des PAI Pulse-Daemons & Memory Mirroring (Phase B)
- **PAI Pulse-Daemon Widget**: Neues HUD-Widget (`pai-pulse-widget.tsx`) erstellt, das das Daniel Miessler PAI Life OS Interface von `http://localhost:31337` in einem hochauflösenden, interaktiven Glassmorphism-Iframe rendert. Vollständig in den `widget-manager.tsx`, `BottomToolbar` (mit eigenem `HeartPulse` Icon) und die Layout-Grid-Overlays der Landingpage und des Dashboards integriert.
- **Drei-Stufen Memory Mirroring**: Ein hochstrukturiertes Python-Synchronisationsskript (`sync_pai_memory.py`) implementiert, das die lokalen Richtlinien (`GEMINI.md`, `SOUL.md`) und das Entwicklergedächtnis (`CONVERSATION_MEMORY.md`) automatisch in das Daniel Miessler PAI Format spaltet und unter `C:\\Users\\ed\\PAI\\USER` in die Ordner `WORK` (`CURRENT_WORK.md`), `KNOWLEDGE` (`AGENT_KNOWLEDGE.md`) und `LEARNING` (`ACTIVITY_LEARNING.md`) spiegelt.
- **Mission Control WebSocket Sync**: Ein asynchroner WebSocket-Client in `backend/agent.py` integriert, der in Echtzeit PAI-Thinking-Events vom Mission Control Hub (`ws://localhost:3000/ws`) abfängt, in das PAI Phasen-Modell (`Observe` -> `Think` -> `Plan` -> `Build` -> `Execute` -> `Verify` -> `Learn`) übersetzt und über den Livekit DataChannel in das HUD LogStreamer-Widget streamt.
"""
    
    print(f"Lese Memory-Datei: {memory_path}...")
    if not os.path.exists(memory_path):
        print(f"Fehler: Memory-Datei existiert nicht unter {memory_path}!")
        return False
        
    encodings = ["utf-8", "cp1252", "latin-1"]
    content = None
    selected_encoding = None
    
    for enc in encodings:
        try:
            with open(memory_path, "r", encoding=enc) as f:
                content = f.read()
            selected_encoding = enc
            print(f"Datei erfolgreich gelesen mit Encoding: {enc}")
            break
        except UnicodeDecodeError:
            continue
            
    if content is None:
        print("Fehler: Konnte Datei mit keinem der Encodings lesen!")
        return False
        
    try:
        new_content = content.rstrip() + entry
        
        with open(memory_path, "w", encoding=selected_encoding) as f:
            f.write(new_content)
            
        print(f"Memory erfolgreich aktualisiert und gespeichert im Encoding: {selected_encoding}!")
        return True
    except Exception as e:
        print(f"Fehler beim Schreiben in die Memory: {e}")
        return False

if __name__ == "__main__":
    success = append_to_memory()
    sys.exit(0 if success else 1)
