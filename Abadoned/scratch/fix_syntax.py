
import os

file_path = r'c:\Users\ed\Webdesign\webstark.org\webstark-landing-page-main\Elite-Desktop-Agent\frontend\app\page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Wir suchen nach der Stelle:
# 1419:       return;
# 1420:     const interval = setInterval(() => {

found = False
for i in range(len(lines) - 1):
    if 'return;' in lines[i] and 'const interval = setInterval' in lines[i+1]:
        # Prüfen ob die Klammer fehlt
        if '}' not in lines[i] and '}' not in lines[i+1]:
            # Wir fügen die Klammer zwischen i und i+1 ein
            indent = lines[i].split('return;')[0]
            # Das if war auf indent - 2
            if_indent = indent[:-2] if len(indent) >= 2 else ""
            lines.insert(i + 1, f"{if_indent}}}\n")
            found = True
            print(f"Fix angewendet bei Zeile {i+1}")
            break

if found:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
else:
    print("Muster nicht gefunden!")
