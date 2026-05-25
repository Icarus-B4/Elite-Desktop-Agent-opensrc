"""
Elite Agent Tools – Alle Function Tools für den Webstark KI-Agenten.
Modular aufgebaut, damit agent.py schlank bleibt.
"""
import os
import time
import asyncio
import json
import logging
import random
import aiohttp
import subprocess
import pyautogui
import psutil
import base64
import urllib.parse
import re
from io import BytesIO
from PIL import Image
from datetime import datetime
from livekit.agents import RunContext, function_tool
from livekit.agents.llm import ToolError

# Professionelle Email-Templates importieren
from email_templates import (
    build_package_overview_email,
    build_thankyou_email,
    build_custom_email,
    build_developer_briefing,
)
from ui_automation_tools import UI_AUTOMATION_TOOLS
from ada_tools import ADA_TOOLS
from paths import get_screenshots_dir, get_memory_file, get_data_dir, get_writable_path
from mc_config import get_mc_api, get_mc_url
from elite_config import load_config

logger = logging.getLogger("livekit-agent")

def _debug_log_mc(hypothesis_id: str, location: str, message: str, data: dict | None = None, run_id: str = "pre-fix") -> None:
    try:
        log_path = get_writable_path("backend/debug-c6ca70.log")
        payload = {
            "sessionId": "c6ca70",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(time.time() * 1000),
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass

_ELITE_WINDOW_TITLE_MARKERS = (
    "elite",
    "electron",
    "jarvis",
    "eliteagent",
    "mission control",
    "livekit",
    "webstark",
)

_PS_MINIMIZE_NON_ELITE = r"""
$exclude = @('Elite', 'Electron', 'Jarvis', 'EliteAgent', 'Mission Control', 'LiveKit', 'Webstark')
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class EliteWin32 {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | ForEach-Object {
  $t = $_.MainWindowTitle
  if ([string]::IsNullOrWhiteSpace($t)) { return }
  $skip = $false
  foreach ($e in $exclude) {
    if ($t -like "*$e*") { $skip = $true; break }
  }
  if (-not $skip) {
    [void][EliteWin32]::ShowWindow($_.MainWindowHandle, 6)
  }
}
"""


def _is_elite_window_title(title: str) -> bool:
    lower = (title or "").lower()
    return any(marker in lower for marker in _ELITE_WINDOW_TITLE_MARKERS)


def _is_elite_window_keyword(keywords: str) -> bool:
    lower = (keywords or "").lower()
    return any(marker in lower for marker in _ELITE_WINDOW_TITLE_MARKERS)


async def _signal_elite_hide_to_tray() -> bool:
    """Elite-Fenster in die Systemleiste (Electron Tray)."""
    try:
        timeout = aiohttp.ClientTimeout(total=2)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post("http://127.0.0.1:17862/hide-to-tray") as resp:
                if resp.status == 200:
                    return True
    except Exception as exc:
        logger.debug("Tray-Bridge HTTP nicht erreichbar: %s", exc)

    try:
        flag_path = get_writable_path("hide_to_tray.flag")
        with open(flag_path, "w", encoding="utf-8") as f:
            f.write(str(datetime.now().timestamp()))
        return True
    except OSError as exc:
        logger.warning("Tray-Flag konnte nicht geschrieben werden: %s", exc)
        return False


async def _minimize_non_elite_windows() -> None:
    script_path = get_writable_path(os.path.join("scripts", "minimize_non_elite.ps1"))
    os.makedirs(os.path.dirname(script_path), exist_ok=True)
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(_PS_MINIMIZE_NON_ELITE.strip())
    proc = await asyncio.create_subprocess_exec(
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.wait()


def _normalize_url(url: str) -> str:
    """Ensures a browser-ready URL (https:// prefix if missing)."""
    raw = (url or "").strip().strip("\"'")
    if not raw:
        raise ValueError("Leere URL")
    lower = raw.lower()
    if lower.startswith(("http://", "https://", "file://")):
        return raw
    return f"https://{raw}"


def _open_url_in_browser(url: str) -> str:
    """Opens URL in Brave (if installed) or default browser. Returns normalized URL."""
    normalized = _normalize_url(url)
    brave_candidates = [
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
    ]
    for brave in brave_candidates:
        if os.path.isfile(brave):
            subprocess.Popen([brave, normalized], close_fds=True)
            logger.info(f"Browser (Brave): {normalized}")
            return normalized

    if os.name == "nt":
        # start "" "url" — zuverlässiger als os.startfile() für HTTPS auf Windows
        subprocess.Popen(f'start "" "{normalized}"', shell=True)
        logger.info(f"Browser (Standard): {normalized}")
        return normalized

    import webbrowser
    webbrowser.open(normalized)
    return normalized


def _known_media_web_target(app_name: str) -> tuple[str, str] | None:
    """Korrigiert häufige STT-Verhörer bei Medien-/Sender-Kommandos."""
    normalized = re.sub(r"[,!.?;:]+", " ", (app_name or "").strip().lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized:
        return None

    has_prosieben = any(
        phrase in normalized
        for phrase in ("pro sieben", "prosieben", "pro7", "pro 7")
    )
    if has_prosieben and ("saturn" in normalized or "zattoo" in normalized):
        return ("Zattoo ProSieben", "https://zattoo.com")
    if normalized == "zattoo":
        return ("Zattoo", "https://zattoo.com")
    return None


async def _publish_captured_image(context: RunContext, entry: dict) -> None:
    """Sends a gallery entry to the HUD image grid via LiveKit data channel."""
    room = get_room_from_context(context)
    if not room:
        return
    payload = json.dumps({
        "type": "captured_image",
        "image": {
            "src": entry["src"],
            "labels": entry.get("labels", []),
            "confidence": entry.get("confidence", 0.9),
            "analysis": entry.get("analysis", {}),
        },
    })
    await room.local_participant.publish_data(payload.encode("utf-8"))

# ============================================================
# FURY-SDK BRIDGE: Hilfsfunktion für Log-Streaming
# ============================================================
def get_room_from_context(context: RunContext):
    """Sicherer Abruf des Raums aus dem RunContext mit intensivem Debugging."""
    logger.debug(f"DEBUG: get_room_from_context aufgerufen. Context-Typ: {type(context)}")
    
    # 1. Hauptpfad für Voice-Agents: Über die Session -> current_agent -> room
    if hasattr(context, "session") and context.session:
        # Check current_agent (da wir es in agent.py dort gespeichert haben)
        if hasattr(context.session, "current_agent"):
            agent = context.session.current_agent
            if hasattr(agent, "room") and agent.room:
                logger.debug("DEBUG: Raum via session.current_agent.room gefunden.")
                return agent.room

        # Fallback: Manche Versionen haben es in _room oder room_io (indirekt)
        if hasattr(context.session, "room") and context.session.room:
            logger.debug("DEBUG: Raum direkt in session.room gefunden.")
            return context.session.room
        
        if hasattr(context.session, "_room") and context.session._room:
            return context.session._room

    # 2. Check fnc_ctx (für legacy tools)
    if hasattr(context, "fnc_ctx") and context.fnc_ctx:
        room = context.fnc_ctx.extra_data.get("room")
        if room: return room
    
    # 3. Check direkt am Kontext
    if hasattr(context, "room") and context.room:
        return context.room
        
    # 4. Check direkt am Agenten (falls vorhanden)
    if hasattr(context, "agent") and hasattr(context.agent, "room"):
        return context.agent.room

    # Letzter Versuch: Alle Attribute loggen
    attrs = [a for a in dir(context) if not a.startswith("__")]
    logger.error(f"KRITISCH: Raum nicht gefunden! Attribute im Context: {attrs}")
    if hasattr(context, "session"):
        s_attrs = [a for a in dir(context.session) if not a.startswith("__")]
        logger.error(f"DEBUG: Attribute in context.session: {s_attrs}")
        if hasattr(context.session, "current_agent"):
            a_attrs = [a for a in dir(context.session.current_agent) if not a.startswith("__")]
            logger.error(f"DEBUG: Attribute in current_agent: {a_attrs}")
        
    return None

async def emit_log(context: RunContext, type: str, message: str):
    """Sendet einen Log-Eintrag via DataChannel an das Frontend."""
    room = get_room_from_context(context)
    if room:
        try:
            payload = json.dumps({
                "type": "log_event",
                "log": {
                    "type": type,
                    "message": message
                }
            })
            await room.local_participant.publish_data(payload.encode('utf-8'))
        except Exception as e:
            logger.warning(f"Log-Streaming fehlgeschlagen: {e}")
    else:
        logger.debug(f"Emit log (no room): [{type}] {message}")


# ============================================================
# TOOL 1: Websuche via Tavily API
# Ermöglicht Elite, aktuelle Infos aus dem Internet zu holen.
# ============================================================
@function_tool()
async def search_web(context: RunContext, query: str) -> str:
    """Durchsuche das Internet nach aktuellen Informationen.
    Nutze dieses Tool, wenn der Nutzer nach aktuellen Trends,
    Webseiten-Infos oder Branchenwissen fragt.

    Args:
        query: Die Suchanfrage, z.B. 'Webdesign Trends 2025 Schweiz'
    """
    tavily_key = os.environ.get("TAVILY_API_KEY")
    if not tavily_key:
        raise ToolError("Websuche ist momentan nicht verfügbar. Bitte kontaktiere icarus.mod56@gmail.com.")

    try:
        from tavily import AsyncTavilyClient
        client = AsyncTavilyClient(api_key=tavily_key)
        result = await client.search(query=query, max_results=3, search_depth="basic")

        # Ergebnisse für die KI aufbereiten
        summary_parts = []
        for item in result.get("results", []):
            title = item.get("title", "")
            content = item.get("content", "")[:300]
            url = item.get("url", "")
            summary_parts.append(f"**{title}**\n{content}\nQuelle: {url}")

        if not summary_parts:
            return "Keine relevanten Ergebnisse gefunden."

        return "\n\n".join(summary_parts)

    except Exception as e:
        logger.error(f"Tavily-Sucherror: {e}")
        raise ToolError("Die Websuche ist fehlgeschlagen. Bitte versuche es später erneut.")


# ============================================================
# TOOL 2: Lead speichern
# Speichert Kontaktdaten von Interessenten als JSON-Datei.
# ============================================================
@function_tool()
async def save_lead(
    context: RunContext,
    name: str,
    email: str,
    interest: str,
    phone: str = "",
) -> str:
    """Speichere die Kontaktdaten eines interessierten Kunden.
    Nutze dieses Tool, wenn der Nutzer seinen Namen und seine E-Mail
    hinterlassen möchte oder Interesse an einem Paket bekundet.
    Frage aktiv nach Name und E-Mail, bevor du dieses Tool aufrufst.

    Args:
        name: Vollständiger Name des Kunden
        email: E-Mail-Adresse des Kunden
        interest: Woran ist der Kunde interessiert (z.B. 'Starter-Paket', 'SEO-Optimierung')
        phone: Telefonnummer (optional)
    """
    if not name or not email:
        raise ToolError("Name und E-Mail sind erforderlich, um den Lead zu speichern.")
    if "@" not in email:
        raise ToolError("Die E-Mail-Adresse scheint ungültig zu sein. Bitte erneut fragen.")

    # Unterbrechungen verbieten – wir schreiben Daten
    context.disallow_interruptions()

    lead_data = {
        "name": name,
        "email": email,
        "phone": phone,
        "interest": interest,
        "created_at": datetime.utcnow().isoformat(),
    }

    # Lead als JSON-Datei speichern (AppData – MSIX-sicher)
    leads_dir = get_data_dir("leads")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = name.replace(" ", "_").lower()[:20]
    filename = f"lead_{safe_name}_{timestamp}.json"
    filepath = os.path.join(leads_dir, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(lead_data, f, ensure_ascii=False, indent=2)

    logger.info(f"Lead gespeichert: {filepath}")

    # Benachrichtigungs-E-Mail an Webstark senden (wenn Resend konfiguriert)
    await _notify_new_lead(lead_data)

    return f"Kontaktdaten von {name} wurden erfolgreich gespeichert. Wir melden uns in Kürze per E-Mail bei {email}."


# ============================================================
# TOOL 3: Kostenvoranschlag berechnen
# ============================================================
@function_tool()
async def calculate_quote(
    context: RunContext,
    package: str,
    extra_pages: int = 0,
    seo_hours: int = 0,
    chatbot: bool = False,
) -> str:
    """Berechne einen Kostenvoranschlag für ein Webstark-Projekt.
    Nutze dieses Tool, wenn der Nutzer nach einem Preis oder Angebot fragt.

    Args:
        package: Das gewählte Paket ('starter', 'professional', 'enterprise')
        extra_pages: Anzahl zusätzlicher Unterseiten (über die im Paket enthaltenen hinaus)
        seo_hours: Gewünschte SEO-Optimierungsstunden
        chatbot: Ob ein KI-Chatbot gewünscht ist (im Starter bereits enthalten)
    """
    # Webstark Preisliste (Stand: webstark.org)
    packages = {
        "starter": {
            "name": "Starter (AI-Enhanced)",
            "base_price": 890,
            "included_pages": 1,
            "includes_chatbot": True,
            "description": "KI-generiertes Design, Automatisches Basis-SEO, Responsive One-Page, Chatbot-Integration (Basis)"
        },
        "professional": {
            "name": "Professional (AI-Powered)",
            "base_price": 1490,
            "included_pages": 5,
            "includes_chatbot": True,
            "description": "Alles aus Starter, Content-Automation Engine, Predictive Analytics, A/B-Testing AI, Erweiterter KI-Support"
        },
        "enterprise": {
            "name": "Enterprise (AI-First)",
            "base_price": 0,
            "included_pages": 0,
            "includes_chatbot": True,
            "is_custom": True,
            "description": "Custom AI-Workflows, Dedicated AI-Team, 24/7 Priority Support, On-site Workshops"
        }
    }

    EXTRA_PAGE_PRICE = 200
    SEO_HOUR_PRICE = 120
    CHATBOT_ADDON_PRICE = 350

    pkg_key = package.lower().strip()
    if pkg_key not in packages:
        return (
            f"Das Paket '{package}' ist nicht verfügbar. "
            f"Verfügbare Pakete: Starter (890 CHF), Professional (1.490 CHF), Enterprise (Individuell)."
        )

    pkg = packages[pkg_key]

    # Enterprise = individuell
    if pkg.get("is_custom"):
        return (
            f"Das {pkg['name']}-Paket ist massgeschneidert und wird individuell kalkuliert.\n"
            f"Enthält: {pkg['description']}\n\n"
            f"Bitte kontaktiere uns unter icarus.mod56@gmail.com oder hinterlasse deine Kontaktdaten."
        )

    total = pkg["base_price"]
    breakdown = [f"{pkg['name']}: {pkg['base_price']} CHF"]

    if extra_pages > 0:
        page_cost = extra_pages * EXTRA_PAGE_PRICE
        total += page_cost
        breakdown.append(f"{extra_pages} Zusatzseiten: {page_cost} CHF")

    if seo_hours > 0:
        seo_cost = seo_hours * SEO_HOUR_PRICE
        total += seo_cost
        breakdown.append(f"{seo_hours} SEO-Stunden: {seo_cost} CHF")

    if chatbot and not pkg["includes_chatbot"]:
        total += CHATBOT_ADDON_PRICE
        breakdown.append(f"KI-Chatbot Add-on: {CHATBOT_ADDON_PRICE} CHF")

    result = f"Kostenvoranschlag für {pkg['name']}:\n"
    result += "\n".join(f"  • {item}" for item in breakdown)
    result += f"\n\nGesamtpreis: {total} CHF (zzgl. MwSt.)"
    result += f"\n\nInklusive: {pkg['description']}"

    return result


# ============================================================
# TOOL 4: E-Mail senden via Resend API
# Elite kann Zusammenfassungen oder Angebote per E-Mail senden.
# ============================================================
@function_tool()
async def send_email(
    context: RunContext,
    to_email: str,
    message: str = "",
    subject: str = "Informationen von Webstark",
    email_type: str = "custom",
    customer_name: str = "Kunde",
) -> str:
    """Sende eine E-Mail an den Kunden.
    Nutze dieses Tool, um dem Kunden Informationen per E-Mail zu schicken.
    Frage den Kunden vorher um Erlaubnis.

    Args:
        to_email: Empfänger E-Mail-Adresse
        message: Inhalt der E-Mail (Klartext, optional bei email_type='angebot')
        subject: Betreff der E-Mail
        email_type: Art der Email. 'angebot' für Paketübersicht, 'custom' für freien Text.
        customer_name: Name des Kunden für die persönliche Anrede
    """
    resend_key = os.environ.get("RESEND_API_KEY")
    if not resend_key:
        logger.error("RESEND_API_KEY ist NICHT gesetzt!")
        raise ToolError("E-Mail-Versand nicht möglich: API-Key fehlt.")

    if "@" not in to_email:
        raise ToolError("Die E-Mail-Adresse scheint ungültig zu sein.")

    # Unterbrechungen verbieten – E-Mail wird gesendet
    context.disallow_interruptions()

    # Email-Template basierend auf Typ auswählen
    if email_type == "angebot":
        html_body = build_package_overview_email(customer_name)
        if subject == "Informationen von Webstark":
            subject = "Deine Webstark Paketübersicht"
    else:
        html_body = build_custom_email(message)

    logger.info(f"E-Mail-Versand: an={to_email}, typ={email_type}")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                    "Accept-Encoding": "identity",
                },
                json={
                    "from": "Elite <elite@webstark.org>",
                    "to": [to_email],
                    "subject": subject,
                    "html": html_body,
                },
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status in (200, 201):
                    logger.info(f"SUCCESS: E-Mail gesendet an {to_email}: {subject}")
                    return f"E-Mail wurde erfolgreich an {to_email} gesendet."
                else:
                    error_text = await resp.text()
                    logger.error(f"ERROR: Resend HTTP {resp.status}: {error_text}")
                    raise ToolError(f"E-Mail fehlgeschlagen (HTTP {resp.status}): {error_text}")
    except aiohttp.ClientError as e:
        logger.error(f"❌ Netzwerkfehler: {e}")
        raise ToolError(f"E-Mail fehlgeschlagen (Netzwerk): {e}")


# ============================================================
# TOOL 5: Termin-Link vorschlagen
# Gibt dem Kunden einen direkten Buchungslink.
# ============================================================
@function_tool()
async def suggest_appointment(
    context: RunContext,
    topic: str,
) -> str:
    """Schlage dem Kunden einen Beratungstermin vor.
    Nutze dieses Tool, wenn der Kunde ein tiefergehendes Gespräch möchte,
    eine komplexe Anfrage hat, oder du das Enterprise-Paket empfiehlst.

    Args:
        topic: Worum geht es im Termin (z.B. 'SEO-Beratung', 'Webdesign-Projekt', 'Enterprise-Angebot')
    """
    # Termin-Link (anpassbar – Cal.com, Calendly, etc.)
    booking_url = os.environ.get("BOOKING_URL", "https://webstark.org/kontakt")

    return (
        f"Gerne! Für eine ausführliche Beratung zum Thema '{topic}' "
        f"kannst du direkt einen Termin buchen:\n\n"
        f"📅 Termin buchen: {booking_url}\n\n"
        f"Alternativ erreichst du uns auch unter icarus.mod56@gmail.com."
    )


# ============================================================
# TOOL 6: FAQ-Wissensbasis durchsuchen
# Lokale Wissensbasis für häufige Fragen (ohne API-Kosten).
# ============================================================

# FAQ-Datenbank – schnelle Antworten ohne LLM-Kosten
FAQ_DATABASE = [
    {
        "keywords": ["dauer", "wie lange", "zeitraum", "fertig"],
        "question": "Wie lange dauert ein Website-Projekt?",
        "answer": "Ein Starter-Projekt ist in ca. 1-2 Wochen fertig. Professional-Projekte dauern 3-5 Wochen, Enterprise-Projekte werden individuell geplant."
    },
    {
        "keywords": ["zahlung", "bezahlen", "rechnung", "anzahlung"],
        "question": "Wie läuft die Zahlung?",
        "answer": "Wir arbeiten mit 50% Anzahlung bei Projektstart und 50% bei Fertigstellung. Ratenzahlung ist bei grösseren Projekten möglich."
    },
    {
        "keywords": ["hosting", "server", "domain", "online"],
        "question": "Ist Hosting inklusive?",
        "answer": "Hosting wird separat berechnet. Wir empfehlen Vercel (kostenlos für kleine Projekte) oder managed Hosting ab 15 CHF/Monat. Die Domain-Registrierung können wir ebenfalls übernehmen."
    },
    {
        "keywords": ["änderung", "revision", "korrektur", "anpassen"],
        "question": "Wie viele Änderungen sind inklusive?",
        "answer": "Im Starter-Paket sind 2 Korrekturschleifen inklusive, im Professional-Paket 5. Zusätzliche Änderungen werden zum Stundensatz von 120 CHF berechnet."
    },
    {
        "keywords": ["garantie", "geld zurück", "zufriedenheit", "unzufrieden"],
        "question": "Gibt es eine Zufriedenheitsgarantie?",
        "answer": "Ja! Wir bieten eine 30-Tage Geld-zurück-Garantie. Wenn du nicht zufrieden bist, erstatten wir den vollen Betrag."
    },
    {
        "keywords": ["seo", "google", "ranking", "suchmaschine", "auffindbar"],
        "question": "Was beinhaltet die SEO-Optimierung?",
        "answer": "Basis-SEO (im Starter inklusive) umfasst: Meta-Tags, Seitengeschwindigkeit, Mobile-Optimierung und strukturierte Daten. Erweitertes SEO (Professional) beinhaltet zusätzlich Keyword-Analyse, Content-Strategie und monatliches Reporting."
    },
    {
        "keywords": ["chatbot", "ki", "bot", "automatisch", "chat"],
        "question": "Was kann der Chatbot?",
        "answer": "Der Basis-Chatbot (im Starter) beantwortet häufige Fragen automatisch. Der erweiterte KI-Support (Professional) lernt aus Gesprächen und kann komplexere Anfragen bearbeiten."
    },
    {
        "keywords": ["kontakt", "erreichen", "email", "telefon", "support"],
        "question": "Wie erreiche ich Webstark?",
        "answer": "Du erreichst uns per E-Mail unter icarus.mod56@gmail.com oder über den Live-Chat auf webstark.org. Telefon-Support ist aktuell nicht verfügbar."
    },
]


@function_tool()
async def lookup_faq(context: RunContext, question: str) -> str:
    """Suche in der Webstark FAQ-Wissensbasis nach einer Antwort.
    Nutze dieses Tool ZUERST, bevor du search_web verwendest.
    Es enthält häufig gestellte Fragen zu Preisen, Abläufen und Services.

    Args:
        question: Die Frage des Kunden, z.B. 'Wie lange dauert ein Projekt?'
    """
    question_lower = question.lower()

    # Relevanz-Score berechnen basierend auf Keyword-Matches
    best_match = None
    best_score = 0

    for faq in FAQ_DATABASE:
        score = sum(1 for kw in faq["keywords"] if kw in question_lower)
        if score > best_score:
            best_score = score
            best_match = faq

    if best_match and best_score > 0:
        return f"FAQ: {best_match['question']}\n\n{best_match['answer']}"

    return "Keine passende FAQ gefunden. Nutze search_web für eine Internet-Recherche oder verweise auf icarus.mod56@gmail.com."


# ============================================================
# TOOL 7: Gesprächs-Zusammenfassung erstellen
# Erstellt eine strukturierte Zusammenfassung am Ende des Gesprächs.
# ============================================================
@function_tool()
async def create_conversation_summary(
    context: RunContext,
    customer_name: str,
    topics_discussed: str,
    action_items: str,
    interest_level: str = "mittel",
    customer_email: str = "",
) -> str:
    """Erstelle eine Zusammenfassung des Gesprächs.
    Nutze dieses Tool am Ende eines Gesprächs oder wenn der Kunde
    sich verabschiedet, um alle wichtigen Punkte festzuhalten.
    Wenn die E-Mail des Kunden bekannt ist, wird automatisch eine
    Danke-Email mit Zusammenfassung gesendet.

    Args:
        customer_name: Name des Kunden (oder 'Unbekannt')
        topics_discussed: Komma-getrennte Liste der besprochenen Themen
        action_items: Nächste Schritte oder offene Aufgaben
        interest_level: Wie interessiert ist der Kunde? ('hoch', 'mittel', 'niedrig')
        customer_email: E-Mail des Kunden (falls bekannt, für Danke-Email)
    """
    context.disallow_interruptions()

    summary = {
        "customer_name": customer_name,
        "timestamp": datetime.utcnow().isoformat(),
        "topics": topics_discussed,
        "action_items": action_items,
        "interest_level": interest_level,
        "customer_email": customer_email,
    }

    # Zusammenfassung lokal als JSON speichern (Fallback, AppData)
    summaries_dir = get_data_dir("summaries")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"summary_{timestamp}.json"
    filepath = os.path.join(summaries_dir, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    logger.info(f"Gesprächs-Zusammenfassung gespeichert: {filepath}")

    # DB-Persistenz: In Mission Control speichern
    # user_name = context.session.userdata.get("user_name") # Legacy Clerk
    
    # Mission Control Update
    mc_url = get_mc_url()
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(f"{mc_url}/api/activity", headers={"X-Agent-ID": "elite-agent"}, json={
                "actor": "elite-agent", 
                "action": "SUMMARY", 
                "description": f"Zusammenfassung erstellt für {customer_name}"
            }, timeout=1)
    except: pass

    # Developer-Briefing an Webstark senden
    await _notify_summary(summary)

    # Automatische Danke-Email an den Kunden (falls Email bekannt)
    if customer_email and "@" in customer_email:
        await _send_thankyou_email(customer_email, customer_name, topics_discussed, action_items)

    result = (
        f"Zusammenfassung gespeichert!\n"
        f"Kunde: {customer_name}\n"
        f"Themen: {topics_discussed}\n"
        f"Nächste Schritte: {action_items}\n"
        f"Interesse: {interest_level}"
    )
    if customer_email:
        result += f"\nDanke-Email gesendet an: {customer_email}"
    return result


# ============================================================
# INTERNE HILFSFUNKTIONEN (nicht als Tool exponiert)
# ============================================================
async def _notify_new_lead(lead_data: dict) -> None:
    """Sendet eine Benachrichtigungs-E-Mail an Webstark bei neuem Lead."""
    resend_key = os.environ.get("RESEND_API_KEY")
    notify_email = os.environ.get("NOTIFY_EMAIL", "icarus.mod56@gmail.com")
    if not resend_key:
        logger.info("Kein RESEND_API_KEY – Lead-Benachrichtigung übersprungen.")
        return

    try:
        async with aiohttp.ClientSession() as session:
            await session.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                    "Accept-Encoding": "identity",
                },
                json={
                    "from": "Elite <elite@webstark.org>",
                    "to": [notify_email],
                    "subject": f"🔥 Neuer Lead: {lead_data['name']} – {lead_data['interest']}",
                    "html": f"""
                    <h2>Neuer Lead von Elite</h2>
                    <p><b>Name:</b> {lead_data['name']}</p>
                    <p><b>E-Mail:</b> {lead_data['email']}</p>
                    <p><b>Telefon:</b> {lead_data.get('phone', '-')}</p>
                    <p><b>Interesse:</b> {lead_data['interest']}</p>
                    <p><b>Zeitpunkt:</b> {lead_data['created_at']}</p>
                    """,
                },
                timeout=aiohttp.ClientTimeout(total=10),
            )
        logger.info(f"Lead-Benachrichtigung gesendet an {notify_email}")
    except Exception as e:
        logger.warning(f"Lead-Benachrichtigung fehlgeschlagen: {e}")


async def _notify_summary(summary: dict) -> None:
    """Sendet ein detailliertes Developer-Briefing per E-Mail an Webstark."""
    resend_key = os.environ.get("RESEND_API_KEY")
    notify_email = os.environ.get("NOTIFY_EMAIL", "icarus.mod56@gmail.com")
    if not resend_key:
        return

    try:
        # Professionelles Briefing-Template verwenden
        html_body = build_developer_briefing(summary)

        async with aiohttp.ClientSession() as session:
            await session.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                    "Accept-Encoding": "identity",
                },
                json={
                    "from": "Elite <elite@webstark.org>",
                    "to": [notify_email],
                    "subject": f"📊 Briefing: {summary['customer_name']} ({summary.get('interest_level', 'mittel')})",
                    "html": html_body,
                },
                timeout=aiohttp.ClientTimeout(total=10),
            )
        logger.info(f"Developer-Briefing gesendet an {notify_email}")
    except Exception as e:
        logger.warning(f"Developer-Briefing fehlgeschlagen: {e}")


