with open("mission-control/dashboard/js/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "initdraganddrop" in line.lower() and "function initdraganddrop" not in line.lower():
        print(f"Line {i+1}: {lines[i-2].strip()} -> {line.strip()} -> {lines[i+2].strip()}")
