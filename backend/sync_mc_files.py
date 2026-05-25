import os
import shutil

def sync_files():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    mc_agent_dir = os.path.join(base_dir, "mission-control", ".mission-control", "agents", "elite-agent")
    
    os.makedirs(mc_agent_dir, exist_ok=True)
    
    # 1. CONVERSATION_MEMORY.md -> MEMORY.md
    mem_src = os.path.join(base_dir, ".agent", "CONVERSATION_MEMORY.md")
    mem_dst = os.path.join(mc_agent_dir, "MEMORY.md")
    if os.path.exists(mem_src):
        shutil.copy(mem_src, mem_dst)
        print(f"Synced: MEMORY.md")
        
    # 2. GEMINI.md -> IDENTITY.md
    id_src = os.path.join(base_dir, "GEMINI.md")
    id_dst = os.path.join(mc_agent_dir, "IDENTITY.md")
    if os.path.exists(id_src):
        shutil.copy(id_src, id_dst)
        print(f"Synced: IDENTITY.md")
        
    # 3. agents/elite-agent/SOUL.md -> SOUL.md (canonical Elite persona, not AGENTS.md)
    soul_src = os.path.join(base_dir, "agents", "elite-agent", "SOUL.md")
    soul_dst = os.path.join(mc_agent_dir, "SOUL.md")
    if os.path.exists(soul_src):
        shutil.copy(soul_src, soul_dst)
        print("Synced: SOUL.md (elite-agent)")

if __name__ == "__main__":
    sync_files()
