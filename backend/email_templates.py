"""
Email-Templates für den Elite KI-Agenten.
Professionelle HTML-Email-Vorlagen mit Webstark-Branding.
"""

# Webstark Logo URL (öffentlich verfügbar)
LOGO_URL = "https://webstark.org/webstarkicon.webp"

# Kontakt-Email (Fallback, wird normalerweise aus NOTIFY_EMAIL geladen)
CONTACT_EMAIL = "icarus.mod56@gmail.com"

# Buchungs-URL
BOOKING_URL = "https://webstark.org/about#kontakt"


def _base_wrapper(content: str) -> str:
    """Basis-HTML-Wrapper mit Webstark-Branding für alle Emails."""
    return f"""
    <div style="font-family: -apple-system, 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e0e0e0; border-radius: 16px; overflow: hidden;">
        <!-- Header mit Logo -->
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px 24px; text-align: center;">
            <img src="{LOGO_URL}" alt="Webstark" style="height: 48px; margin-bottom: 8px;" />
            <h1 style="color: #ff0080; font-size: 22px; margin: 8px 0 0; letter-spacing: 1px;">WEBSTARK</h1>
            <p style="color: #888; font-size: 11px; margin: 4px 0 0; letter-spacing: 2px;">POWERED BY ELITE KI</p>
        </div>

        <!-- Inhalt -->
        <div style="padding: 28px 24px;">
            {content}
        </div>

        <!-- Footer -->
        <div style="background: #111; padding: 20px 24px; text-align: center; border-top: 1px solid #222;">
            <p style="color: #666; font-size: 11px; margin: 0;">
                Diese E-Mail wurde von Elite gesendet, dem KI-Agenten von
                <a href="https://webstark.org" style="color: #ff0080; text-decoration: none;">webstark.org</a>
            </p>
        </div>
    </div>
    """


def build_package_overview_email(customer_name: str) -> str:
    """Erstellt eine professionelle Paketübersicht-Email mit allen 3 Paketen.
    Zeigt nur 'ab'-Preise (Branchenstandard) und Features."""
    content = f"""
        <p style="color: #ccc; font-size: 16px; line-height: 1.6;">
            Hallo {customer_name},
        </p>
        <p style="color: #aaa; font-size: 15px; line-height: 1.6;">
            vielen Dank für dein Interesse an Webstark! Hier ist eine Übersicht unserer Pakete:
        </p>

        <!-- Starter Paket -->
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #4ad7e6;">
            <h3 style="color: #4ad7e6; margin: 0 0 4px;">⚡ Starter (AI-Enhanced)</h3>
            <p style="color: #ff0080; font-size: 18px; margin: 4px 0 12px; font-weight: bold;">ab 890 CHF</p>
            <ul style="color: #bbb; font-size: 14px; line-height: 1.8; padding-left: 18px; margin: 0;">
                <li>KI-generiertes Design</li>
                <li>Automatisches Basis-SEO</li>
                <li>Responsive One-Page Website</li>
                <li>Chatbot-Integration (Basis)</li>
            </ul>
        </div>

        <!-- Professional Paket -->
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #ff0080;">
            <div style="display: inline-block; background: #ff0080; color: white; padding: 2px 10px; border-radius: 12px; font-size: 11px; margin-bottom: 8px;">BELIEBT</div>
            <h3 style="color: #ff0080; margin: 4px 0 4px;">🚀 Professional (AI-Powered)</h3>
            <p style="color: #ff0080; font-size: 18px; margin: 4px 0 12px; font-weight: bold;">ab 1.490 CHF</p>
            <ul style="color: #bbb; font-size: 14px; line-height: 1.8; padding-left: 18px; margin: 0;">
                <li>Alles aus Starter, plus:</li>
                <li>Content-Automation Engine</li>
                <li>Predictive Analytics</li>
                <li>A/B-Testing AI</li>
                <li>Erweiterter KI-Support</li>
            </ul>
        </div>

        <!-- Enterprise Paket -->
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #ffd700;">
            <h3 style="color: #ffd700; margin: 0 0 4px;">👑 Enterprise (AI-First)</h3>
            <p style="color: #ffd700; font-size: 18px; margin: 4px 0 12px; font-weight: bold;">Individueller Preis</p>
            <ul style="color: #bbb; font-size: 14px; line-height: 1.8; padding-left: 18px; margin: 0;">
                <li>Custom AI-Workflows</li>
                <li>Dedicated AI-Team</li>
                <li>24/7 Priority Support</li>
                <li>On-site Workshops</li>
            </ul>
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 28px 0 12px;">
            <a href="{BOOKING_URL}" style="display: inline-block; background: linear-gradient(135deg, #ff0080, #ff4da6); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 15px;">
                Jetzt Beratungstermin buchen
            </a>
        </div>

        <p style="color: #888; font-size: 13px; text-align: center; margin-top: 16px;">
            Alle Preise zzgl. MwSt. · Individuelle Anpassungen möglich
        </p>
    """
    return _base_wrapper(content)


