import os

def debug_scan():
    music_dir = os.path.join(os.path.expanduser("~"), "Music")
    print(f"DEBUG: Suche in Pfad: {music_dir}")
    
    if not os.path.exists(music_dir):
        print("DEBUG: Pfad existiert NICHT!")
        return

    extensions = ('.mp3', '.wav', '.flac', '.m4a', '.ogg')
    found = []
    
    try:
        for root, _, files in os.walk(music_dir):
            for file in files:
                if file.lower().endswith(extensions):
                    found.append(os.path.join(root, file))
        
        print(f"DEBUG: Gefundene Dateien ({len(found)}):")
        for f in found[:10]:
            print(f"  - {f}")
            
    except Exception as e:
        print(f"DEBUG: Fehler: {e}")

if __name__ == "__main__":
    debug_scan()
