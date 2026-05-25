import asyncio
import os
import sys

# Add backend to path to import tools
sys.path.append(os.path.join(os.getcwd(), "backend"))

async def run_automated_test():
    print("Starte automatisierten Elite System-Test...")
    
    try:
        from tools import execute_system_command, control_desktop, capture_screen
        from livekit.agents import RunContext
        
        # Mock Context
        class MockContext:
            def disallow_interruptions(self): pass
        
        ctx = MockContext()
        
        # 1. Test: Notepad öffnen
        print("--- Test 1: Notepad öffnen ---")
        res1 = await execute_system_command(ctx, "start notepad")
        print(f"Ergebnis: {res1}")
        
        await asyncio.sleep(2) # Warten bis Notepad offen ist
        
        # 2. Test: Text schreiben
        print("--- Test 2: Text schreiben ---")
        res2 = await control_desktop(ctx, action="type", text="Elite Jarvis Edition: Automatisierter Test erfolgreich!\nSystem-Check abgeschlossen.")
        print(f"Ergebnis: {res2}")
        
        # 3. Test: Screenshot erstellen
        print("--- Test 3: Screenshot erstellen ---")
        res3 = await capture_screen(ctx)
        print(f"Ergebnis: {res3}")
        
        print("\nGesamt-Test erfolgreich abgeschlossen!")
        
    except Exception as e:
        print(f"\nTest fehlgeschlagen: {str(e)}")

if __name__ == "__main__":
    asyncio.run(run_automated_test())
