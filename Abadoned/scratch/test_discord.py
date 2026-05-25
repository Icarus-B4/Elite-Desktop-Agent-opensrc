import os
import requests
from dotenv import load_dotenv

# Load .env.local from the backend directory
env_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env.local")
load_dotenv(env_path)

webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")

print(f"Versuche Webhook zu testen...")
print(f"URL: {webhook_url}")

if not webhook_url:
    print("FEHLER: DISCORD_WEBHOOK_URL nicht in der Umgebung gefunden.")
else:
    payload = {
        "username": "Elite Test-Bot",
        "content": "🚀 System-Check: Discord Webhook Integration verifiziert."
    }
    try:
        response = requests.post(webhook_url, json=payload)
        if response.status_code in [200, 204]:
            print("ERFOLG: Nachricht wurde an Discord gesendet.")
        else:
            print(f"FEHLER: Discord antwortete mit Status {response.status_code}")
            print(f"Antwort: {response.text}")
    except Exception as e:
        print(f"FEHLER beim Senden: {e}")