def build_thankyou_email(customer_name: str, topics: str, next_steps: str) -> str:
    """Erstellt eine Danke-Email mit Gesprächszusammenfassung für den Kunden."""
    content = f"""
        <p style="color: #ccc; font-size: 16px; line-height: 1.6;">
            Hallo {customer_name},
        </p>
        <p style="color: #aaa; font-size: 15px; line-height: 1.6;">
            vielen Dank für das Gespräch mit Elite, unserem KI-Assistenten!
            Hier ist eine kurze Zusammenfassung:
        </p>

        <!-- Besprochene Themen -->
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #4ad7e6; margin: 0 0 12px; font-size: 15px;">📋 Besprochene Themen</h3>
            <p style="color: #bbb; font-size: 14px; line-height: 1.8; margin: 0;">{topics}</p>
        </div>

        <!-- Nächste Schritte -->
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #ff0080; margin: 0 0 12px; font-size: 15px;">🎯 Nächste Schritte</h3>
            <p style="color: #bbb; font-size: 14px; line-height: 1.8; margin: 0;">{next_steps}</p>
        </div>

        <!-- CTA -->
        <div style="text-align: center; margin: 28px 0 12px;">
            <a href="{BOOKING_URL}" style="display: inline-block; background: linear-gradient(135deg, #ff0080, #ff4da6); color: white; padding: 14px 32px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 15px;">
                Beratungstermin vereinbaren
            </a>
        </div>

        <p style="color: #888; font-size: 13px; text-align: center;">
            Bei Fragen erreichst du uns unter
            <a href="mailto:{CONTACT_EMAIL}" style="color: #ff0080; text-decoration: none;">{CONTACT_EMAIL}</a>
        </p>
    """
    return _base_wrapper(content)


def build_custom_email(message: str) -> str:
    """Erstellt eine benutzerdefinierte Email mit Webstark-Branding."""
    content = f"""
        <div style="color: #ccc; font-size: 15px; line-height: 1.7; white-space: pre-wrap;">
            {message}
        </div>

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #222;">
            <p style="color: #888; font-size: 13px; text-align: center;">
                Bei Fragen erreichst du uns unter
                <a href="mailto:{CONTACT_EMAIL}" style="color: #ff0080; text-decoration: none;">{CONTACT_EMAIL}</a>
            </p>
        </div>
    """
    return _base_wrapper(content)


def build_developer_briefing(summary: dict) -> str:
    """Erstellt ein detailliertes Briefing-Email für den Developer."""
    interest_color = {
        "hoch": "#00ff88",
        "mittel": "#ffd700",
        "niedrig": "#ff4444",
    }.get(summary.get("interest_level", "mittel"), "#ffd700")

    content = f"""
        <h2 style="color: #ff0080; margin: 0 0 20px;">📊 Gesprächs-Briefing</h2>

        <!-- Kundendaten -->
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 0 0 16px;">
            <h3 style="color: #4ad7e6; margin: 0 0 12px; font-size: 14px;">👤 KUNDE</h3>
            <p style="color: #ccc; margin: 4px 0;"><b>Name:</b> {summary.get('customer_name', 'Unbekannt')}</p>
            <p style="color: #ccc; margin: 4px 0;"><b>Zeitpunkt:</b> {summary.get('timestamp', '-')}</p>
            <p style="color: #ccc; margin: 4px 0;">
                <b>Interesse:</b>
                <span style="color: {interest_color}; font-weight: bold;">
                    {summary.get('interest_level', 'mittel').upper()}
                </span>
            </p>
        </div>

        <!-- Themen -->
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 0 0 16px;">
            <h3 style="color: #4ad7e6; margin: 0 0 12px; font-size: 14px;">📋 BESPROCHENE THEMEN</h3>
            <p style="color: #bbb; line-height: 1.7;">{summary.get('topics', '-')}</p>
        </div>

        <!-- Nächste Schritte -->
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 0 0 16px;">
            <h3 style="color: #ff0080; margin: 0 0 12px; font-size: 14px;">🎯 NÄCHSTE SCHRITTE</h3>
            <p style="color: #bbb; line-height: 1.7;">{summary.get('action_items', '-')}</p>
        </div>
    """
    return _base_wrapper(content)
