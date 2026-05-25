import os
import asyncio
import json
import logging
import subprocess
from livekit.agents import RunContext, function_tool
from livekit.agents.llm import ToolError

# Logging setup
logger = logging.getLogger("livekit-agent")

# Import emit_log from tools (assuming it's in the same directory)
try:
    from tools import emit_log
except ImportError:
    async def emit_log(context, type, message):
        logger.info(f"[{type}] {message}")

class UIAutomationHelper:
    """Hilfsklasse für die Kommunikation mit dem UiAutomationGRPC.Server via grpccurl."""
    
    def __init__(self, server_address="localhost:50051"):
        self.server_address = server_address
        self._grpccurl_path = "grpccurl" # Standardmäßig im PATH erwartet

    async def _call_grpc(self, method: str, data: dict):
        """Führt einen gRPC-Aufruf via grpccurl aus."""
        cmd = [
            self._grpccurl_path,
            "-plaintext",
            "-d", json.dumps(data),
            self.server_address,
            f"UiAutomation.UiAutomationService/{method}"
        ]
        
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                error_msg = stderr.decode('utf-8', errors='replace').strip()
                # Falls grpccurl nicht gefunden wurde
                if "not recognized" in error_msg or "nicht gefunden" in error_msg:
                    raise ToolError("grpccurl ist nicht installiert oder nicht im PATH. Bitte installiere grpccurl für Windows.")
                raise ToolError(f"gRPC Fehler ({method}): {error_msg}")
            
            output = stdout.decode('utf-8', errors='replace').strip()
            if not output:
                return {}
            return json.loads(output)
            
        except FileNotFoundError:
            raise ToolError("grpccurl executable wurde nicht gefunden. Bitte stelle sicher, dass es installiert ist.")
        except Exception as e:
            raise ToolError(f"Fehler bei UI Automation Aufruf: {str(e)}")

    async def get_app_structure(self, app_name: str = "", process_id: int = None):
        data = {}
        if process_id:
            data["process_id"] = process_id
            data["use_process_id"] = True
        else:
            data["app_name"] = app_name
        return await self._call_grpc("GetAppStructure", data)

    async def perform_action(self, runtime_id: str, action_code: int, arguments: list = None):
        data = {
            "runtime_id": runtime_id,
            "action": action_code
        }
        if arguments:
            data["arguments"] = arguments
        return await self._call_grpc("PerformActionWithStructure", data)

    async def open_app(self, app_name: str):
        return await self._call_grpc("OpenApp", {"app_name": app_name})

    async def close_app(self, app_name: str):
        return await self._call_grpc("CloseApp", {"app_name": app_name})

    async def send_keys(self, keys: str):
        return await self._call_grpc("SendKeys", {"keys": keys})

# Instanz des Helpers
ui_helper = UIAutomationHelper()

# Mapping von Action-Namen zu Codes (laut SKILL.md)
ACTION_MAP = {
    "INVOKE": 0,
    "TOGGLE": 1,
    "SELECT": 2,
    "EXPAND_COLLAPSE": 3,
    "SET_VALUE": 4,
    "SET_FOCUS": 5,
    "SCROLL": 6,
    "WINDOW_CONTROL": 7,
    "MoveTo": 8,
    "LeftClick": 9,
    "RightClick": 10,
    "Drag": 11,
    "Drop": 12,
    "ScrollUp": 13,
    "ScrollDown": 14,
    "ScrollLeft": 15,
    "ScrollRight": 16,
    "DoubleClick": 17
}

@function_tool()
async def ui_get_app_structure(context: RunContext, app_name: str) -> str:
    """Ruft die komplette UI-Struktur einer Anwendung ab (See).
    Nutze dies, um IDs von Buttons oder Textfeldern zu finden.
    
    Args:
        app_name: Der Name der App (z.B. 'calc', 'notepad', 'chrome')
    """
    await emit_log(context, "thinking", f"Lese UI-Struktur von '{app_name}'...")
    try:
        result = await ui_helper.get_app_structure(app_name)
        # Wir geben eine kompakte JSON-Struktur zurück oder eine Fehlermeldung
        if "json_structure" in result:
            structure = json.loads(result["json_structure"])
            # Wir kürzen die Struktur evtl. wenn sie zu groß ist, aber meistens ist das LLM gut darin.
            return json.dumps(structure, indent=2, ensure_ascii=False)
        return "Konnte keine UI-Struktur für diese App abrufen. Läuft die App?"
    except Exception as e:
        return f"Fehler beim Lesen der UI: {str(e)}"