async def _send_thankyou_email(to_email: str, name: str, topics: str, next_steps: str) -> None:
    """Sendet eine automatische Danke-Email an den Kunden nach dem Gespräch."""
    resend_key = os.environ.get("RESEND_API_KEY")
    if not resend_key:
        return

    try:
        html_body = build_thankyou_email(name, topics, next_steps)

        async with aiohttp.ClientSession() as session:
            await session.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                    "Accept-Encoding": "identity",
                },
                json={
                    "from": "Elite <elite@webstark.org>",
                    "to": [to_email],
                    "subject": f"Danke für dein Interesse, {name}! – Webstark",
                    "html": html_body,
                },
                timeout=aiohttp.ClientTimeout(total=10),
            )
        logger.info(f"Danke-Email gesendet an {to_email}")
    except Exception as e:
        logger.warning(f"Danke-Email fehlgeschlagen: {e}")


async def _save_to_db(clerk_user_id: str, user_name: str, user_email: str,
                      topics: str, action_items: str, interest_level: str) -> None:
    """Speichert die Beratungs-Zusammenfassung über die Webstark-API in der DB."""
    api_secret = os.environ.get("ELITE_API_SECRET")
    api_base = os.environ.get("WEBSTARK_API_URL", "https://webstark.org")
    if not api_secret:
        logger.info("ELITE_API_SECRET fehlt – DB-Speicherung übersprungen.")
        return

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{api_base}/api/elite/conversations",
                headers={
                    "x-elite-secret": api_secret,
                    "Content-Type": "application/json",
                    "Accept-Encoding": "identity",
                },
                json={
                    "clerkUserId": clerk_user_id,
                    "userName": user_name or None,
                    "userEmail": user_email or None,
                    "topics": topics,
                    "actionItems": action_items,
                    "interestLevel": interest_level,
                },
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.status in (200, 201):
                    logger.info(f"SUCCESS: Beratung in DB gespeichert für {clerk_user_id[:8]}...")
                else:
                    error = await resp.text()
                    logger.warning(f"DB-Speicherung HTTP {resp.status}: {error}")
    except Exception as e:
        logger.warning(f"DB-Speicherung fehlgeschlagen: {e}")


def _get_config():
    """Lädt die aktuelle Konfiguration konsistent aus AppData/Bundled Fallback."""
    try:
        return load_config()
    except Exception:
        return {"systemAccess": 1}


def _allowed_write_roots() -> list[str]:
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    home = os.path.expanduser("~")
    roots = [
        base_dir,
        get_data_dir("data"),
        os.path.join(home, ".claude", "PAI"),
        os.path.join(home, "PAI"),
    ]
    return [os.path.abspath(root) for root in roots]


def _is_path_allowed_for_write(target_path: str) -> bool:
    abs_target = os.path.abspath(target_path)
    for root in _allowed_write_roots():
        try:
            common = os.path.commonpath([abs_target, root])
            if common == root:
                return True
        except ValueError:
            continue
    return False


def _system_access_level() -> int:
    config = _get_config()
    try:
        return int(config.get("systemAccess", 1))
    except Exception:
        return 1


async def _guard_system_access(context: RunContext, capability: str, target: str = "") -> str | None:
    level = _system_access_level()
    # 0 = read-only, 1 = normal, 2 = elevated
    if level <= 0 and capability in {"shell_write", "desktop_control", "process_kill", "file_write", "browser_automation"}:
        await emit_log(context, "error", f"Systemzugriff blockiert (Read-Only): {capability} {target}".strip())
        return "Fehler: Der Systemzugriff ist auf Read-Only gesetzt. Aktion blockiert."
    return None

