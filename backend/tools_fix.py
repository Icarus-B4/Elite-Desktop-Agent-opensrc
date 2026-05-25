# ============================================================
# TOOL 12: System-Informationen abrufen
# ============================================================
import logging
from livekit.agents import RunContext, function_tool

logger = logging.getLogger("tools-fix")

@function_tool()
async def get_system_info(context: RunContext) -> str:
    """Gibt aktuelle System-Informationen zurück (CPU, RAM, Auslastung).
    Nutze dies, wenn der Nutzer fragt 'Wie geht es meinem PC?' oder 'Zeige System-Status'.
    """
    import psutil
    
    cpu_usage = psutil.cpu_percent(interval=0.1)
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    info = (
        f"System-Status:\n"
        f"- CPU Auslastung: {cpu_usage}%\n"
        f"- RAM: {ram.percent}% genutzt ({ram.used / (1024**3):.1f}GB von {ram.total / (1024**3):.1f}GB)\n"
        f"- Festplatte: {disk.percent}% belegt\n"
        f"- Prozesse: {len(psutil.pids())} aktive Tasks"
    )
    return info

# ============================================================
# TOOL 13: Offene Fenster auflisten
# ============================================================
@function_tool()
async def get_open_windows(context: RunContext) -> str:
    """Gibt eine Liste aller aktuell geöffneten Fenster und Programme zurück.
    Nutze dieses Tool, um zu sehen, welche Anwendungen gerade laufen.
    """
    try:
        import pygetwindow as gw
        windows = gw.getAllTitles()
        # Leere Titel filtern
        active_windows = [w for w in windows if w.strip()]
        
        if not active_windows:
            return "Keine aktiven Fenster mit Titeln gefunden."
            
        summary = "Aktuell geöffnete Fenster:\n- " + "\n- ".join(active_windows[:20])
        return summary
    except Exception as e:
        logger.error(f"Fehler beim Fenster-Scan: {e}")
        return f"Konnte Fensterliste nicht abrufen: {str(e)}"