@function_tool()
async def ui_interact(
    context: RunContext, 
    runtime_id: str, 
    action: str = "LeftClick", 
    text_value: str = None
) -> str:
    """Interagiert mit einem UI-Element (Act).
    Aktionen: 'LeftClick', 'RightClick', 'DoubleClick', 'SET_VALUE' (für Texteingabe), 'INVOKE', 'SET_FOCUS'.
    
    Args:
        runtime_id: Die UniqId des Elements (aus ui_get_app_structure)
        action: Die auszuführende Aktion
        text_value: Bei 'SET_VALUE' der einzugebende Text
    """
    action_code = ACTION_MAP.get(action, 9) # Default LeftClick
    args = [text_value] if text_value else []
    
    await emit_log(context, "tool_call", f"UI Aktion: {action} auf {runtime_id}")
    try:
        result = await ui_helper.perform_action(runtime_id, action_code, args)
        if result.get("success"):
            return f"Aktion '{action}' erfolgreich ausgeführt."
        return f"Aktion '{action}' fehlgeschlagen: {result.get('message', 'Unbekannter Fehler')}"
    except Exception as e:
        return f"Fehler bei UI Interaktion: {str(e)}"

@function_tool()
async def ui_open_application(context: RunContext, app_name: str) -> str:
    """Startet eine Anwendung über den UI Automation Server.
    
    Args:
        app_name: Name oder Pfad der Anwendung (z.B. 'calc', 'notepad')
    """
    await emit_log(context, "tool_call", f"Öffne App via UI-Server: {app_name}")
    try:
        await ui_helper.open_app(app_name)
        return f"Anwendung '{app_name}' wurde gestartet."
    except Exception as e:
        return f"Fehler beim Starten der App: {str(e)}"

@function_tool()
async def ui_list_windows(context: RunContext) -> str:
    """Listet alle aktuell verfügbaren Fenster auf, die vom UI-Server erkannt werden.
    """
    # Da GetAppStructure einen Namen braucht, versuchen wir "Root" oder eine Liste von Prozessen
    await emit_log(context, "thinking", "Scanne offene Fenster via UI-Server...")
    try:
        # PowerShell Fallback um Prozessnamen zu bekommen
        cmd = "powershell -Command \"Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Name, MainWindowTitle | ConvertTo-Json\""
        process = await asyncio.create_subprocess_shell(cmd, stdout=asyncio.subprocess.PIPE)
        stdout, _ = await process.communicate()
        
        procs = json.loads(stdout.decode('cp1252', errors='replace'))
        if isinstance(procs, dict): procs = [procs]
        
        result = "Gefundene Fenster via UI Automation:\n"
        for p in procs:
            name = p.get("Name")
            title = p.get("MainWindowTitle")
            result += f"- {title} (Prozess: {name})\n"
            
        return result
    except Exception as e:
        return f"Fehler beim Auflisten der Fenster: {str(e)}"

@function_tool()
async def ui_search_and_click(context: RunContext, app_name: str, element_name: str) -> str:
    """Sucht ein Element in einer App anhand des Namens und klickt es an.
    Kombiniert 'See' und 'Act' für einfache Aufgaben.
    
    Args:
        app_name: Name der Anwendung
        element_name: Name des Buttons/Elements (z.B. 'Schließen', 'Datei')
    """
    await emit_log(context, "thinking", f"Suche '{element_name}' in '{app_name}'...")
    try:
        res = await ui_helper.get_app_structure(app_name)
        if "json_structure" not in res:
            return f"Konnte App '{app_name}' nicht finden."
            
        structure = json.loads(res["json_structure"])
        
        # Rekursive Suche nach dem Namen
        target_id = None
        def find_element(node):
            nonlocal target_id
            if node.get("Name") == element_name or node.get("UiAutomationId") == element_name:
                target_id = node.get("UniqId")
                return True
            for child in node.get("Children", []):
                if find_element(child): return True
            return False
            
        find_element(structure)
        
        if target_id:
            await ui_helper.perform_action(target_id, 9) # LeftClick
            return f"Element '{element_name}' gefunden und geklickt."
        
        return f"Element '{element_name}' wurde in '{app_name}' nicht gefunden."
    except Exception as e:
        return f"Fehler bei Suche & Klick: {str(e)}"

# Export für tools.py
UI_AUTOMATION_TOOLS = [
    ui_get_app_structure,
    ui_interact,
    ui_open_application,
    ui_list_windows,
    ui_search_and_click
]