# ============================================================
# TOOL 8: System-Kommando ausführen
# Ermöglicht Elite, Befehle direkt auf dem PC auszuführen.
# ============================================================
@function_tool()
async def execute_system_command(context: RunContext, command: str) -> str:
    """Führe ein System-Kommando (PowerShell/CMD) auf dem PC aus.
    Nutze dies zum Öffnen von Apps, System-Checks oder Dateioperationen.
    Frage bei gefährlichen Befehlen (Löschen) vorher um Erlaubnis.

    Args:
        command: Das auszuführende Kommando, z.B. 'start notepad' oder 'dir'
    """
    blocked = await _guard_system_access(context, "shell_write", command)
    if blocked:
        # allow explicit safe read commands in read-only mode
        # Erlaube nur 'dir', 'ls', 'type' etc.
        safe_commands = ["dir", "ls", "get-process", "systeminfo", "whoami", "hostname"]
        if not any(command.lower().strip().startswith(sc) for sc in safe_commands):
            return blocked

    await emit_log(context, "tool_call", f"Führe Systembefehl aus: {command}")
    # MC Log
    mc_url = get_mc_url()
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(f"{mc_url}/api/activity", headers={"X-Agent-ID": "elite-agent"}, json={"actor": "elite-agent", "action": "SHELL", "description": f"Kommando: {command}"}, timeout=1)
    except: pass

    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        # Windows-spezifisches Decoding (cp1252 ist Standard auf DE-Windows)
        # Wir nutzen errors='replace', damit Sonderzeichen keinen Crash verursachen
        result = stdout.decode('cp1252', errors='replace').strip()
        error = stderr.decode('cp1252', errors='replace').strip()
        
        if error:
            logger.warning(f"Shell-Error: {error}")
            await emit_log(context, "error", f"Fehler bei {command}: {error[:50]}...")
            return f"Kommando ausgeführt mit Fehlern:\n{error}\nOutput: {result}"
        
        await emit_log(context, "result", f"Befehl erfolgreich abgeschlossen.")
        return f"Erfolgreich ausgeführt. Output:\n{result}" if result else "Kommando erfolgreich ohne Output ausgeführt."
    except Exception as e:
        return f"Fehler bei der Ausführung: {str(e)}"

@function_tool()
async def open_website(context: RunContext, url: str) -> str:
    """Öffnet eine Webseite im Browser mit der angegebenen URL.
    Nutze dies IMMER, wenn der Nutzer eine Webseite, Domain oder URL öffnen will
    (z.B. 'öffne webstark.org', 'geh zu https://github.com').
    NICHT launch_app('brave') ohne URL — sonst öffnet sich nur ein leerer Browser.

    Args:
        url: URL oder Domain, z.B. https://webstark.org oder webstark.org
    """
    context.disallow_interruptions()
    await emit_log(context, "tool_call", f"Öffne Webseite: {url}")
    try:
        opened = _open_url_in_browser(url)
        return f"Webseite geöffnet: {opened}"
    except Exception as e:
        logger.error(f"open_website Fehler: {e}")
        return f"Fehler beim Öffnen der Webseite: {str(e)}"


@function_tool()
async def open_file_or_url(context: RunContext, path_or_url: str) -> str:
    """Öffnet eine Datei, einen Ordner oder eine URL.
    Für Webseiten bevorzugt open_website nutzen. Für Dateien/Ordner: absoluter Pfad.

    Args:
        path_or_url: Absoluter Pfad zur Datei/Ordner oder eine URL (http://...).
    """
    context.disallow_interruptions()
    raw = (path_or_url or "").strip()
    try:
        looks_like_url = (
            raw.lower().startswith(("http://", "https://"))
            or ("." in raw and " " not in raw and not os.path.isfile(raw))
        )
        if looks_like_url:
            opened = _open_url_in_browser(raw)
            return f"Webseite geöffnet: {opened}"

        if not os.path.exists(raw):
            return f"Fehler: Der Pfad '{raw}' konnte nicht gefunden werden."

        os.startfile(raw)
        return f"'{raw}' wurde erfolgreich mit dem Standard-Programm geöffnet."
    except Exception as e:
        return f"Fehler beim Öffnen: {str(e)}"

# ============================================================
# TOOL 9: Desktop-Steuerung (Maus & Tastatur)
# ============================================================
@function_tool()
async def control_desktop(
    context: RunContext, 
    action: str, 
    text: str = "", 
    x: int = None, 
    y: int = None
) -> str:
    """Steuere Maus und Tastatur des PCs.
    Mögliche Aktionen: 'type' (Text schreiben), 'click' (Klick an x,y), 
    'press' (Taste drücken), 'move' (Maus bewegen).

    Args:
        action: 'type', 'click', 'press', 'move'
        text: Der zu schreibende Text oder die Taste (z.B. 'enter', 'tab')
        x: X-Koordinate für Klicks/Bewegungen
        y: Y-Koordinate für Klicks/Bewegungen
    """
    context.disallow_interruptions()
    blocked = await _guard_system_access(context, "desktop_control", action)
    if blocked:
        return blocked
    # MC Log
    mc_url = get_mc_url()
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(f"{mc_url}/api/activity", headers={"X-Agent-ID": "elite-agent"}, json={"actor": "elite-agent", "action": "CONTROL", "description": f"Desktop Action: {action} {text}"}, timeout=1)
    except: pass

    try:
        if action == "type":
            pyautogui.write(text, interval=0.05)
            return f"Text '{text}' geschrieben."
        elif action == "click":
            if x is not None and y is not None:
                pyautogui.click(x, y)
                return f"Geklickt auf Position {x}, {y}."
            pyautogui.click()
            return "Klick ausgeführt an aktueller Position."
        elif action == "press":
            pyautogui.press(text)
            return f"Taste '{text}' gedrückt."
        elif action == "hotkey":
            # Unterstützt Kombinationen wie 'alt+f4'
            keys = text.split('+')
            pyautogui.hotkey(*keys)
            return f"Hotkey '{text}' ausgeführt."
        elif action == "move":
            if x is not None and y is not None:
                pyautogui.moveTo(x, y, duration=0.2)
                return f"Maus bewegt nach {x}, {y}."
            return "Fehlende Koordinaten für 'move'."
        return "Unbekannte Aktion."
    except Exception as e:
        return f"Desktop-Steuerung fehlgeschlagen: {str(e)}"

# ============================================================
# TOOL 10: Screenshot erstellen (Vision)
# ============================================================
@function_tool()
async def capture_screen(context: RunContext) -> str:
    """Erstellt einen Screenshot des aktuellen Bildschirms und analysiert ihn mit KI-Vision.
    Elite kann so 'sehen', was auf dem Desktop passiert.
    """
    # Schritt 1: Screenshot erstellen
    try:
        logger.info("Schritt 1: Screenshot wird erstellt...")
        screenshot = pyautogui.screenshot()
        logger.info(f"Screenshot OK: {screenshot.size[0]}x{screenshot.size[1]}")
    except Exception as e:
        logger.error(f"Screenshot fehlgeschlagen: {e}")
        return f"Screenshot konnte nicht erstellt werden: {str(e)}"

    # Schritt 2: Bild speichern
    try:
        img_dir = get_screenshots_dir()
        path = os.path.join(img_dir, f"screen_{datetime.now().strftime('%H%M%S')}.png")
        screenshot.save(path)
        logger.info(f"Gespeichert: {path}")
    except Exception as e:
        logger.error(f"Speichern fehlgeschlagen: {e}")
        return f"Screenshot erstellt, konnte aber nicht gespeichert werden: {str(e)}"

    # Schritt 3: Bild verkleinern (max 2048px Breite für bessere Details) und als JPEG komprimieren
    try:
        img = screenshot.copy()
        max_width = 2048 # Erhöht für bessere Lesbarkeit
        if img.width > max_width:
            ratio = max_width / img.width
            new_size = (max_width, int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)
            logger.info(f"Verkleinert auf {new_size[0]}x{new_size[1]}")

        # Konvertierung zu RGB (JPEG unterstützt kein RGBA/Transparenz)
        img = img.convert("RGB")
        
        # Als JPEG mit Kompression kodieren (viel kleiner als PNG)
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=70)
        img_bytes = buffered.getvalue()
        img_str = base64.b64encode(img_bytes).decode("utf-8")
        logger.info(f"Base64 Payload: {len(img_str)} Zeichen ({len(img_bytes) / 1024:.0f} KB)")
    except Exception as e:
        logger.error(f"Bild-Kodierung fehlgeschlagen: {e}")
        return f"Screenshot erstellt unter {path}, aber Bild-Konvertierung fehlgeschlagen: {str(e)}"

    # Schritt 4: GPT-4o Vision Analyse
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return f"Screenshot erstellt unter {path}, aber keine Vision-Analyse möglich (API Key fehlt)."

    try:
        logger.info("Schritt 4: Sende an GPT-4o Vision...")
        timeout = aiohttp.ClientTimeout(total=45)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept-Encoding": "identity"
                },
                json={
                    "model": "gpt-4o",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Beschreibe präzise auf Deutsch, was auf diesem Desktop-Screenshot zu sehen ist. Liste alle sichtbaren Fenster, Icons und UI-Elemente auf. Wenn Text in Fenstern erkennbar ist (z.B. Programmnamen oder Webinhalte), nenne diese ebenfalls."},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_str}", "detail": "high"}}
                            ]
                        }
                    ],
                    "max_tokens": 800
                },
            ) as resp:
                if resp.status != 200:
                    err_body = await resp.text()
                    logger.error(f"Vision API Error {resp.status}: {err_body[:300]}")
                    return f"Screenshot erstellt unter {path}, aber Vision-Analyse fehlgeschlagen (HTTP {resp.status})."
                
                data = await resp.json()
                if "choices" not in data or not data["choices"]:
                    logger.error(f"Unerwartete API-Antwort: {str(data)[:300]}")
                    return f"Screenshot erstellt unter {path}, aber die Antwort der KI war unvollständig."
                    
                description = data["choices"][0]["message"]["content"]
                logger.info(f"Vision-Analyse abgeschlossen: {description[:80]}...")

                import time
                file_basename = os.path.basename(path)
                new_entry = {
                    "id": f"img_{int(time.time())}",
                    "timestamp": int(time.time() * 1000),
                    "src": f"/api/elite/gallery/image?file={file_basename}",
                    "labels": [(description[:30] + "...") if len(description) > 30 else description],
                    "confidence": 0.95,
                    "analysis": {"description": description, "filename": file_basename},
                }
                try:
                    gallery_path = os.path.join(img_dir, "gallery.json")
                    gallery_data = []
                    if os.path.exists(gallery_path):
                        with open(gallery_path, "r", encoding="utf-8") as gf:
                            content = gf.read().strip()
                            if content:
                                gallery_data = json.loads(content)
                    gallery_data.insert(0, new_entry)
                    with open(gallery_path, "w", encoding="utf-8") as gf:
                        json.dump(gallery_data[:100], gf, indent=2)
                    await _publish_captured_image(context, new_entry)
                    room = get_room_from_context(context)
                    if room:
                        open_payload = json.dumps({
                            "type": "widget_control",
                            "action": "open",
                            "widgetId": "imageGrid",
                        })
                        await room.local_participant.publish_data(open_payload.encode("utf-8"))
                except Exception as ge:
                    logger.error(f"Fehler beim Galerie-Update (Screenshot): {ge}")
                    await _publish_captured_image(context, new_entry)

                # Screenshot automatisch öffnen (Nutzerwunsch)
                try:
                    os.startfile(path)
                except Exception as e:
                    logger.warning(f"Konnte Screenshot nicht automatisch öffnen: {e}")
                
                return f"Screenshot erstellt und geöffnet unter: {path}. Analyse: {description}"

    except asyncio.TimeoutError:
        logger.error("Vision API Timeout (30s)")
        return f"Screenshot erstellt unter {path}, aber die KI-Analyse hat zu lange gedauert (Timeout)."
    except Exception as e:
        logger.error(f"Vision API Exception: {str(e)}")
        return f"Screenshot erstellt unter {path}, aber Analyse fehlgeschlagen: {str(e)}"

# ============================================================
# TOOL 11: Video-Stream Analyse (Eyes for AI)
# ============================================================
@function_tool()
async def analyze_video_stream(context: RunContext) -> str:
    """Analysiert den aktuellen Video-Stream im Raum.
    HINWEIS: Für lokale Webcams (wie Iriun) nutze stattdessen IMMER 'capture_webcam'.
    """
    return "Dieses Tool ist aktuell in Wartung. Bitte nutze 'capture_webcam' für deine Handy-Kamera oder 'capture_screen' für den Desktop."

# ============================================================
# TOOL 12: System-Informationen abrufen
# ============================================================
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
        windows = gw.getAllWindows()
        
        window_list = []
        for w in windows:
            if w.title.strip() and w.width > 10 and w.height > 10:
                window_list.append(
                    f"- '{w.title}' (Pos: {w.left},{w.top}, Größe: {w.width}x{w.height})"
                )
        
        if not window_list:
            return "Keine aktiven Fenster mit Titeln gefunden."
            
        summary = "Aktuell geöffnete Fenster (mit Koordinaten):\n" + "\n".join(window_list[:15])
        summary += "\n\nHINWEIS: Nutze diese Koordinaten für präzise Klicks mit control_desktop."
        return summary
    except Exception as e:
        logger.error(f"Fehler beim Fenster-Scan: {e}")
        return f"Konnte Fensterliste nicht abrufen: {str(e)}"

# ============================================================
# TOOL 14: Langzeitgedächtnis (Self-Learning)
# ============================================================
@function_tool()
async def update_agent_memory(context: RunContext, information: str, category: str = "general") -> str:
    """Speichere wichtige Informationen über den Nutzer oder das System dauerhaft.
    Nutze dies, um dir Vorlieben, Pfade zu Programmen oder gelernte Abläufe zu merken.
    
    Args:
        information: Die Information, die gespeichert werden soll (z.B. 'NotebookLM liegt auf dem Desktop')
        category: Kategorie ('preferences', 'system', 'workflow', 'general')
    """
    try:
        memory_file = get_memory_file()
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = f"\n- [{timestamp}] [{category.upper()}] {information}"

        with open(memory_file, "a", encoding="utf-8") as f:
            f.write(entry)

        try:
            from pai_paths import mirror_voice_memory_to_pai

            mirror_voice_memory_to_pai(information, category)
        except Exception as mirror_err:
            logger.warning("PAI voice memory mirror failed: %s", mirror_err)

        logger.info(f"Memory updated ({memory_file}): {information}")
        return f"Ich habe mir das gemerkt: {information}"
    except PermissionError:
        return (
            "Konnte Information nicht speichern: Zugriff verweigert. "
            "Bitte Elite einmal neu starten oder als normaler Windows-Benutzer (nicht schreibgeschützter Ordner) ausführen."
        )
    except OSError as e:
        return f"Konnte Information nicht speichern: {e}"
    except Exception as e:
        return f"Konnte Information nicht speichern: {str(e)}"

@function_tool()
async def read_agent_memory(context: RunContext) -> str:
    """Lies dein Langzeitgedächtnis (MEMORY.md).
    Nutze dies beim Start oder wenn du Informationen über den Nutzer/System suchst,
    die du dir früher gemerkt hast.
    """
    try:
        memory_file = get_memory_file()
        if not os.path.exists(memory_file) or os.path.getsize(memory_file) == 0:
            return "Mein Gedächtnis ist noch leer. Ich muss erst Dinge lernen!"

        with open(memory_file, "r", encoding="utf-8") as f:
            content = f.read()
        return f"Hier ist mein bisheriges Wissen:\n{content}"
    except Exception as e:
        return f"Fehler beim Lesen des Gedächtnisses: {str(e)}"

@function_tool()
async def read_file(context: RunContext, path: str) -> str:
    """Lese den Inhalt einer Text- oder Markdown-Datei (z.B. eines Skills).
    Nutze dieses Tool, um Skill-Dateien oder Anleitungen zu lesen, um die genauen Abläufe zu kennen.

    Args:
        path: Der absolute Pfad zur Datei.
    """
    await emit_log(context, "thinking", f"Lese Datei: {os.path.basename(path)}...")
    if not os.path.exists(path):
        return f"Fehler: Datei existiert nicht unter {path}"
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        return f"Fehler beim Lesen der Datei: {e}"

