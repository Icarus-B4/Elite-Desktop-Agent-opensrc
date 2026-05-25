import asyncio
import os
import time
from playwright.async_api import async_playwright

async def tiktok_login_check():
    screenshots_dir = "screenshots"
    os.makedirs(screenshots_dir, exist_ok=True)
    screenshot_path = os.path.join(screenshots_dir, "tiktok_login_status.png")
    
    print("Starte TikTok Login-Check...")
    try:
        async with async_playwright() as p:
            # Wir nutzen einen sichtbaren Browser, damit man sieht was passiert (optional)
            # Aber hier im Hintergrund nutzen wir headless=True
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            print("Navigiere zu TikTok...")
            await page.goto("https://www.tiktok.com/login", wait_until="networkidle", timeout=60000)
            
            # Kurz warten für dynamische Inhalte
            await asyncio.sleep(5)
            
            print(f"Speichere Screenshot: {screenshot_path}")
            await page.screenshot(path=screenshot_path)
            
            title = await page.title()
            content = await page.content()
            
            if "Log in" in title or "Anmelden" in title:
                print("STATUS: Nicht eingeloggt. Login-Seite erkannt.")
            else:
                print(f"STATUS: Unklar. Seiten-Titel: {title}")
                
            await browser.close()
            print("Check abgeschlossen.")
    except Exception as e:
        print(f"FEHLER beim Check: {e}")

if __name__ == "__main__":
    asyncio.run(tiktok_login_check())
