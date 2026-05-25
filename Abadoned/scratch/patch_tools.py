import os
path = r'c:\Users\ed\Webdesign\webstark.org\webstark-landing-page-main\Elite-Desktop-Agent\backend\tools.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if 'if mode.lower() in ["coding", "programmieren", "entwicklung"]:' in line:
        new_lines.append(line)
        new_lines.append('        # Layout: Explorer (Links 20%), Antygravity (Mitte 50%), Browser (Rechts 30%)\n')
        new_lines.append('        await emit_log(context, "tool_call", "Starte Coding-Workspace Komponenten...")\n')
        new_lines.append('        \n')
        new_lines.append('        # 1. Apps starten\n')
        new_lines.append('        import subprocess\n')
        new_lines.append('        subprocess.Popen("explorer.exe", shell=True)\n')
        new_lines.append('        await launch_app(context, "Antygravity")\n')
        new_lines.append('        await launch_app(context, "Chrome")\n')
        new_lines.append('        \n')
        new_lines.append('        # 2. Warten und Positionieren (mit Retry-Logik)\n')
        new_lines.append('        for i in range(3):\n')
        new_lines.append('            await asyncio.sleep(4)\n')
        new_lines.append('            await move_window(context, "explorer", 0, 0, int(W*0.2), H)\n')
        new_lines.append('            await move_window(context, "Antigravity", int(W*0.2), 0, int(W*0.5), H)\n')
        new_lines.append('            await move_window(context, "chrome", int(W*0.7), 0, int(W*0.3), H)\n')
        new_lines.append('        \n')
        new_lines.append('        return "Coding-Workspace wurde initialisiert."\n')
        skip = True
        continue
    if skip and 'elif mode.lower() in ["design", "webdesign"]:' in line:
        skip = False
    if not skip:
        new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
