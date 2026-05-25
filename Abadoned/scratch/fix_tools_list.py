import os

tools_path = r"c:\Users\ed\Webdesign\webstark.org\webstark-landing-page-main\Elite-Desktop-Agent\backend\tools.py"

with open(tools_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Letzte Zeile (]) finden und davor einfügen
for i in range(len(lines) - 1, -1, -1):
    if lines[i].strip() == "]":
        lines.insert(i, "    send_discord_webhook,\n")
        break

with open(tools_path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("Tool added to ALL_TOOLS successfully.")
