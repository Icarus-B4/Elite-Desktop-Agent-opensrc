# -*- coding: utf-8 -*-
import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas

# Dynamic page numbering and footer/header canvas
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        
        # A4 size: 595.27 x 841.89
        width, height = A4
        left_margin = 54
        right_margin = width - 54
        
        # Header (only on page 2 and later)
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor("#06B6D4")) # Cyan Accent
            self.drawString(left_margin, height - 40, "ELITE DESKTOP AGENT")
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748B"))
            self.drawRightString(right_margin, height - 40, "PROJEKTZUSAMMENFASSUNG & STATUSBERICHT")
            
            # Subtle header line
            self.setStrokeColor(colors.HexColor("#E2E8F0"))
            self.setLineWidth(0.5)
            self.line(left_margin, height - 46, right_margin, height - 46)
            
        # Footer (on all pages)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(left_margin, 35, "© 2026 Webstark.org | Elite Desktop Agent (Jarvis Edition) - Vertraulicher Statusbericht")
        
        page_text = f"Seite {self._pageNumber} von {page_count}"
        self.drawRightString(right_margin, 35, page_text)
        
        # Subtle footer line
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.5)
        self.line(left_margin, 47, right_margin, 47)
        
        self.restoreState()

def create_summary_pdf(output_path):
    # Setup document geometry (A4, margins)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=54,
        rightMargin=54,
        topMargin=60,
        bottomMargin=65
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#0F172A"), # Deep Slate
        spaceAfter=6
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#06B6D4"), # Cyan Accent
        spaceAfter=25
    )
    
    meta_style = ParagraphStyle(
        'DocMeta',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=15
    )
    
    h1_style = ParagraphStyle(
        'DocH1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'DocH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#1E293B"),
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"), # Charcoal
        spaceAfter=8
    )
    
    body_bold = ParagraphStyle(
        'DocBodyBold',
        parent=body_style,
        fontName='Helvetica-Bold'
    )
    
    bullet_style = ParagraphStyle(
        'DocBullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )
    
    code_style = ParagraphStyle(
        'DocCode',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#0F172A"),
        backColor=colors.HexColor("#F1F5F9"),
        borderPadding=6,
        spaceAfter=8
    )

    story = []
    
    # --- DECORATIVE HEADER BLOCK ---
    story.append(Paragraph("ELITE DESKTOP AGENT", ParagraphStyle('SubHeader', fontName='Helvetica-Bold', fontSize=10, textColor=colors.HexColor("#06B6D4"), leading=12, spaceAfter=4)))
    story.append(Paragraph("Projektzusammenfassung & Statusbericht", title_style))
    story.append(Paragraph("Zustand, Tech-Stack, erreichte Meilensteine und zukünftige Roadmap", subtitle_style))
    
    # Metadata Box
    meta_text = f"<b>Datum:</b> 18. Mai 2026 | <b>Entwickler:</b> Ed / Webstark.org | <b>Projekt-Modus:</b> Local & Cloud Jarvis Edition"
    story.append(Paragraph(meta_text, meta_style))
    
    # Divider line
    story.append(Table([[""]], colWidths=[487], rowHeights=[2], style=TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#06B6D4")),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ])))
    story.append(Spacer(1, 15))
    
    # --- 1. EINLEITUNG ---
    story.append(Paragraph("1. Projektübersicht", h1_style))
    intro_p1 = (
        "Der <b>Elite Desktop Agent (Jarvis Edition)</b> ist ein hochmoderner, modularer KI-Assistent für Windows. "
        "Das System agiert als diskreter Butler im Hintergrund, der über Echtzeit-Spracherkennung verfügt, "
        "proaktiv handelt und die vollständige Kontrolle über die Windows-Umgebung besitzt (Tastatur, Maus, Shell, OCR). "
        "Ein futuristisches HUD-Design im Glassmorphismus-Stil bildet die Benutzeroberfläche und visualisiert "
        "die KI-Gedankengänge (fury-sdk), Systemmetriken, Kamerabilder und Automationen in Echtzeit."
    )
    story.append(Paragraph(intro_p1, body_style))
    
    # --- 2. TECHNOLOGIE-STACK ---
    story.append(Paragraph("2. Technologie-Stack", h1_style))
    
    # Tech Stack Table
    tech_data = [
        [Paragraph("<b>Komponente</b>", body_bold), Paragraph("<b>Technologien & Frameworks</b>", body_bold)],
        [Paragraph("<b>Frontend (HUD Interface)</b>", body_style), Paragraph("Next.js, LiveKit Components (React), Tailwind CSS, Framer Motion (futuristische Spring-Animationen &amp; Theme-Stile)", body_style)],
        [Paragraph("<b>Desktop Container</b>", body_style), Paragraph("Electron Wrapper (main.js, services.js) zur nahtlosen Desktop-Integration, Hotkeys, Tray-Management und automatischen Service-Orchestrierung", body_style)],
        [Paragraph("<b>Backend Agent (Jarvis Core)</b>", body_style), Paragraph("Python 3.10+, LiveKit Agents SDK, OpenAI Realtime API (ash voice / VAD-Integration) für native Sprachinteraktion in Echtzeit", body_style)],
        [Paragraph("<b>Vision & Frame Processing</b>", body_style), Paragraph("OpenCV, Pillow &amp; Base64-Streaming für Kognitive Wahrnehmung (GPT-4o Vision Webcam-Feed &amp; Desktop-OCR)", body_style)],
        [Paragraph("<b>System-Automation (Action)</b>", body_style), Paragraph("PyAutoGUI, PSUtil und native Windows UI Automation über eine spezialisierte C# GPRC-Schnittstelle (UiAutomationGRPC.Server.exe)", body_style)],
        [Paragraph("<b>Mission Control Hub</b>", body_style), Paragraph("Node.js (Express), SQLite-Datenbank zur permanenten Aufgabenverwaltung, GitHub Issues Sync &amp; Webhook Events", body_style)],
        [Paragraph("<b>Bereitstellung & Build</b>", body_style), Paragraph("Microsoft winapp CLI, Custom MSIX Packaging Pipeline mit Entwickler-Code-Signing (devcert.pfx), Startup-Batches", body_style)]
    ]
    
    t = Table(tech_data, colWidths=[150, 337])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#F1F5F9")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))
    
    # --- 3. AKTUELLER STATUS & ERREICHTE MEILENSTEINE ---
    story.append(Paragraph("3. Aktueller Projektstatus & Fortschritte", h1_style))
    story.append(Paragraph("Das System wurde in den letzten Zyklen erfolgreich stabilisiert und für den professionellen Einsatz optimiert. Folgende Meilensteine wurden erreicht:", body_style))
    
    milestones = [
        "<b>Modulares 8-Widget Dashboard (/dashboard):</b> Integration eines vollwertigen HUD-Panels bestehend aus System Monitor (Echtzeit CPU/RAM/Disk), Webcam Feed (Scans), Log Streamer (Echtzeit-Denkprozesse), Music Controller (Spotify &amp; Audio-Visualizer), Image Archive (Vision-Bilder), AI Chat, Smart Clipboard Text Editor und Command Index.",
        "<b>Asthetik-Feinschliff:</b> Anpassung des Neon-Cyan Glassmorphismus-Themas mit optimierten, dezenten Rändern und Framer-Motion Widget-Animationen für einen extrem hochwertigen Eindruck.",
        "<b>Vollautarker Lokaler Modus (Docker &amp; LiveKit-Server):</b> Implementierung einer automatischen Erkennung und Steuerung des lokalen LiveKit-Dienstes. Docker Desktop wird bei Bedarf via PowerShell gestartet, und der Docker-Container <code>livekit-server</code> wird vollautomatisch mit 0.0.0.0-Bindung und UDP WebRTC-Portweiterleitung (7882) neu erstellt, um Loopback-Verbindungsfehler zu verhindern.",
        "<b>Native Windows MSIX Deployment-Pipeline:</b> Erfolgreiches Setup der Build-Pipeline (<code>pnpm run build:msix</code>), welche Next.js Standalone-Assets, Mission Control und den Desktop-Agenten in ein signiertes Windows-MSIX-Installationspaket packt.",
        "<b>Dateisystem-Schutz &amp; Rechte-Stabilisierung:</b> Behebung kritischer Schreibberechtigungs-Konflikte (EPERM), die durch die restriktive WindowsApp-Ordnerstruktur des MSIX-Pakets auftraten. Stateful Konfigurationen (wie <code>config.json</code> und Heartbeats) wurden vollständig in beschreibbare Benutzer-AppData-Verzeichnisse ausgelagert.",
        "<b>Voice-Core v2 &amp; Rauschreduktion:</b> Optimierung des Sprachmoduls durch Ultra-Strict VAD (Voice Activity Detection Threshold 0.8 / 0.4) und eine beschleunigte Mikrofon-Initialisierung (1.5 Sekunden) zur Minimierung von Hintergrundrauschen.",
        "<b>Integrierte Assistenz-Feature Sets:</b> Volle Funktionsfähigkeit von Workflows wie dem <b>Ghost Mode</b> (sofortiger Sichtschutz), <b>Meeting Guard</b> (Auto-Mute von Spotify und Öffnen des Notizblocks bei Calls) und dem <b>Smart Clipboard Monitor</b>."
    ]
    
    for m in milestones:
        story.append(Paragraph(f"• {m}", bullet_style))
        
    story.append(Spacer(1, 10))
    story.append(PageBreak()) # Clean break to keep document highly readable and structured
    
    # --- 4. ZUKÜNFTIGE ENTWICKLUNG & ROADMAP ---
    story.append(Paragraph("4. Zukünftige Entwicklung & Roadmap", h1_style))
    story.append(Paragraph("Die kommenden Phasen konzentrieren sich auf eine tiefere Hardware-Integration und die Erweiterung der Mission Control Automatisierungsfunktionen:", body_style))
    
    story.append(Paragraph("Phase A: Physische &amp; Hardware Integration", h2_style))
    roadmap_a = [
        "<b>ESP32 / IoT Smart Home Bridge:</b> Direkte Steuerung von Hardware-Modulen (z.B. Lilygo T-RGB, T-Display-S3 oder Smart Home Lampen) aus dem Jarvis Core per MQTT-Protokoll oder HTTP-Requests.",
        "<b>Vision-Based Webcam-Sicherheit ('Stranger Alert'):</b> Proaktive Webcam-Überwachung, die beim Erkennen unbefugter Personen automatisch reagiert (z.B. den Bildschirm sperrt, Fenster minimiert oder eine Benachrichtigung sendet)."
    ]
    for r in roadmap_a:
        story.append(Paragraph(f"• {r}", bullet_style))
        
    story.append(Paragraph("Phase B: Mission Control Erweiterungen (Dashboard)", h2_style))
    roadmap_b = [
        "<b>GitHub Issues Integration:</b> Vollständige Aktivierung der Issues-Synchronisation über GitHub Personal Access Tokens (Classic) in <code>mission-control/.env</code>, um GitHub Issues direkt als Aufgaben in der Dashboard-Inbox verwalten zu können.",
        "<b>Agent Profile &amp; Memory Mirroring:</b> Synchronisations-Skript, welches die lokalen Profildateien des Agenten (<code>GEMINI.md</code>, <code>.agent/CONVERSATION_MEMORY.md</code>) automatisch in das Mission-Control-Verzeichnis (<code>.mission-control/agents/elite-agent/</code>) spiegelt.",
        "<b>Webhooks &amp; Notification Systems:</b> Einrichtung von aktiven Webhooks im Verzeichnis <code>.mission-control/hooks/</code> zur automatischen Statusübermittlung an externe Chatdienste (z.B. Discord oder Telegram), sobald Aufgaben erledigt sind.",
        "<b>Claude Terminals Connection &amp; Log Spieglung:</b> WebSocket-Kopplung im Python-Backend an die Mission Control API zur Echtzeit-Spiegelung aller CLI-Sitzungen und internen KI-Gedankengänge im Terminal-Widget des Dashboards."
    ]
    for r in roadmap_b:
        story.append(Paragraph(f"• {r}", bullet_style))

    story.append(Spacer(1, 15))
    
    # --- SIGN-OFF BLOCK ---
    story.append(Spacer(1, 20))
    story.append(Paragraph("<b>Ende des Berichts.</b> Dieser Bericht spiegelt den Stand vom 18. Mai 2026 wider. Alle Kernsysteme laufen stabil, Docker-Automatisierungen sind einsatzbereit, und die MSIX-Verteilungspipeline ist vollständig funktionstüchtig.", body_style))
    
    # Build Document
    doc.build(story, canvasmaker=NumberedCanvas)

if __name__ == "__main__":
    output_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pdf_filename = "Elite_Desktop_Agent_Projektzusammenfassung.pdf"
    full_output_path = os.path.join(output_dir, pdf_filename)
    
    print(f"Generiere PDF in: {full_output_path}...")
    try:
        create_summary_pdf(full_output_path)
        print("PDF erfolgreich generiert!")
        sys.exit(0)
    except Exception as e:
        print(f"Fehler bei der PDF-Generierung: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
