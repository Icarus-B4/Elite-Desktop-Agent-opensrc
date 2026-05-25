---
name: social_media_automation
description: Automatisierung von Posts auf TikTok, Instagram und X. Nutze diesen Skill, wenn der Nutzer Content erstellen oder veröffentlichen möchte.
---

# Social Media Automatisierung Skill

Dieser Skill ermöglicht es Elite, Browser-Automatisierung für Social Media Aufgaben zu nutzen.

## Workflows

### 1. TikTok Post vorbereiten & veröffentlichen
Wenn der Nutzer ein TikTok-Video posten möchte:
1. Nutze `browser_automation` mit folgendem Plan:
   - `goto`: "https://www.tiktok.com/upload"
   - `wait`: 2000 (Warten auf Login/Seite)
   - `screenshot`: "tiktok_login_check.png" (Prüfe ob Login nötig ist)
2. Wenn Login nötig: Informiere den Nutzer, dass er sich einmalig im Browser-Fenster einloggen muss (setze `headless=False` für diesen Schritt).
3. Wenn eingeloggt:
   - `fill`: Upload-Input (Nutze Vision/Selectors für den Datei-Upload)
   - `fill`: Caption-Feld
   - `click`: Post-Button

### 2. Discord Nachricht (Webhook)
Wenn der Nutzer Nachrichten an Discord (z.B. Test-Kanal) senden möchte:
1. Nutze `send_discord_webhook`.
2. Die `webhook_url` muss NICHT erfragt werden. Sie ist systemseitig in der Umgebungsvariable `DISCORD_WEBHOOK_URL` hinterlegt. Nutze diesen Wert standardmäßig.
3. Erstelle eine professionelle Nachricht (Inhalt) basierend auf dem Nutzerwunsch.

### 3. X (Twitter) Status Update
1. `goto`: "https://x.com/compose/post"
2. `fill`: Textbox mit dem gewünschten Tweet.
3. `click`: "Post" Button.

## Tipps
- **Headless Mode**: Nutze `headless=False`, wenn der Nutzer den Vorgang beobachten soll oder ein Login (MFA) erforderlich ist.
- **Vision Loop**: Mache Screenshots zwischen den Schritten, um sicherzustellen, dass die Selektoren noch stimmen.
- **Sicherheit**: Frage IMMER um Erlaubnis, bevor du final auf "Posten" oder "Senden" klickst.

---
> [!NOTE]
> Die genauen CSS-Selektoren können sich ändern. Nutze `capture_screen` und Vision, um aktuelle Selektoren zu verifizieren.