@function_tool()
async def write_file(context: RunContext, path: str, content: str) -> str:
    """Schreibt oder aktualisiert den Inhalt einer Text- oder Markdown-Datei (z.B. SOUL.md, USER.md, ACCESS_POLICY.md oder HEARTBEAT.md).
    Nutze dieses Tool, um Konfigurationsdateien, Dokumente oder Notizen im Workspace oder PAI-Verzeichnis anzulegen oder zu aktualisieren.

    Args:
        path: Der absolute Pfad zur Zieldatei (oder ein relativer Pfad im Workspace).
        content: Der vollständige Inhalt, der in die Datei geschrieben werden soll.
    """
    await emit_log(context, "thinking", f"Schreibe Datei: {os.path.basename(path)}...")
    blocked = await _guard_system_access(context, "file_write", path)
    if blocked:
        return blocked
    try:
        # Falls ein relativer Pfad übergeben wurde, machen wir ihn absolut relativ zum Workspace
        if not os.path.isabs(path):
            base_dir = os.path.dirname(os.path.dirname(__file__))
            path = os.path.abspath(os.path.join(base_dir, path))

        if not _is_path_allowed_for_write(path):
            await emit_log(context, "error", f"Schreibzugriff außerhalb Allowlist blockiert: {path}")
            return (
                "Fehler: Schreibzugriff außerhalb der erlaubten Pfade blockiert. "
                "Erlaubt sind Workspace, Elite AppData und PAI-Verzeichnisse."
            )
            
        # Parent-Verzeichnisse erstellen, falls sie nicht existieren
        os.makedirs(os.path.dirname(path), exist_ok=True)
        
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
            
        await emit_log(context, "result", f"Datei erfolgreich gespeichert: {os.path.basename(path)}")
        return f"Datei erfolgreich gespeichert unter {path}"
    except Exception as e:
        logger.error(f"Fehler beim Schreiben der Datei {path}: {e}")
        return f"Fehler beim Schreiben der Datei: {e}"

@function_tool()
async def close_window(context: RunContext, title_keywords: str) -> str:
    """Schließt ein Fenster oder Programm basierend auf Stichworten im Titel.
    Nutze dies, wenn der Nutzer sagt 'Schließe den Browser' oder 'Beende Notepad'.
    NICHT für Elite/Jarvis – dafür close_all_desktop_windows.
    
    Args:
        title_keywords: Stichwort des Fensters (z.B. 'Chrome', 'Notepad', 'Edge')
    """
    if _is_elite_window_keyword(title_keywords):
        return (
            "Elite wird nicht geschlossen. Nutze close_all_desktop_windows, "
            "um andere Fenster zu schließen und Elite in die Systemleiste zu legen."
        )
    try:
        import pygetwindow as gw
        import subprocess
        
        # 1. Versuch: Über pygetwindow
        windows = gw.getWindowsWithTitle('')
        closed_any = False
        for w in windows:
            if _is_elite_window_title(w.title):
                continue
            if title_keywords.lower() in w.title.lower():
                w.close()
                closed_any = True
                logger.info(f"Fenster geschlossen: {w.title}")
        
        if closed_any:
            return f"Ich habe das Fenster '{title_keywords}' erfolgreich geschlossen."
            
        # 2. Versuch: Hard Kill via Taskkill (für Browser etc.)
        if "chrome" in title_keywords.lower():
            subprocess.run(["taskkill", "/IM", "chrome.exe", "/F"], capture_output=True)
            return "Ich habe alle Chrome-Prozesse beendet."
        elif "edge" in title_keywords.lower():
            subprocess.run(["taskkill", "/IM", "msedge.exe", "/F"], capture_output=True)
            return "Ich habe alle Edge-Prozesse beendet."
            
        return f"Ich konnte kein offenes Fenster mit dem Namen '{title_keywords}' finden."
    except Exception as e:
        logger.error(f"Fehler beim Schließen des Fensters: {e}")
        return f"Fehler beim Schließen: {str(e)}"

@function_tool()
async def get_user_paths(context: RunContext) -> str:
    """Gibt die absoluten Pfade zu den wichtigsten Windows-Ordnern zurück.
    Nutze dies, um Dateien in 'Downloads', 'Desktop' oder 'Dokumente' sicher zu finden.
    """
    import os
    home = os.path.expanduser("~")
    paths = {
        "Home": home,
        "Desktop": os.path.join(home, "Desktop"),
        "Downloads": os.path.join(home, "Downloads"),
        "Documents": os.path.join(home, "Documents"),
        "Pictures": os.path.join(home, "Pictures"),
    }
    
    summary = "Wichtige System-Pfade:\n"
    for name, path in paths.items():
        summary += f"- {name}: {path}\n"
    return summary

@function_tool()
async def capture_webcam(context: RunContext, camera_index: int = 0) -> str:
    """Macht ein Foto über die Webcam (z.B. Smartphone-Kamera via Iriun) und analysiert es.
    Nutze dies, wenn der Nutzer sagt 'Schau dir das an' oder 'Was siehst du durch meine Kamera?'.
    
    Args:
        camera_index: Der Index der Kamera (Standard 0). Falls 0 nicht geht, probiere 1 oder 2.
    """
    import cv2
    import os
    import time
    
    context.disallow_interruptions()
    
    screenshots_dir = get_screenshots_dir()
    
    filename = f"webcam_{int(time.time())}.jpg"
    path = os.path.join(screenshots_dir, filename)
    
    logger.info(f"Greife auf Kamera {camera_index} zu...")
    
    import asyncio
    import sys
    
    script_path = os.path.join(os.path.dirname(__file__), "capture_camera.py")
    
    proc = await asyncio.create_subprocess_exec(
        sys.executable, script_path, str(camera_index), path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20.0)
        out = stdout.decode('utf-8', errors='ignore').strip()
        
        if out.startswith("SUCCESS:"):
            used_index = out.split(":")[1]
            logger.info(f"Webcam-Bild gespeichert von Index {used_index}: {path}")
        else:
            return "Keine aktive Kamera mit Bildsignal gefunden. Bitte prüfe, ob Iriun verbunden ist."
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        return "Zeitüberschreitung: Die Kamera reagiert nicht. Sie könnte von einem anderen Programm blockiert sein."
    except Exception as e:
        return f"Fehler beim Speichern: {str(e)}"
        
    # Schritt 3: Analyse via OpenAI Vision
    try:
        import base64
        import aiohttp
        
        if not os.path.exists(path) or os.path.getsize(path) < 5000:
            return f"Bild wurde zwar gespeichert ({filename}), scheint aber beschädigt oder leer zu sein."

        with open(path, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return "Fehler: Kein OPENAI_API_KEY in der Konfiguration gefunden."

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "Accept-Encoding": "identity"
        }
        
        payload = {
            "model": "gpt-4o",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Beschreibe präzise auf Deutsch, was du durch diese Kamera siehst. Wenn es Text gibt, lies ihn vor. Antworte kurz und knackig."},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{base64_image}", "detail": "high"}
                        }
                    ]
                }
            ],
            "max_tokens": 300
        }
        
        logger.info(f"Sende Bild an OpenAI Vision API (Größe: {os.path.getsize(path)} Bytes)...")
        
        async with aiohttp.ClientSession() as session:
            async with session.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=60) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    description = data["choices"][0]["message"]["content"]
                    # 🖼️ Gallerie-Persistenz aktualisieren
                    try:
                        gallery_path = os.path.join(screenshots_dir, "gallery.json")
                        gallery_data = []
                        if os.path.exists(gallery_path):
                            with open(gallery_path, "r", encoding="utf-8") as gf:
                                content = gf.read().strip()
                                if content:
                                    gallery_data = json.loads(content)

                        new_entry = {
                            "id": f"img_{int(time.time())}",
                            "timestamp": int(time.time() * 1000),
                            "src": f"/api/elite/gallery/image?file={filename}",
                            "labels": [(description[:30] + "...") if len(description) > 30 else description],
                            "confidence": 0.95,
                            "analysis": {
                                "description": description,
                                "filename": filename
                            }
                        }
                        gallery_data.insert(0, new_entry)
                        with open(gallery_path, "w", encoding="utf-8") as gf:
                            json.dump(gallery_data[:100], gf, indent=2)

                        await _publish_captured_image(context, new_entry)
                        open_payload = json.dumps({
                            "type": "widget_control",
                            "action": "open",
                            "widgetId": "imageGrid",
                        })
                        room = get_room_from_context(context)
                        if room:
                            await room.local_participant.publish_data(open_payload.encode("utf-8"))
                            await room.local_participant.publish_data(json.dumps({
                                "type": "log_event",
                                "log": {"type": "result", "message": "Bild zur Gallerie hinzugefügt"},
                            }).encode("utf-8"))
                    except Exception as ge:
                        logger.error(f"Fehler beim Galerie-Update: {ge}")

                    return f"Webcam-Bild aufgenommen und unter {path} gespeichert. Analyse: {description}"
                else:
                    err_text = await resp.text()
                    logger.error(f"Vision API Fehler ({resp.status}): {err_text}")
                    return f"Bild gespeichert unter {path}, aber Vision-API meldet Fehler {resp.status}."
    except Exception as e:
        logger.error(f"Kritischer Fehler bei Webcam-Analyse: {str(e)}")
        return f"Bild gespeichert unter {path}, aber Analyse-Fehler: {str(e)}"


# ═══════════════════════════════════════════════════════════════
# Legacy Mission Control task tools — DEPRECATED (JARVIS MC → Hermes Agent).
# Kanban-Tasks entfallen; Nutze PAI Pulse / Hermes cron & session_search stattdessen.
# Hermes Gateway: Port 8642, Dashboard: 9119, HUD: 3000
# ═══════════════════════════════════════════════════════════════

_MC_DEPRECATED_MSG = (
    "Mission Control (Port 3001) wurde durch Hermes Agent ersetzt. "
    "Nutze PAI-Loops (Pulse 31337), Hermes-Sessions oder Sprachbefehle ohne Kanban-Tasks."
)

PULSE_API = os.environ.get("PAI_PULSE_URL", "http://localhost:31337")


@function_tool
async def hermes_ask(
    context: RunContext,
    message: str,
    context_hint: str = "",
) -> str:
    """Fragt Hermes Agent (Gateway Port 8642) — agentisch mit Tools, Memory und Multi-Step.

    Nutze dies für komplexe Recherche, Code-Analyse, PAI/Hermes-Memory oder Aufgaben,
    die mehrere Tool-Schritte brauchen. Elite (LiveKit) delegiert an Hermes.

    Args:
        message: Die Frage oder Aufgabe für Hermes.
        context_hint: Optionaler Kurzkontext (z.B. aktuelles Projekt).
    """
    from hermes_client import hermes_chat, probe_hermes_gateway

    if not await probe_hermes_gateway():
        return (
            "Hermes Gateway nicht erreichbar (Port 8642). "
            "START_JARVIS.bat ausführen oder in WSL: hermes gateway run"
        )

    user_text = message.strip()
    if context_hint.strip():
        user_text = f"{user_text}\n\n[Kontext von Elite]\n{context_hint.strip()}"

    try:
        reply, _session = await hermes_chat(
            [{"role": "user", "content": user_text}],
            timeout_seconds=240,
        )
        if not reply:
            return "Hermes lieferte keine Antwort."
        return reply[:8000]
    except Exception as exc:
        logger.error("hermes_ask failed: %s", exc)
        return f"Hermes-Fehler: {str(exc)[:500]}"


@function_tool
async def hermes_search_sessions(
    context: RunContext,
    query: str,
    limit: int = 8,
) -> str:
    """Durchsucht frühere Hermes-Sitzungen (FTS5 in state.db).

    Args:
        query: Suchbegriff oder Thema.
        limit: Max. Treffer (1–20).
    """
    import json
    import subprocess
    import sys
    from pathlib import Path

    lim = max(1, min(int(limit or 8), 20))
    script = Path(__file__).resolve().parents[1] / "scripts" / "hermes_session_search.py"
    if not script.is_file():
        return "hermes_session_search.py fehlt im Repo."

    try:
        proc = subprocess.run(
            [sys.executable, str(script), query.strip(), "--limit", str(lim)],
            capture_output=True,
            text=True,
            timeout=12,
            cwd=str(script.parents[1]),
        )
        data = json.loads(proc.stdout.strip() or "{}")
    except Exception as exc:
        return f"Hermes-Suche fehlgeschlagen: {exc}"

    if not data.get("ok"):
        return f"Keine Treffer oder DB fehlt: {data.get('error', data)}"

    results = data.get("results") or []
    if not results:
        return f"Keine Sessions zu «{query}»."

    lines = [f"Hermes-Session-Suche «{query}» ({len(results)} Treffer):"]
    for i, row in enumerate(results[:lim], 1):
        content = str(row.get("content", ""))[:200].replace("\n", " ")
        sid = row.get("session_id", "?")
        role = row.get("role", "?")
        lines.append(f"{i}. [{role}] session={sid}: {content}")
    return "\n".join(lines)


async def _pulse_request(
    method: str,
    endpoint: str,
    payload: dict | None = None,
    timeout_seconds: int = 8,
) -> tuple[int, dict | None]:
    url = f"{PULSE_API}{endpoint}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method.upper(),
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=timeout_seconds),
            ) as resp:
                data = None
                try:
                    data = await resp.json()
                except Exception:
                    data = None
                return resp.status, data
    except Exception:
        return 0, None


@function_tool
async def pai_start_novelty_run(
    context: RunContext,
    problem: str,
    quick_cycle: bool = True,
) -> str:
    """Startet einen PULSE Ideate/Novelty-Run (Dashboard: localhost:31337/agents → Ideate).

    Registriert den Run in novelty-state.json. Danach Ideate/CreateNovelty ausführen
    und Phasen per NoveltyState CLI abschließen.

    Args:
        problem: Problemstellung für die Ideation.
        quick_cycle: True = QuickCycle (schnell), False = Full Ideate.
    """
    payload = {"action": "start", "problem": problem, "quick": quick_cycle}
    status, data = await _pulse_request("POST", "/api/novelty", payload=payload)
    if status in (200, 201) and (data or {}).get("ok"):
        run = (data or {}).get("run", {})
        run_id = run.get("id", "?")
        return (
            f"Novelty-Run gestartet (ID: {run_id}). "
            f"Öffne {PULSE_API}/agents → Ideate. "
            f"Führe CreateNovelty/Ideate aus und schließe mit NoveltyState complete ab."
        )
    if status == 0:
        return (
            f"PULSE nicht erreichbar unter {PULSE_API}. "
            "Ist der Pulse-Daemon gestartet (Port 31337)?"
        )
    return f"PULSE Novelty API Fehler: HTTP {status} – {str(data)[:300]}"


@function_tool
async def pai_loop_control(
    context: RunContext,
    action: str,
    objective: str = "",
    mode: str = "algorithm",
) -> str:
    """Steuert zentrale PAI-Loops (start, stop, resume) über den Pulse-Daemon.

    Args:
        action: "start", "stop" oder "resume"
        objective: optionales Ziel/Task für den Loop
        mode: "algorithm", "ideate" oder "optimize"
    """
    normalized_action = (action or "").strip().lower()
    normalized_mode = (mode or "algorithm").strip().lower()
    if normalized_action not in {"start", "stop", "resume"}:
        return "Ungültige action. Erlaubt: start, stop, resume."

    if normalized_mode not in {"algorithm", "ideate", "optimize"}:
        normalized_mode = "algorithm"

    # Wenn action == "start" ist, erstellen wir zuerst den Loop über /api/loops/start
    if normalized_action == "start":
        task_title = objective.strip() or f"New {normalized_mode.capitalize()} loop"
        start_payload = {
            "task": task_title,
            "mode": normalized_mode,
            "problem": task_title,
        }
        status, start_data = await _pulse_request("POST", "/api/loops/start", payload=start_payload)
        if status == 0:
            return f"PAI Loop Start nicht erreichbar unter {PULSE_API}."
        if status >= 400:
            return f"Loop-Start Fehler (HTTP {status}): {str(start_data)[:260]}"
        
        # Nun aktivieren/starten wir den erstellten Loop sofort über /api/loops/control
        slug = (start_data or {}).get("slug")
        if not slug:
            return f"Loop wurde erstellt, aber kein Slug erhalten: {json.dumps(start_data)}"
            
        control_payload = {
            "action": "start",
            "prdFile": f"{slug}/ISA.md",
            "mode": normalized_mode,
            "source": "elite-agent",
        }
        status, control_data = await _pulse_request("POST", "/api/loops/control", payload=control_payload)
        if status == 0:
            return f"PAI Loop Control nicht erreichbar unter {PULSE_API} nach Erstellung."
        if status >= 400:
            return f"Loop-Control Aktivierungsfehler (HTTP {status}): {str(control_data)[:260]}"
            
        await emit_log(
            context,
            "result",
            f"PAI Loop '{task_title}' ({normalized_mode}) erfolgreich gestartet.",
        )
        return (
            f"PAI Loop '{normalized_mode}' wurde erfolgreich gestartet. "
            f"Slug: {slug}. Antwort: {json.dumps(control_data or {}, ensure_ascii=False)[:320]}"
        )
        
    else:
        # Für stop, pause, resume: Steuere den aktiven Loop über /api/loops/control
        payload = {
            "action": normalized_action,
            "mode": normalized_mode,
            "objective": objective.strip(),
            "source": "elite-agent",
        }
        status, data = await _pulse_request("POST", "/api/loops/control", payload=payload)
        if status == 0:
            return f"PAI Loop Control nicht erreichbar unter {PULSE_API}."
        if status >= 400:
            return f"Loop-Control Fehler (HTTP {status}): {str(data)[:260]}"

        await emit_log(
            context,
            "result",
            f"PAI Loop {normalized_action} ({normalized_mode}) bestätigt.",
        )
        return (
            f"PAI Loop '{normalized_mode}' wurde auf '{normalized_action}' gesetzt. "
            f"Antwort: {json.dumps(data or {}, ensure_ascii=False)[:320]}"
        )


