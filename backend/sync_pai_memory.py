# -*- coding: utf-8 -*-
import os
import shutil
import re

def sync_pai_memory():
    # Basisverzeichnisse
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    user_home = os.path.expanduser("~")
    
    # Pfade definieren
    local_gemini = os.path.join(base_dir, "GEMINI.md")
    local_soul = os.path.join(base_dir, "agents", "elite-agent", "SOUL.md")
    local_memory = os.path.join(base_dir, ".agent", "CONVERSATION_MEMORY.md")
    
    # Synchronisiere zu BEIDEN Pfaden (Standard-PAI und aktiver Claude PAI-Daemon)
    explicit_root = os.environ.get("PAI_HOME", "").strip()
    pai_dirs = []
    if explicit_root:
        pai_dirs.append(explicit_root)
    pai_dirs.extend(
        [
            os.path.join(user_home, "PAI"),
            os.path.join(user_home, ".claude", "PAI"),
        ]
    )
    
    print(f"[PAI Sync] Starte Spiegelung. Basisordner: {base_dir}")
    
    for pai_dir in pai_dirs:
        print(f"[PAI Sync] Synchronisiere mit: {pai_dir}")
        
        # PAI Ordnerstrukturen vorbereiten
        pai_user_dir = os.path.join(pai_dir, "USER")
        pai_telos_dir = os.path.join(pai_user_dir, "TELOS")
        pai_work = os.path.join(pai_user_dir, "WORK")
        pai_knowledge = os.path.join(pai_user_dir, "KNOWLEDGE")
        pai_learning = os.path.join(pai_user_dir, "LEARNING")
        
        # Ordner erstellen falls sie nicht existieren
        os.makedirs(pai_user_dir, exist_ok=True)
        os.makedirs(pai_telos_dir, exist_ok=True)
        os.makedirs(pai_work, exist_ok=True)
        os.makedirs(pai_knowledge, exist_ok=True)
        os.makedirs(pai_learning, exist_ok=True)
        
        # 1. Identity & Verhaltensregeln spiegeln
        if os.path.exists(local_gemini):
            shutil.copy(local_gemini, os.path.join(pai_user_dir, "IDENTITY.md"))
            print(f"[PAI Sync] IDENTITY.md gespiegelt nach {pai_user_dir}")
        if os.path.exists(local_soul):
            shutil.copy(local_soul, os.path.join(pai_user_dir, "SOUL.md"))
            print(f"[PAI Sync] SOUL.md gespiegelt nach {pai_user_dir}")
            
        # 2. CONVERSATION_MEMORY.md einlesen und strukturieren in die Memory-Engine
        if os.path.exists(local_memory):
            try:
                try:
                    with open(local_memory, "r", encoding="utf-8") as f:
                        content = f.read()
                except UnicodeDecodeError:
                    with open(local_memory, "r", encoding="latin-1") as f:
                        content = f.read()
                    
                # Rohkopie spiegeln
                with open(os.path.join(pai_learning, "CONVERSATION_MEMORY_RAW.md"), 'w', encoding='utf-8') as f:
                    f.write(content)
                    
                # Extraktion für PAI: LEARNING (Aktivitäts-Historie)
                learning_content = "# PAI Learning: Aktivitäts-Historie\n\n"
                history_match = re.search(r"## 📜 Aktivitäts-Historie.*", content, re.DOTALL)
                if history_match:
                    learning_content += history_match.group(0)
                else:
                    learning_content += content
                    
                with open(os.path.join(pai_learning, "ACTIVITY_LEARNING.md"), 'w', encoding='utf-8') as f:
                    f.write(learning_content)
                    
                # Extraktion für PAI: WORK (Aktuelle Aufgaben & Roadmap)
                work_content = "# PAI Work: Aktive Aufgaben & Roadmap\n\n"
                # Auslesen von CONTEXT.md oder README.md für aktiven Status
                readme_path = os.path.join(base_dir, "README.md")
                if os.path.exists(readme_path):
                    with open(readme_path, 'r', encoding='utf-8') as r_file:
                        readme_data = r_file.read()
                    roadmap_match = re.search(r"## 🚀 Zukünftige Entwicklung & Roadmap.*", readme_data, re.DOTALL)
                    if roadmap_match:
                        work_content += roadmap_match.group(0)
                    else:
                        work_content += "Keine explizite Roadmap in README.md gefunden."
                else:
                    work_content += "Konstante Evolution im Gange."
                    
                with open(os.path.join(pai_work, "CURRENT_WORK.md"), 'w', encoding='utf-8') as f:
                    f.write(work_content)
                    
                # Extraktion für PAI: KNOWLEDGE (Technischer Stack & Specs)
                knowledge_content = "# PAI Knowledge: Techstack & System-Architektur\n\n"
                if os.path.exists(readme_path):
                    with open(readme_path, 'r', encoding='utf-8') as r_file:
                        readme_data = r_file.read()
                    # Sucht nach dem Techstack in README
                    tech_match = re.search(r"## ⚙️ Techstack & Architektur.*?(?=##|$)", readme_data, re.DOTALL)
                    if tech_match:
                        knowledge_content += tech_match.group(0)
                    else:
                        knowledge_content += "Techstack & Architektur nicht in README gefunden."
                else:
                    knowledge_content += "Elite Desktop Agent System."
                    
                with open(os.path.join(pai_knowledge, "AGENT_KNOWLEDGE.md"), 'w', encoding='utf-8') as f:
                    f.write(knowledge_content)
                    
                print(f"[PAI Sync] Drei-Stufen-Memory (WORK, KNOWLEDGE, LEARNING) erfolgreich strukturiert in {pai_dir}")
                
            except Exception as e:
                print(f"[PAI Sync] Fehler bei der Memory-Aufteilung für {pai_dir}: {str(e)}")
        else:
            print("[PAI Sync] Lokale Datei CONVERSATION_MEMORY.md existiert noch nicht.")

if __name__ == "__main__":
    sync_pai_memory()