@function_tool
async def pai_loop_status(context: RunContext) -> str:
    """Liefert den aktuellen Zustand von PAI-Loops/Work-State vom Pulse-Daemon."""
    status, data = await _pulse_request("GET", "/api/loops/status", timeout_seconds=5)
    if status == 0:
        return f"PAI Loop Status nicht erreichbar unter {PULSE_API}."
    if status >= 400:
        return f"Loop-Status Fehler (HTTP {status})."
    if not isinstance(data, dict):
        return "Loop-Status konnte nicht geparst werden."
    active = data.get("active") or data.get("running") or False
    phase = data.get("phase") or data.get("step") or "unknown"
    objective = data.get("objective") or data.get("task") or "n/a"
    progress = data.get("progress")
    return (
        f"PAI Loop Status: active={active}, phase={phase}, "
        f"progress={progress}, objective={objective}. "
        f"Raw: {json.dumps(data, ensure_ascii=False)[:380]}"
    )


@function_tool()
async def mc_create_task(
    context: RunContext,
    title: str,
    description: str = "",
    priority: str = "medium",
    labels: str = "",
) -> str:
    """Erstellt einen neuen Task im JARVIS Mission Control Kanban-Board.

    Args:
        title: Titel des Tasks (z.B. 'Bug in Login fixen').
        description: Optionale Beschreibung.
        priority: 'low', 'medium', 'high' oder 'critical'.
        labels: Komma-separierte Labels (z.B. 'frontend,bug').
    """
    return _MC_DEPRECATED_MSG
    import aiohttp

    payload = {
        "title": title,
        "description": description,
        "priority": priority,
        "labels": [l.strip() for l in labels.split(",") if l.strip()] if labels else [],
        "created_by": "elite-agent",
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{get_mc_api()}/tasks", json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status in (200, 201):
                    task = await resp.json()
                    task_id = task.get("id", "unbekannt")
                    logger.info(f"MC Task erstellt: {title} (ID: {task_id})")
                    return f"Task erstellt: '{title}' (ID: {task_id}, Priorität: {priority})"
                else:
                    text = await resp.text()
                    return f"Fehler beim Erstellen des Tasks: HTTP {resp.status} – {text[:200]}"
    except Exception as e:
        return f"Mission Control nicht erreichbar: {str(e)}"


@function_tool()
async def mc_list_tasks(context: RunContext, status: str = "") -> str:
    """Listet alle Tasks aus JARVIS Mission Control auf.

    Args:
        status: Optional: Nur Tasks mit diesem Status zeigen ('INBOX', 'IN_PROGRESS', 'DONE' etc.). Leer = alle.
    """
    return _MC_DEPRECATED_MSG
    import aiohttp
    # region agent log
    _debug_log_mc(
        "H2",
        "backend/tools.py:mc_list_tasks:entry",
        "mc_list_tasks called",
        {"status": status},
    )
    # endregion

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{get_mc_api()}/tasks", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    # region agent log
                    _debug_log_mc(
                        "H3",
                        "backend/tools.py:mc_list_tasks:http_status",
                        "mc_list_tasks non-200 response",
                        {"status_code": resp.status},
                    )
                    # endregion
                    return "Konnte Tasks nicht abrufen."
                tasks = await resp.json()

        if not tasks:
            return "Keine Tasks vorhanden."

        # Optional filtern
        if status:
            tasks = [t for t in tasks if t.get("status", "").upper() == status.upper()]
        # region agent log
        status_counts = {}
        for t in tasks:
            s = str(t.get("status", "")).upper() or "UNKNOWN"
            status_counts[s] = status_counts.get(s, 0) + 1
        _debug_log_mc(
            "H2",
            "backend/tools.py:mc_list_tasks:post_filter",
            "mc_list_tasks evaluated task statuses",
            {"requested_status": status, "result_count": len(tasks), "status_counts": status_counts},
        )
        # endregion

        if not tasks:
            return f"Keine Tasks mit Status '{status}' gefunden."

        lines = []
        for t in tasks[:15]:  # Max 15 anzeigen
            prio = t.get("priority", "?")
            s = t.get("status", "?")
            title = t.get("title", "Unbekannt")
            tid = t.get("id", "?")
            lines.append(f"• [{s}] {title} (Prio: {prio}, ID: {tid})")

        total = len(tasks)
        header = f"📋 {total} Task(s)" + (f" mit Status '{status}'" if status else "") + ":"
        return header + "\n" + "\n".join(lines)
    except Exception as e:
        return f"Mission Control nicht erreichbar: {str(e)}"


@function_tool()
async def mc_update_task_status(
    context: RunContext,
    task_id: str,
    new_status: str,
) -> str:
    """Ändert den Status eines Tasks im JARVIS Kanban-Board.

    Args:
        task_id: Die Task-ID (z.B. 'task-20260511-1778491809824').
        new_status: Neuer Status: 'INBOX', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'DONE' oder 'BLOCKED'.
    """
    return _MC_DEPRECATED_MSG
    import aiohttp

    valid = {"INBOX", "ASSIGNED", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"}
    # region agent log
    _debug_log_mc(
        "H3",
        "backend/tools.py:mc_update_task_status:entry",
        "mc_update_task_status called",
        {"task_id": task_id, "new_status": new_status},
    )
    # endregion
    if new_status.upper() not in valid:
        # region agent log
        _debug_log_mc(
            "H3",
            "backend/tools.py:mc_update_task_status:invalid_status",
            "Invalid task status received",
            {"task_id": task_id, "new_status": new_status},
        )
        # endregion
        return f"Ungültiger Status. Erlaubt: {', '.join(sorted(valid))}"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.patch(
                f"{get_mc_api()}/tasks/{task_id}",
                json={"status": new_status.upper()},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status == 200:
                    # region agent log
                    _debug_log_mc(
                        "H3",
                        "backend/tools.py:mc_update_task_status:success",
                        "Task status updated",
                        {"task_id": task_id, "new_status": new_status.upper(), "status_code": resp.status},
                    )
                    # endregion
                    logger.info(f"MC Task {task_id} → {new_status.upper()}")
                    return f"Task {task_id} wurde auf '{new_status.upper()}' gesetzt."
                else:
                    text = await resp.text()
                    # region agent log
                    _debug_log_mc(
                        "H3",
                        "backend/tools.py:mc_update_task_status:error_status",
                        "Task status update failed",
                        {"task_id": task_id, "new_status": new_status.upper(), "status_code": resp.status, "body": text[:160]},
                    )
                    # endregion
                    return f"Fehler: HTTP {resp.status} – {text[:200]}"
    except Exception as e:
        return f"Mission Control nicht erreichbar: {str(e)}"


@function_tool()
async def mc_complete_inbox_tasks(
    context: RunContext,
    limit: int = 50,
) -> str:
    """Schließt alle Tasks mit Status INBOX als DONE ab.

    Args:
        limit: Sicherheitslimit für Massen-Update (1-200).
    """
    return _MC_DEPRECATED_MSG
    safe_limit = max(1, min(int(limit or 50), 200))
    timeout = aiohttp.ClientTimeout(total=8)
    # region agent log
    _debug_log_mc(
        "H6",
        "backend/tools.py:mc_complete_inbox_tasks:entry",
        "mc_complete_inbox_tasks called",
        {"limit": safe_limit},
    )
    # endregion
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{get_mc_api()}/tasks") as resp:
                if resp.status != 200:
                    body = (await resp.text())[:200]
                    return f"Tasks konnten nicht geladen werden (HTTP {resp.status}): {body}"
                payload = await resp.json()

            tasks = _extract_mc_list_payload(payload, ("tasks", "items", "data"))
            inbox_tasks = [t for t in tasks if str(t.get("status", "")).upper() == "INBOX" and t.get("id")]
            # region agent log
            _debug_log_mc(
                "H6",
                "backend/tools.py:mc_complete_inbox_tasks:before",
                "Inbox tasks before completion",
                {"inbox_count": len(inbox_tasks), "total_tasks": len(tasks)},
            )
            # endregion

            if not inbox_tasks:
                return "Keine offenen Task-Inbox-Einträge gefunden (Status INBOX = 0)."

            target = inbox_tasks[:safe_limit]
            updated: list[str] = []
            failed: list[str] = []
            for task in target:
                task_id = str(task.get("id"))
                async with session.patch(
                    f"{get_mc_api()}/tasks/{urllib.parse.quote(task_id, safe='')}",
                    json={"status": "DONE", "updated_by": "elite-agent"},
                ) as patch_resp:
                    if patch_resp.status == 200:
                        updated.append(task_id)
                    else:
                        failed.append(f"{task_id} (HTTP {patch_resp.status})")

            async with session.get(f"{get_mc_api()}/tasks") as verify_resp:
                verify_payload = await verify_resp.json() if verify_resp.status == 200 else []
                verify_tasks = _extract_mc_list_payload(verify_payload, ("tasks", "items", "data"))
                remaining_inbox = sum(
                    1 for t in verify_tasks if str(t.get("status", "")).upper() == "INBOX"
                )
            # region agent log
            _debug_log_mc(
                "H6",
                "backend/tools.py:mc_complete_inbox_tasks:after",
                "Inbox tasks after completion",
                {
                    "updated_count": len(updated),
                    "failed_count": len(failed),
                    "remaining_inbox": remaining_inbox,
                },
            )
            # endregion
    except Exception as e:
        return f"Mission Control nicht erreichbar: {str(e)}"

    msg = (
        f"Task-Inbox abgeschlossen: {len(updated)} erfolgreich auf DONE gesetzt, "
        f"{len(failed)} fehlgeschlagen. Verbleibend INBOX: {remaining_inbox}."
    )
    if updated:
        msg += f" IDs: {', '.join(updated)}."
    if failed:
        msg += f" Fehler: {', '.join(failed)}."
    return msg


def _extract_mc_list_payload(payload: object, keys: tuple[str, ...]) -> list[dict]:
    """Normalisiert MC-Listenantworten (Array oder Objekt mit bekannter Liste)."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
    return []


@function_tool()
async def mc_list_messages(
    context: RunContext,
    unread_only: bool = False,
    limit: int = 20,
) -> str:
    """Listet Mission-Control-Nachrichten (optional nur ungelesene) auf.

    Args:
        unread_only: Nur ungelesene Nachrichten anzeigen.
        limit: Maximale Anzahl der zurückgegebenen Einträge (1-100).
    """
    return _MC_DEPRECATED_MSG
    import aiohttp

    safe_limit = max(1, min(int(limit or 20), 100))
    timeout = aiohttp.ClientTimeout(total=6)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{get_mc_api()}/messages") as resp:
                if resp.status != 200:
                    body = (await resp.text())[:200]
                    return f"Nachrichten konnten nicht geladen werden (HTTP {resp.status}): {body}"
                payload = await resp.json()
    except Exception as e:
        return f"Mission Control nicht erreichbar: {str(e)}"

    messages = _extract_mc_list_payload(payload, ("messages", "items", "data"))
    total = len(messages)
    unread_total = sum(1 for m in messages if m.get("read") is False)

    if unread_only:
        messages = [m for m in messages if m.get("read") is False]

    if not messages:
        if unread_only:
            return f"Keine ungelesenen Nachrichten. (gesamt: {total})"
        return "Keine Nachrichten vorhanden."

    selected = messages[:safe_limit]
    lines: list[str] = []
    for m in selected:
        mid = str(m.get("id", "?"))
        read_flag = "UNREAD" if m.get("read") is False else "READ"
        msg_type = str(m.get("type", "direct")).upper()
        sender = str(m.get("from", "?"))
        target = str(m.get("to", "?"))
        content = " ".join(str(m.get("content", "")).split())[:70]
        lines.append(f"• [{read_flag}] {mid} | {msg_type} {sender}→{target} | {content}")

    return (
        f"Nachrichten: gesamt {total}, ungelesen {unread_total}. "
        f"Angezeigt: {len(selected)}.\n" + "\n".join(lines)
    )


@function_tool()
async def mc_mark_messages_read(
    context: RunContext,
    message_ids: str = "",
    mark_all_unread: bool = True,
    limit: int = 50,
) -> str:
    """Markiert Mission-Control-Nachrichten als gelesen (abgeschlossen).

    Standard-Verhalten: alle aktuell ungelesenen Nachrichten auf gelesen setzen.

    Args:
        message_ids: Komma-separierte Message-IDs (optional).
        mark_all_unread: Wenn true und keine IDs übergeben wurden, werden alle ungelesenen markiert.
        limit: Sicherheitslimit für Massen-Update (1-200).
    """
    return _MC_DEPRECATED_MSG
    import aiohttp
    import urllib.parse

    safe_limit = max(1, min(int(limit or 50), 200))
    timeout = aiohttp.ClientTimeout(total=8)
    requested_ids = [x.strip() for x in message_ids.split(",") if x.strip()]
    # region agent log
    _debug_log_mc(
        "H1",
        "backend/tools.py:mc_mark_messages_read:entry",
        "mc_mark_messages_read called",
        {"message_ids_supplied": len(requested_ids), "mark_all_unread": bool(mark_all_unread), "limit": safe_limit},
    )
    # endregion

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{get_mc_api()}/messages") as resp:
                if resp.status != 200:
                    body = (await resp.text())[:200]
                    return f"Nachrichten konnten nicht geladen werden (HTTP {resp.status}): {body}"
                payload = await resp.json()

            messages = _extract_mc_list_payload(payload, ("messages", "items", "data"))
            before_unread = sum(1 for m in messages if m.get("read") is False)
            # region agent log
            _debug_log_mc(
                "H1",
                "backend/tools.py:mc_mark_messages_read:before",
                "Unread count before mark",
                {"before_unread": before_unread, "total_messages": len(messages)},
            )
            # endregion

            if requested_ids:
                available_ids = {str(m.get("id", "")) for m in messages}
                target_ids = [mid for mid in requested_ids if mid in available_ids]
                missing_ids = [mid for mid in requested_ids if mid not in available_ids]
            elif mark_all_unread:
                target_ids = [str(m.get("id")) for m in messages if m.get("read") is False and m.get("id")]
                missing_ids = []
            else:
                return "Keine Message-IDs angegeben und mark_all_unread=false."

            if not target_ids:
                if requested_ids:
                    return f"Keine gültigen Message-IDs gefunden. Fehlend: {', '.join(missing_ids)}"
                return f"Keine ungelesenen Nachrichten zum Markieren. (ungelesen: {before_unread})"

            target_ids = target_ids[:safe_limit]
            updated: list[str] = []
            failed: list[str] = []

            for mid in target_ids:
                encoded_id = urllib.parse.quote(mid, safe="")
                async with session.put(f"{get_mc_api()}/messages/{encoded_id}/read") as mark_resp:
                    if mark_resp.status == 200:
                        updated.append(mid)
                    else:
                        failed.append(f"{mid} (HTTP {mark_resp.status})")

            async with session.get(f"{get_mc_api()}/messages") as verify_resp:
                verify_payload = await verify_resp.json() if verify_resp.status == 200 else []
                verify_messages = _extract_mc_list_payload(
                    verify_payload, ("messages", "items", "data")
                )
                after_unread = sum(1 for m in verify_messages if m.get("read") is False)
                # region agent log
                _debug_log_mc(
                    "H1",
                    "backend/tools.py:mc_mark_messages_read:after",
                    "Unread count after mark",
                    {"before_unread": before_unread, "after_unread": after_unread, "updated_count": len(updated), "failed_count": len(failed)},
                )
                # endregion
    except Exception as e:
        return f"Mission Control nicht erreichbar: {str(e)}"

    parts = [
        f"Nachrichten markiert: {len(updated)} erfolgreich, {len(failed)} fehlgeschlagen.",
        f"Unread laut API: vorher {before_unread}, nachher {after_unread}.",
    ]
    if updated:
        parts.append("Geänderte IDs: " + ", ".join(updated))
    if missing_ids:
        parts.append("Nicht gefunden: " + ", ".join(missing_ids))
    if failed:
        parts.append("Fehler: " + ", ".join(failed))

    if updated and before_unread > 0 and after_unread >= before_unread:
        parts.append(
            "Hinweis: API-Unread-Zähler hat sich nicht reduziert; Read-Update wurde zwar bestätigt, "
            "aber die Listenansicht kann verzögert oder gecacht sein."
        )

    return " ".join(parts)


@function_tool()
async def mc_task_summary(context: RunContext) -> str:
    """Liefert eine stabile Mission-Control-Zusammenfassung für Tasks + Inbox.

    Nutzen bei Fragen wie:
    - "Wie viele Tasks habe ich?"
    - "Wie ist mein Task-Status?"
    - "Wie viele sind in der Inbox?"
    """
    return _MC_DEPRECATED_MSG
    timeout = aiohttp.ClientTimeout(total=5)
    tasks: list[dict] = []
    messages: list[dict] = []
    messages_status_note = ""

    try:
        # region agent log
        _debug_log_mc(
            "H4",
            "backend/tools.py:mc_task_summary:entry",
            "mc_task_summary called",
            {},
        )
        # endregion
        async with aiohttp.ClientSession(timeout=timeout) as session:
            tasks_req = session.get(f"{get_mc_api()}/tasks")
            messages_req = session.get(f"{get_mc_api()}/messages")
            task_resp, message_resp = await asyncio.gather(tasks_req, messages_req, return_exceptions=True)

            if isinstance(task_resp, Exception):
                raise task_resp

            async with task_resp:
                if task_resp.status != 200:
                    return f"Mission Control Tasks nicht verfügbar (HTTP {task_resp.status})."
                tasks_payload = await task_resp.json()
                tasks = _extract_mc_list_payload(tasks_payload, ("tasks", "items", "data"))

            if isinstance(message_resp, Exception):
                messages_status_note = "Nachrichten-Inbox derzeit nicht erreichbar."
            else:
                async with message_resp:
                    if message_resp.status == 200:
                        msg_payload = await message_resp.json()
                        messages = _extract_mc_list_payload(msg_payload, ("messages", "items", "data"))
                    else:
                        messages_status_note = (
                            f"Nachrichten-Inbox nicht verfügbar (HTTP {message_resp.status})."
                        )
    except Exception as e:
        return f"Mission Control nicht erreichbar: {str(e)}"

    total = len(tasks)
    status_counts: dict[str, int] = {}
    for task in tasks:
        status = str(task.get("status", "")).upper() or "UNKNOWN"
        status_counts[status] = status_counts.get(status, 0) + 1

    done = status_counts.get("DONE", 0)
    blocked = status_counts.get("BLOCKED", 0)
    inbox_tasks = status_counts.get("INBOX", 0)
    open_tasks = total - done
    mine = sum(
        1
        for t in tasks
        if str(t.get("assignee", "")).lower() in ("elite-agent", "elite", "jarvis")
    )
    unread_messages = sum(1 for m in messages if m.get("read") is False)
    total_messages = len(messages)
    # region agent log
    _debug_log_mc(
        "H2",
        "backend/tools.py:mc_task_summary:counts",
        "Computed mission control summary counts",
        {
            "total_tasks": total,
            "done": done,
            "blocked": blocked,
            "inbox_tasks": inbox_tasks,
            "open_tasks": open_tasks,
            "unread_messages": unread_messages,
            "total_messages": total_messages,
            "messages_status_note": messages_status_note,
        },
    )
    # endregion

    parts = [
        f"Mission Control: gesamt {total}, offen {open_tasks}, erledigt {done}, "
        f"blockiert {blocked}, mir zugewiesen {mine}, Task-Inbox (Status INBOX) {inbox_tasks}.",
    ]
    if messages_status_note:
        parts.append(messages_status_note)
    else:
        parts.append(
            f"Nachrichten-Inbox: {unread_messages} ungelesen von {total_messages} Nachrichten."
        )
    return " ".join(parts)


@function_tool()
async def mc_inbox_summary(context: RunContext) -> str:
    """Liefert die Inbox-Sicht inkl. Task-INBOX und Nachrichten-Inbox (ungelesen)."""
    return await mc_task_summary(context)

# ═══════════════════════════════════════════════════════════════
# T5: Universal Media Control
# ═══════════════════════════════════════════════════════════════

MUSIC_EXTENSIONS = (".mp3", ".wav", ".flac", ".m4a", ".ogg")
MUSIC_LIBRARY_CACHE = os.path.join(os.path.dirname(__file__), "music_library.json")


def _get_music_dir() -> str | None:
    preferred = os.path.join(os.path.expanduser("~"), "Music")
    legacy = r"C:\Users\ed\Music"
    if os.path.exists(legacy):
        return legacy
    if os.path.exists(preferred):
        return preferred
    return None


def _collect_music_files(music_dir: str, search_query: str = "") -> list[str]:
    found: list[str] = []
    query = search_query.lower().strip()
    for root, _, files in os.walk(music_dir):
        for file in files:
            if not file.lower().endswith(MUSIC_EXTENSIONS):
                continue
            if query and query not in file.lower():
                continue
            found.append(os.path.relpath(os.path.join(root, file), music_dir))
    return found


def _load_cached_music_paths() -> list[str]:
    if not os.path.exists(MUSIC_LIBRARY_CACHE):
        return []
    try:
        with open(MUSIC_LIBRARY_CACHE, "r", encoding="utf-8") as f:
            data = json.load(f)
        songs = data.get("songs", [])
        return [s for s in songs if isinstance(s, str)]
    except Exception as e:
        logger.warning(f"Musik-Cache konnte nicht geladen werden: {e}")
        return []


async def _sync_music_to_dashboard(context: RunContext, songs: list[str]) -> None:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://localhost:8001/music",
                json={"songs": songs},
                timeout=5,
            ):
                pass
    except Exception as bridge_err:
        print(f"DEBUG: Fehler bei HTTP-Übertragung: {bridge_err}")

    room = get_room_from_context(context)
    if room:
        try:
            await room.local_participant.publish_data(
                json.dumps({"type": "music_scan_complete"}).encode("utf-8")
            )
        except Exception:
            pass


def _resolve_song_path(song_path: str, music_dir: str | None) -> str:
    normalized = song_path.replace("/", os.sep)
    if os.path.isabs(normalized):
        return normalized
    base = music_dir or _get_music_dir() or os.path.join(os.path.expanduser("~"), "Music")
    return os.path.join(base, normalized)


async def _play_song_file(context: RunContext, song_path: str) -> str:
    music_dir = _get_music_dir()
    full_path = _resolve_song_path(song_path, music_dir)

    if not os.path.exists(full_path):
        return f"Datei nicht gefunden: {full_path}"

    try:
        os.startfile(full_path)
        await emit_log(context, "result", f"Spiele: {os.path.basename(full_path)}")
        return f"PLAY_SUCCESS: {os.path.basename(full_path)}"
    except Exception as e:
        return f"Konnte Song nicht abspielen: {str(e)}"


@function_tool
async def play_random_music(context: RunContext) -> str:
    """Spielt einen zufälligen Song aus der lokalen Musikbibliothek.
    Nutze dieses Tool bei 'spiele Musik', 'play music', 'Musik an' oder wenn der Nutzer
    Musik hören will, ohne einen konkreten Titel zu nennen."""
    await emit_log(context, "tool_call", "Wähle zufälligen Song...")

    music_dir = _get_music_dir()
    found: list[str] = _collect_music_files(music_dir) if music_dir else []

    if not found:
        found = _load_cached_music_paths()

    if found:
        if music_dir:
            await _sync_music_to_dashboard(context, found)
        pick = random.choice(found)
        return await _play_song_file(context, pick)

    # Fallback: YouTube-Musikmix
    yt_queries = ["music mix", "chill electronic music", "lofi hip hop"]
    query = random.choice(yt_queries)
    await emit_log(context, "thinking", "Keine lokale Bibliothek – öffne YouTube...")
    result = await youtube_search_ui(context, query)
    if "Fehler" not in result:
        return f"FALLBACK_YOUTUBE: {result}"

    # Letzter Fallback: Medientaste (falls Player bereits offen)
    return await media_control(context, "playpause")


@function_tool
async def media_control(
    context: RunContext,
    action: str,
    query: str = "",
) -> str:
    """Steuert die System-Medienwiedergabe (Spotify, YouTube, VLC etc.).
    Nutze dieses Tool, wenn der Nutzer Musik abspielen, pausieren oder skippen möchte.

    Args:
        action: 'playpause', 'next', 'prev', 'vol_up', 'vol_down' oder 'search_play'.
        query: Nur für 'search_play': Der Name des Songs oder der Playlist.
    """
    try:
        import pyautogui
        print(f"DEBUG: Media-Befehl empfangen: {action}")
        # Kurze Pause für Stabilität
        await asyncio.sleep(0.1)
        
        if action == 'playpause':
            # Versuch, Spotify zu fokussieren für bessere Zuverlässigkeit
            try:
                import pygetwindow as gw
                wins = [w for w in gw.getAllWindows() if "spotify" in w.title.lower()]
                if wins:
                    wins[0].activate()
                    await asyncio.sleep(0.5)
            except: pass
            
            pyautogui.press('playpause')
            return "Wiedergabe/Pause umgeschaltet."
        elif action == 'next':
            pyautogui.press('nexttrack')
            return "Nächster Titel."
        elif action == 'prev':
            pyautogui.press('prevtrack')
            return "Vorheriger Titel."
        elif action == 'search_play':
            # Nutzt Spotify Deep-Links für die Suche
            import urllib.parse
            query = context.function_arguments.get("query", "")
            if not query: return "Fehler: Kein Suchbegriff angegeben."
            encoded = urllib.parse.quote(query)
            os.startfile(f"spotify:search:{encoded}")
            # Kurze Pause und dann Enter/Play simulieren
            await asyncio.sleep(2.0)
            pyautogui.press('enter')
            await asyncio.sleep(0.5)
            pyautogui.press('playpause')
            return f"Suche nach '{query}' auf Spotify gestartet."
        elif action == 'vol_up':
            pyautogui.press('volumeup')
            pyautogui.press('volumeup')
            return "Lautstärke erhöht."
        elif action == 'vol_down':
            pyautogui.press('volumedown')
            pyautogui.press('volumedown')
            return "Lautstärke gesenkt."
        else:
            return f"Unbekannte Medien-Aktion: {action}"
    except Exception as e:
        return f"Fehler bei Medien-Steuerung: {str(e)}"

@function_tool
async def scan_music_library(context: RunContext, search_query: str = "") -> str:
    """Durchsucht den lokalen Musik-Ordner des Nutzers nach Songs.
    Nutze dieses Tool, wenn der Nutzer nach seiner Musik fragt oder ein Lied aus seiner Bibliothek spielen möchte.
    Bei allgemeinen Wünschen wie 'spiele Musik' nutze stattdessen 'play_random_music'.

    Args:
        search_query: Optionaler Filter (z.B. 'Queen' oder 'Rock'). Leer lassen für alle Songs.
    """
    music_dir = _get_music_dir()
    if not music_dir:
        return "Musik-Ordner nicht gefunden."

    try:
        found_files = _collect_music_files(music_dir, search_query)

        if not found_files:
            cached = _load_cached_music_paths()
            if search_query:
                q = search_query.lower()
                found_files = [s for s in cached if q in s.lower()]
            else:
                found_files = cached

        if not found_files:
            return f"Keine Musik gefunden, die zu '{search_query}' passt."

        await _sync_music_to_dashboard(context, found_files)

        if search_query:
            preview = found_files[:15]
            lines = "\n".join(f"- {p}" for p in preview)
            more = f"\n... und {len(found_files) - 15} weitere." if len(found_files) > 15 else ""
            return (
                f"SCAN_SUCCESS: {len(found_files)} Treffer für '{search_query}'.\n"
                f"Nutze play_local_song mit einem dieser Pfade:\n{lines}{more}"
            )

        sample = random.choice(found_files)
        return (
            f"SCAN_SUCCESS: {len(found_files)} Songs in der Bibliothek.\n"
            f"Für 'spiele Musik' ohne Titel: play_random_music.\n"
            f"Beispiel-Pfad für play_local_song: {sample}"
        )
    except Exception as e:
        return f"Fehler beim Scannen der Bibliothek: {str(e)}"


@function_tool
async def play_local_song(context: RunContext, song_path: str) -> str:
    """Spielt eine lokale Musikdatei mit dem Standard-Player ab.
    Nutze 'scan_music_library' für die Suche oder 'play_random_music' für Zufallswiedergabe.

    Args:
        song_path: Relativer Pfad zum Song (aus scan_music_library) oder absoluter Pfad.
    """
    return await _play_song_file(context, song_path)


# ============================================================
# TOOL 11: App-Intelligence (Windows Apps finden & starten)
# ============================================================
@function_tool()
async def list_installed_apps(context: RunContext, search_query: str = "") -> str:
    """Listet installierte Windows-Programme auf.
    Nutze dies, um herauszufinden, welche Apps verfügbar sind.
    
    Args:
        search_query: Optionaler Filter für den App-Namen.
    """
    await emit_log(context, "thinking", "Suche nach installierten Applikationen...")
    cmd = "powershell -Command \"Get-StartApps | ConvertTo-Json\""
    try:
        process = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if not stdout:
            return "Keine Apps gefunden (leere Antwort von PowerShell)."
            
        # Dynamische Kodierungserkennung
        try:
            decoded = stdout.decode('utf-8')
        except:
            decoded = stdout.decode('cp1252', errors='replace')
            
        data = json.loads(decoded)
        
        # Sicherstellen, dass data eine Liste ist (Get-StartApps liefert bei 1 App ein Dict)
        if isinstance(data, dict):
            data = [data]
        
        apps = []
        for app in data:
            name = app.get("Name", "Unbekannt")
            if search_query.lower() in name.lower():
                apps.append(f"- {name} (ID: {app.get('AppID')})")
        
        if not apps:
            return f"Keine Apps gefunden, die auf '{search_query}' passen."
            
        return "Installierte Applikationen:\n" + "\n".join(apps[:30])
    except Exception as e:
        logger.error(f"Error in list_installed_apps: {e}")
        return f"Fehler beim Abrufen der App-Liste: {str(e)}"

@function_tool()
async def launch_app(context: RunContext, app_name: str) -> str:
    """Startet eine Windows-App, ein Programm oder eine PWA (z.B. Spotify, Mail, Antigravity).
    Verifiziert aktiv den Prozess-Start, um Halluzinationen zu vermeiden.
    """
    blocked = await _guard_system_access(context, "desktop_control", app_name)
    if blocked:
        return blocked
    await emit_log(context, "tool_call", f"Starte App-Verifizierung für: {app_name}")
    import psutil
    import os
    
    # Bekannte PWA Mappings oder absolute Pfade
    pwa_map = {
        "spotify": r'"C:\Program Files (x86)\Microsoft\Edge\Application\msedge_proxy.exe" --profile-directory=Default --app-id=pjibgclleladliembfgfagdaldikeohf',
        "antigravity": r'"C:\Users\ed\AppData\Local\Programs\Antigravity\Antigravity.exe"',
        "antygravity": r'"C:\Users\ed\AppData\Local\Programs\Antigravity\Antigravity.exe"',
        "brave": r'"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"',
        "chrome": r'"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"',
    }

    name = (app_name or "").strip()
    media_target = _known_media_web_target(name)
    if media_target:
        label, url = media_target
        opened = _open_url_in_browser(url)
        await asyncio.sleep(2.0)
        return f"Web-App geöffnet: {label} ({opened})"

    # Domain/URL — nicht als App-Name behandeln
    if name.lower().startswith(("http://", "https://")) or (
        "." in name and " " not in name and not name.lower().endswith(".exe")
    ):
        try:
            opened = _open_url_in_browser(name)
            return f"Webseite geöffnet: {opened}"
        except Exception as e:
            return f"Fehler beim Öffnen der URL: {e}"

    # 1. Spezialfall: Bekannte PWAs oder URLs
    if name.lower() in pwa_map:
        target = pwa_map[name.lower()]
        if target.startswith("http"):
            logger.info(f"Öffne Web-App: {target}")
            _open_url_in_browser(target)
        else:
            logger.info(f"PWA-Direktstart: {target}")
            subprocess.Popen(target, shell=True)
        await asyncio.sleep(2.0)
        return f"ERFOLG: '{name}' wurde gestartet."

    else:
        # 2. Standardweg: Windows App Index
        find_cmd = (
            f"powershell -Command \"Get-StartApps | Where-Object {{ $_.Name -like '*{app_name}*' }} | "
            "Select-Object -First 1 -ExpandProperty AppID\""
        )
        process = await asyncio.create_subprocess_shell(find_cmd, stdout=asyncio.subprocess.PIPE)
        stdout, _ = await process.communicate()
        app_id = stdout.decode('cp1252', errors='replace').strip()
        
        if app_id:
            launch_cmd = f"powershell -Command \"start 'shell:AppsFolder\\{app_id}'\""
            await asyncio.create_subprocess_shell(launch_cmd)
            await asyncio.sleep(2.0)
        else:
            # Letzter Versuch: Direkter Start via PATH
            subprocess.Popen(f"start {app_name}", shell=True)
            await asyncio.sleep(2.0)

    # 3. VERIFIZIERUNG: Läuft der Prozess jetzt wirklich?
    # Wir suchen nach dem Namen in der Prozessliste
    search_term = app_name.lower()
    if search_term == "spotify": search_term = "spotify" # Spotify heißt oft auch so
    
    found = False
    for p in psutil.process_iter(['name']):
        try:
            if search_term in p.info['name'].lower():
                found = True
                break
        except: continue
        
    if found:
        return f"ERFOLG: '{app_name}' wurde gestartet und der Prozess ist aktiv."
    else:
        return f"FEHLER: Der Startbefehl für '{app_name}' wurde gesendet, aber der Prozess konnte nicht in der Systemliste gefunden werden. Bitte prüfe den Pfad manuell."

# ============================================================
# TOOL 12: Prozess-Management
# ============================================================
@function_tool()
async def manage_process(context: RunContext, action: str, process_name: str = "") -> str:
    """Verwalte laufende Prozesse auf dem PC.
    Aktionen: 'list' (zeigt Top 10 CPU-Prozesse), 'kill' (beendet Prozess).
    
    Args:
        action: 'list' oder 'kill'
        process_name: Name des Prozesses bei 'kill' (z.B. 'chrome')
    """
    import psutil
    if action == "list":
        procs = sorted(psutil.process_iter(['name', 'cpu_percent']), key=lambda p: p.info['cpu_percent'], reverse=True)[:10]
        result = "Top 10 CPU Prozesse:\n"
        for p in procs:
            result += f"- {p.info['name']}: {p.info['cpu_percent']}%\n"
        return result
    
    elif action == "kill":
        blocked = await _guard_system_access(context, "process_kill", process_name)
        if blocked:
            return blocked
        await emit_log(context, "warning", f"Versuche Prozess zu beenden: {process_name}")
        killed = 0
        for p in psutil.process_iter(['name']):
            if process_name.lower() in p.info['name'].lower():
                p.terminate()
                killed += 1
        return f"{killed} Instanz(en) von '{process_name}' wurden beendet."
    
    return "Ungültige Aktion."

# ============================================================
# TOOL 13: Agenten-Orchestrierung (Spawning)
# ============================================================
@function_tool()
async def spawn_agent_worker(context: RunContext, script_path: str, args: str = "") -> str:
    """Startet einen spezialisierten Sub-Agenten oder ein Hintergrund-Skript.
    Nutze dies, wenn du eine Aufgabe delegieren möchtest, die parallel laufen soll.
    
    Args:
        script_path: Pfad zum Python-Skript (relativ zum Root oder absolut).
        args: Zusätzliche Argumente für das Skript.
    """
    await emit_log(context, "tool_call", f"Spawne Sub-Agent: {script_path}")
    
    # Absoluten Pfad sicherstellen
    if not os.path.isabs(script_path):
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        script_path = os.path.join(base_dir, script_path)
        
    if not os.path.exists(script_path):
        return f"Fehler: Skript '{script_path}' nicht gefunden."
        
    try:
        # Starten als unabhängiger Hintergrundprozess
        subprocess.Popen(
            ["python", script_path] + args.split(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True # Windows-spezifisch für echtes Detaching
        )
        return f"Sub-Agent '{os.path.basename(script_path)}' wurde erfolgreich im Hintergrund gestartet."
    except Exception as e:
        return f"Fehler beim Spawnen des Agenten: {e}"

# ============================================================
# TOOL 14: Browser-Automatisierung (Playwright)
# ============================================================
@function_tool()
async def browser_automation(
    context: RunContext, 
    actions: list[dict], 
    headless: bool = False
) -> str:
    """Führe automatisierte Browser-Aktionen aus (z.B. für Social Media Posts).
    Aktionen: 'goto' (url), 'click' (selector), 'fill' (selector, text), 'screenshot' (path).
    
    Args:
        actions: Liste von Dicts mit {'type': '...', 'url/selector/text/path': '...'}
        headless: Ob der Browser im Hintergrund (True) oder sichtbar (False) laufen soll.
    """
    blocked = await _guard_system_access(context, "browser_automation")
    if blocked:
        return blocked
    await emit_log(context, "thinking", f"Starte Browser-Automatisierung ({len(actions)} Schritte)...")
    
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return "Fehler: Playwright ist nicht installiert. Bitte 'pip install playwright' ausführen."

    results = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=headless)
            page = await browser.new_page()
            
            for action in actions:
                a_type = action.get("type")
                await emit_log(context, "tool_call", f"Browser: {a_type}")
                
                if a_type == "goto":
                    await page.goto(action.get("url"), wait_until="networkidle")
                    results.append(f"Navigiert zu {action.get('url')}")
                elif a_type == "click":
                    await page.click(action.get("selector"))
                    results.append(f"Geklickt auf {action.get('selector')}")
                elif a_type == "fill":
                    await page.fill(action.get("selector"), action.get("text"))
                    results.append(f"Text in {action.get('selector')} eingegeben")
                elif a_type == "screenshot":
                    path = action.get("path") or f"screenshot_{int(time.time())}.png"
                    await page.screenshot(path=path)
                    results.append(f"Screenshot gespeichert unter {path}")
                elif a_type == "wait":
                    await page.wait_for_timeout(action.get("ms", 1000))
                    results.append(f"Gewartet für {action.get('ms')}ms")
            
            await browser.close()
            return "Browser-Aktionen erfolgreich abgeschlossen:\n" + "\n".join(results)
    except Exception as e:
        logger.error(f"Browser Automation Fehler: {e}")
        return f"Fehler bei der Browser-Automatisierung: {str(e)}"

# ============================================================
# TOOL 15: Visuelle UI-Element-Erkennung (Vision Action Loop)
# ============================================================
@function_tool()
async def detect_ui_element(context: RunContext, element_description: str) -> str:
    """Findet die exakten Koordinaten eines UI-Elements auf dem Bildschirm via Vision.
    Nutze dies, um die Position von Buttons, Links oder Icons zu bestimmen.
    
    Args:
        element_description: Präzise Beschreibung (z.B. 'Der rote Play-Button in der Mitte', 'Das YouTube Logo oben links')
    """
    await emit_log(context, "thinking", f"Analysiere Bildschirm für: {element_description}")
    
    screenshot = pyautogui.screenshot()
    w, h = screenshot.size
    
    img = screenshot.copy()
    img.thumbnail((1024, 1024))
    buffered = BytesIO()
    img.save(buffered, format="JPEG", quality=90)
    img_str = base64.b64encode(buffered.getvalue()).decode()
    
    api_key = os.environ.get("OPENAI_API_KEY")
    prompt = (
        f"Du bist ein Experte für UI-Navigation. Das Bild zeigt den aktuellen Desktop (1024x{img.height}).\n"
        f"Gesuchtes Element: '{element_description}'\n"
        f"Aufgabe: Bestimme die exakten Pixel-Koordinaten (Zentrum) dieses Elements.\n"
        f"Regel: Antworte AUSSCHLIESSLICH im JSON-Format: {{\"x\": int, \"y\": int, \"description\": \"...\"}}.\n"
        f"Sei extrem präzise. Wenn das Element nicht sicher sichtbar ist, gib {{\"error\": \"not_found\"}} zurück."
    )
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o",
                    "messages": [{"role": "user", "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_str}", "detail": "high"}}
                    ]}],
                    "max_tokens": 100
                }
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    content = data["choices"][0]["message"]["content"].strip()
                    logger.debug(f"Vision API Response: {content}")
                    
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0].strip()
                    
                    try:
                        res_json = json.loads(content)
                    except:
                        logger.error(f"Ungültiges JSON von Vision: {content}")
                        return "Fehler: Vision-Antwort war kein gültiges JSON."

                    if "error" in res_json:
                        return f"Element '{element_description}' nicht auf dem Bildschirm gefunden."
                    
                    scale_x = w / 1024 # Die Vision-Analyse basiert auf 1024 Breite
                    scale_y = h / img.height
                    final_x = int(res_json["x"] * scale_x)
                    final_y = int(res_json["y"] * scale_y)
                    
                    await emit_log(context, "result", f"Element gefunden bei {final_x}, {final_y}")
                    return json.dumps({"x": final_x, "y": final_y, "status": "found"})
                
                logger.error(f"Vision API Fehler: {resp.status}")
                return f"Vision-Fehler: {resp.status}"
    except Exception as e:
        return f"UI-Erkennung fehlgeschlagen: {str(e)}"

@function_tool()
async def click_ui_element(context: RunContext, element_description: str, click_type: str = "left") -> str:
    """Findet ein Element visuell auf dem Bildschirm und klickt es sofort an.
    Nutze dies als Standard-Tool für alle Desktop-Interaktionen (z.B. 'Klicke auf das erste Video').
    
    Args:
        element_description: Was soll geklickt werden? (z.B. 'Der Abonnieren Button')
        click_type: 'left' (Standard), 'right' oder 'double'
    """
    await emit_log(context, "tool_call", f"Visueller Klick auf: {element_description}")
    
    # Position finden
    res_str = await detect_ui_element(context, element_description)
    try:
        res = json.loads(res_str)
        if res.get("status") == "found":
            x, y = res["x"], res["y"]
            
            # Klick ausführen mit sichtbarer Mausbewegung
            pyautogui.moveTo(x, y, duration=1.0)
            await asyncio.sleep(0.2)
            
            if click_type == "double":
                pyautogui.doubleClick()
            elif click_type == "right":
                pyautogui.rightClick()
            else:
                pyautogui.click()
                
            return f"Element '{element_description}' bei {x},{y} erfolgreich geklickt."
        
        await emit_log(context, "warning", f"Klick fehlgeschlagen: {res_str}")
        return res_str
    except Exception as e:
        logger.error(f"Fehler in click_ui_element: {e}")
        return f"Konnte '{element_description}' nicht finden oder klicken."

# ============================================================
# TOOL 16: Discord Webhook Integration
# ============================================================
@function_tool()
async def send_discord_webhook(
    context: RunContext, 
    content: str, 
    webhook_url: str = None, 
    username: str = "Elite Assistant",
    title: str = None,
    color: int = 0x00f2ff
) -> str:
    """Sendet eine Nachricht an einen Discord-Kanal via Webhook.
    
    Args:
        content: Der Text der Nachricht.
        webhook_url: Optional. Wenn nicht angegeben, wird DISCORD_WEBHOOK_URL aus .env genutzt.
        username: Name, unter dem die Nachricht erscheint.
        title: Optionaler Titel für ein Embed.
        color: Farbe des Embeds (Hex-Dezimal).
    """
    url = webhook_url or os.environ.get("DISCORD_WEBHOOK_URL")
    
    if not url:
        return "Fehler: Keine Discord Webhook URL konfiguriert (DISCORD_WEBHOOK_URL fehlt)."

    await emit_log(context, "tool_call", f"Sende Discord Nachricht: {content[:20]}...")
    
    payload = {
        "username": username,
        "content": content if not title else ""
    }
    
    if title:
        payload["embeds"] = [{
            "title": title,
            "description": content,
            "color": color,
            "timestamp": datetime.utcnow().isoformat()
        }]
        
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status in [200, 204]:
                    return "Discord Nachricht erfolgreich gesendet."
                else:
                    return f"Fehler beim Senden an Discord: Status {resp.status}"
    except Exception as e:
        return f"Discord Webhook Fehler: {str(e)}"

@function_tool()
async def google_search_ui(context: RunContext, query: str) -> str:
    """Öffnet die Google-Suche im Standard-Browser des Nutzers.
    Nutze dies, wenn der Nutzer nach Informationen fragt, die visuell im Browser (News, Bilder) gezeigt werden sollen.
    
    Args:
        query: Der Suchbegriff.
    """
    import urllib.parse
    encoded_query = urllib.parse.quote(query)
    url = f"https://www.google.com/search?q={encoded_query}"
    
    await emit_log(context, "tool_call", f"Öffne Google-Suche: {query}")
    try:
        _open_url_in_browser(url)
        return f"Ich habe die Google-Suche für '{query}' im Browser geöffnet."
    except Exception as e:
        return f"Fehler beim Öffnen des Browsers: {str(e)}"

@function_tool()
async def youtube_search_ui(context: RunContext, query: str) -> str:
    """Sucht nach Videos auf YouTube und öffnet die Ergebnisse im Browser.
    Nutze dies, wenn der Nutzer explizit nach Videos oder Tutorials fragt.
    
    Args:
        query: Der Suchbegriff für YouTube.
    """
    import urllib.parse
    encoded_query = urllib.parse.quote(query)
    url = f"https://www.youtube.com/results?search_query={encoded_query}"
    
    await emit_log(context, "tool_call", f"Suche auf YouTube: {query}")
    try:
        _open_url_in_browser(url)
        return f"Ich habe YouTube nach '{query}' durchsucht und die Ergebnisse geöffnet."
    except Exception as e:
        return f"Fehler beim Öffnen von YouTube: {str(e)}"

# ============================================================
# TOOL 33: Kamera-Scan via Frontend triggern
# ============================================================
@function_tool()
async def trigger_visual_scan(context: RunContext) -> str:
    """Triggered einen visuellen Scan der Webcam im Frontend-Dashboard.
    Nutze dieses Tool, wenn der Nutzer fragt 'Was siehst du?' oder 'Analysiere das Bild'.
    Die Ergebnisse erscheinen im System-Log und die KI kann darauf basierend antworten.
    """
    room = get_room_from_context(context)
    if not room:
        return "Fehler: Kein aktiver Raum gefunden. Scan konnte nicht ausgelöst werden."
    
    await emit_log(context, "thinking", "Starte proaktiven Kamera-Scan...")
    
    payload = json.dumps({
        "type": "trigger_visual_scan"
    })
    
    try:
        await room.local_participant.publish_data(payload.encode('utf-8'))
        return "Visueller Scan wurde im Frontend ausgelöst. Die Ergebnisse werden in Kürze im Log erscheinen."
    except Exception as e:
        return f"Fehler beim Senden des Scan-Triggers: {str(e)}"

@function_tool()
async def manage_dashboard_widgets(context: RunContext, action: str, widget_id: str = "none") -> str:
    """Steuert die Sichtbarkeit von Dashboard-Widgets im Frontend (HUD).
    Nutze dies fr 'Kamera schlieen', 'Musik-Player ffnen', 'Chat ausblenden' etc.

    Args:
        action: 'open', 'close', 'toggle' oder 'close_all'
        widget_id: ID des Widgets – webcam, imageGrid, chat, systemMonitor, music, logStream,
            textEditor, missionControl, commandList, paiPulse, settings, mediaPlayer,
            cad, printer, browserAgent, kasa, gestureControl, authLock (optional bei 'close_all')
    """
    room = get_room_from_context(context)
    if not room:
        return "Fehler: Kein aktiver Raum für Widget-Steuerung gefunden."
    
    await emit_log(context, "tool_call", f"Widget {widget_id} -> {action}")
    
    payload = json.dumps({
        "type": "widget_control",
        "action": action,
        "widgetId": widget_id
    })
    
    try:
        await room.local_participant.publish_data(payload.encode('utf-8'))
        return f"Befehl '{action}' für Widget '{widget_id}' an das Dashboard gesendet."
    except Exception as e:
        return f"Fehler beim Senden des Widget-Befehls: {str(e)}"

@function_tool()
async def update_weather_widget(context: RunContext, temp: str, condition: str, location: str = "Biel") -> str:
    """Aktualisiert die Wetter- und Umgebungsdaten im Neural Core Dashboard.
    Nutze dies immer, wenn du Wetterinformationen an den Nutzer gibst.
    
    Args:
        temp: Die Temperatur (z.B. '13°C')
        condition: Der Wetterzustand (z.B. 'Dicht bewölkt', 'Sonnig')
        location: Der Ort (Standard: Biel)
    """
    room = get_room_from_context(context)
    if not room:
        return "Fehler: Kein aktiver Raum für Wetter-Update gefunden."
    
    await emit_log(context, "tool_call", f"Update Wetter: {location} -> {temp}, {condition}")
    
    payload = json.dumps({
        "type": "weather_update",
        "temp": temp,
        "condition": condition,
        "location": location
    })
    
    try:
        await room.local_participant.publish_data(payload.encode('utf-8'))
        return f"Wetter-Daten für {location} wurden im Dashboard aktualisiert."
    except Exception as e:
        return f"Fehler beim Senden des Wetter-Updates: {str(e)}"

@function_tool()
async def move_window(context: RunContext, identifier: str, x: int, y: int, width: int, height: int) -> str:
    """Positioniert ein Fenster exakt auf dem Bildschirm.
    Identifier kann der Prozessname (z.B. 'chrome') oder ein Teil des Fenstertitels sein.
    """
    await emit_log(context, "tool_call", f"Positioniere '{identifier}' -> {x},{y} [{width}x{height}]")
    
    ps_script = f"""
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class WindowManager {{
        [DllImport("user32.dll")]
        public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int nWidth, int nHeight, bool bRepaint);
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    }}
"@
    # 1. Versuch: Prozessname
    $p = Get-Process -Name "{identifier}" -ErrorAction SilentlyContinue | Where-Object {{ $_.MainWindowHandle -ne 0 }} | Select-Object -First 1
    
    # 2. Versuch: Fenstertitel
    if (-not $p) {{
        $allProcs = Get-Process | Where-Object {{ $_.MainWindowHandle -ne 0 }}
        foreach ($proc in $allProcs) {{
            if ($proc.MainWindowTitle -like "*{identifier}*") {{
                $p = $proc
                break
            }}
        }}
    }}

    if ($p) {{
        $hwnd = $p.MainWindowHandle
        [WindowManager]::ShowWindow($hwnd, 9) # SW_RESTORE: Falls maximiert, normalisieren
        [WindowManager]::MoveWindow($hwnd, {x}, {y}, {width}, {height}, $true)
        [WindowManager]::SetForegroundWindow($hwnd)
        return "Fenster '$identifier' positioniert."
    }} else {{
        return "Kein Fenster fr '$identifier' gefunden."
    }}
    """
    
    try:
        escaped_script = ps_script.replace('"', '\\"')
        proc = await asyncio.create_subprocess_shell(
            f"powershell -Command \"{escaped_script}\"",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.wait()
        return f"Fenster-Befehl fr '{identifier}' abgesetzt."
    except Exception as e:
        return f"Fehler bei Fenstersteuerung: {e}"

@function_tool()
async def prepare_workspace(context: RunContext, mode: str) -> str:
    """Bereitet den Desktop fr eine bestimmte Aufgabe vor (Coding, Design, Musik).
    Öffnet die benötigten Apps und ordnet sie im Snap-Layout an.
    """
    await emit_log(context, "thinking", f"Initialisiere Workspace: {mode}")
    
    # Bildschirm-Parameter (Standard Full HD, wird im Tool angepasst)
    W, H = 1920, 1080
    
    if mode.lower() in ["coding", "programmieren", "entwicklung"]:
        # Layout: Explorer (Links 20%), Antigravity (Mitte 50%), Brave (Rechts 30%)
        await emit_log(context, "tool_call", "Starte Coding-Workspace Komponenten (Brave + Explorer)...")
        
        # 1. Apps starten
        subprocess.Popen("explorer.exe", shell=True)
        await launch_app(context, "Antigravity")
        await launch_app(context, "Brave")
        
        # 2. Warten und Positionieren (mit Retry-Logik)
        for i in range(3):
            await asyncio.sleep(4)
            # Explorer kann via Prozess 'explorer' oder Titel 'Explorer' gefunden werden
            await move_window(context, "explorer", 0, 0, int(W*0.2), H)
            await move_window(context, "Antigravity", int(W*0.2), 0, int(W*0.5), H)
            # Brave Browser
            await move_window(context, "brave", int(W*0.7), 0, int(W*0.3), H)
        
        return "Coding-Workspace wurde initialisiert (Brave/Antigravity/Explorer)."
        
    elif mode.lower() in ["design", "webdesign"]:
        # Layout: Browser (Vollbild), Explorer (Rechts schmal)
        await launch_app(context, "Brave")
        await asyncio.sleep(3)
        await move_window(context, "brave", 0, 0, W, H)
        return "Design-Workspace bereit. Brave im Fokus."
        
    elif mode.lower() in ["music", "musik", "spotify"]:
        await emit_log(context, "tool_call", "Starte Musik-Workspace (Fokus-Methode)...")
        
        # 1. Spotify PWA mit Playlist-URL starten
        pwa_cmd = r'"C:\Program Files (x86)\Microsoft\Edge\Application\msedge_proxy.exe" --profile-directory=Default --app-id=pjibgclleladliembfgfagdaldikeohf'
        playlist_url = "https://open.spotify.com/playlist/1rMiQtxCV0OhAxJtmHEfbb"
        subprocess.Popen(f"{pwa_cmd} {playlist_url}", shell=True)
        
        # 2. Warten auf Load und Fokus erzwingen
        await asyncio.sleep(10)
        # Wir nutzen move_window um Fokus zu erhalten (Mittig, halbe Größe)
        await move_window(context, "spotify", 480, 270, 960, 540)
        await asyncio.sleep(1)
        
        # 3. Playback starten via Space (sicherer bei Fokus)
        import pyautogui
        pyautogui.press('space')
            
        return "Musik-Workspace gestartet. Spotify fokussiert und Play-Befehl gesendet."
        
    return f"Modus '{mode}' unbekannt. Bitte whle Coding, Design oder Musik."

@function_tool()
async def check_active_meetings(context: RunContext) -> dict:
    """Prft, ob aktuell ein Video-Meeting (Zoom, Teams, Meet etc.) aktiv ist.
    Gibt Details zum Meeting-Typ und Status zurck.
    """
    meeting_apps = {
        "Zoom.exe": "Zoom",
        "Teams.exe": "Microsoft Teams",
        "ms-teams.exe": "Microsoft Teams",
        "Webex.exe": "Cisco Webex",
        "Slack.exe": "Slack Call",
        "Discord.exe": "Discord",
    }
    
    browser_meeting_keywords = ["meet.google.com", "zoom.us", "teams.microsoft.com", "jitsi", "bigbluebutton", "webex"]
    
    found_meeting = None
    
    # 1. Prozess-Check
    for proc in psutil.process_iter(['name']):
        if proc.info['name'] in meeting_apps:
            found_meeting = meeting_apps[proc.info['name']]
            break
            
    # 2. Fenster-Check (Browser-Tabs etc.)
    if not found_meeting:
        try:
            # Wir nutzen das existierende Tool-Konzept, um Fenster zu listen
            windows = await get_open_windows(context)
            if isinstance(windows, list):
                for win in windows:
                    title = win.get("title", "").lower()
                    if any(kw in title for kw in browser_meeting_keywords) or "meeting" in title:
                        found_meeting = "Browser Meeting"
                        break
        except: pass
        
    return {
        "is_active": found_meeting is not None,
        "meeting_type": found_meeting or "None",
        "timestamp": datetime.now().isoformat()
    }

@function_tool()
async def activate_ghost_mode(context: RunContext) -> str:
    """Aktiviert den Ghost Mode: Minimiert alle Fenster und schliet alle HUD-Widgets.
    Nutze dies fr sofortige Privatsphre oder Fokus.
    """
    await emit_log(context, "thinking", "Aktiviere Ghost Mode...")
    
    # 1. Alle Widgets im HUD schlieen
    await manage_dashboard_widgets(context, "close_all")
    
    # 2. Elite in Tray, andere Fenster minimieren (ohne MinimizeAll)
    try:
        await _signal_elite_hide_to_tray()
        await asyncio.sleep(0.5)
        await _minimize_non_elite_windows()
        return "Ghost Mode aktiviert. Elite läuft in der Systemleiste, andere Fenster minimiert."
    except Exception as e:
        return f"Fehler beim Minimieren der Fenster: {e}"


@function_tool()
async def close_all_desktop_windows(context: RunContext) -> str:
    """Schließt/minimiert alle Desktop-Fenster außer Elite.
    Elite wird in die Systemleiste minimiert (Tray) und bleibt aktiv.
    Nutze dies bei: 'schließe alle Fenster', 'Desktop aufräumen', 'alle Apps minimieren'.
    """
    await emit_log(context, "thinking", "Räume Desktop auf – Elite bleibt im Tray...")
    await _signal_elite_hide_to_tray()
    await asyncio.sleep(0.6)
    try:
        await _minimize_non_elite_windows()
        return (
            "Alle anderen Fenster wurden minimiert. "
            "Elite läuft weiter in der Systemleiste – Doppelklick auf das Tray-Icon zum Öffnen."
        )
    except Exception as e:
        return f"Fehler beim Aufräumen des Desktops: {e}"

@function_tool()
async def research_topic(context: RunContext, query: str) -> str:
    """Elite recherchiert selbstständig im Web zu einem Thema.
    Öffnet den Browser, macht Screenshots der Ergebnisse und präsentiert sie im HUD.
    """
    await emit_log(context, "tool_call", f"Starte Recherche: {query}...")
    
    try:
        # 1. Browser mit Suche öffnen (Google oder DuckDuckGo)
        search_url = f"https://www.google.com/search?q={urllib.parse.quote(query)}"
        # Brave Browser Pfad (Standard bei Ed)
        brave_path = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
        
        if os.path.exists(brave_path):
            subprocess.Popen([brave_path, search_url])
        else:
            import webbrowser
            webbrowser.open(search_url)
            
        await emit_log(context, "thinking", "Warte auf Ladevorgang der Ergebnisse...")
        await asyncio.sleep(5) # Wartezeit für Page Load
        
        # 2. Screenshot der Ergebnisse erstellen
        import pyautogui
        screenshot = pyautogui.screenshot()
        
        # In Base64 konvertieren für das Frontend
        buffered = BytesIO()
        screenshot.save(buffered, format="JPEG", quality=70)
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
        img_data_url = f"data:image/jpeg;base64,{img_str}"
        
        # 3. Vision-Analyse des Screenshots (Optional aber cool)
        await emit_log(context, "thinking", "Analysiere Suchergebnisse mit Vision...")
        from agent import analyze_frame_with_vision
        analysis, gallery_entry = await analyze_frame_with_vision(img_data_url)
        
        # 4. An das Dashboard senden (ImageGrid)
        room = get_room_from_context(context)
        if room:
            # Widget öffnen
            open_payload = json.dumps({
                "type": "widget_control",
                "action": "open",
                "widgetId": "imageGrid",
            })
            await room.local_participant.publish_data(open_payload.encode('utf-8'))
            
            # Bild hinzufügen (persistente Galerie-URL falls vorhanden)
            image_src = gallery_entry["src"] if gallery_entry else img_data_url
            image_analysis = gallery_entry.get("analysis", {}) if gallery_entry else {
                "description": analysis,
                "face_count": 0,
                "object_count": 1,
                "brightness": 80,
                "resolution": f"{screenshot.width}x{screenshot.height}",
            }
            img_payload = json.dumps({
                "type": "captured_image",
                "image": {
                    "src": image_src,
                    "labels": ["Search Result", query],
                    "confidence": 0.9,
                    "analysis": image_analysis,
                },
            })
            await room.local_participant.publish_data(img_payload.encode('utf-8'))
            
        await emit_log(context, "result", f"Recherche abgeschlossen. Ergebnisse im HUD archiviert.")
        return f"Ich habe zu '{query}' recherchiert und einen Screenshot der Ergebnisse in deinem Bild-Archiv abgelegt. Analyse: {analysis}"

    except Exception as e:
        logger.error(f"Research Mode Error: {e}")
        return f"Fehler bei der Recherche: {e}"

@function_tool()
async def trigger_self_healing_workflow(context: RunContext, error_message: str, target_file: str = "") -> str:
    """Startet das selbstheilende System, bei dem spezialisierte KI-Agenten kollaborativ zusammenarbeiten,
    um einen Fehler im System (z. B. eine Fehlermeldung, einen Exception-Traceback oder ein defektes Skript)
    zu analysieren, einen Patch zu erstellen, ihn sicher auf Fehler zu überprüfen (Code-Review) und ihn einzuspielen.
    
    Args:
        error_message: Die Fehlermeldung oder der Traceback, der behoben werden soll.
        target_file: Optional. Der Pfad zu der Datei, die korrigiert werden soll. Falls leer, versucht der Agent die Datei zu ermitteln.
    """
    from self_healing import run_self_healing
    return await run_self_healing(context, error_message, target_file)

@function_tool()
async def trigger_learning_cycle(context: RunContext) -> str:
    """Startet einen kollaborativen Selbstlern-Zyklus, bei dem Agenten die Log-Dateien, die Konversations-Historie
    und die Benutzer-Präferenzen analysieren, um das Verhalten zu optimieren, gelernte Lektionen in der PAI-Gedächtnisdatenbank
    zu konsolidieren und dem System neue Verhaltensmuster beizubringen.
    """
    from self_learning import run_learning_cycle
    return await run_learning_cycle(context)

# Alle Tools als Liste exportieren (wird in agent.py importiert)
ALL_TOOLS = [
    trigger_self_healing_workflow,
    trigger_learning_cycle,
    research_topic,
    search_web,
    google_search_ui,
    youtube_search_ui,
    save_lead,
    calculate_quote,
    send_email,
    suggest_appointment,
    lookup_faq,
    create_conversation_summary,
    execute_system_command,
    open_website,
    open_file_or_url,
    control_desktop,
    capture_screen,
    list_installed_apps,
    launch_app,
    manage_process,
    spawn_agent_worker,
    browser_automation,
    analyze_video_stream,
    trigger_visual_scan,
    manage_dashboard_widgets,
    update_weather_widget,
    move_window,
    prepare_workspace,
    activate_ghost_mode,
    close_all_desktop_windows,
    check_active_meetings,
    get_system_info,
    get_open_windows,
    update_agent_memory,
    read_agent_memory,
    read_file,
    write_file,
    close_window,
    get_user_paths,
    capture_webcam,
    pai_start_novelty_run,
    pai_loop_control,
    pai_loop_status,
    hermes_ask,
    hermes_search_sessions,
    mc_create_task,
    mc_list_tasks,
    mc_list_messages,
    mc_task_summary,
    mc_inbox_summary,
    mc_mark_messages_read,
    mc_complete_inbox_tasks,
    mc_update_task_status,
    media_control,
    play_random_music,
    scan_music_library,
    play_local_song,
    detect_ui_element,
    click_ui_element,
    send_discord_webhook,
] + UI_AUTOMATION_TOOLS + ADA_TOOLS

