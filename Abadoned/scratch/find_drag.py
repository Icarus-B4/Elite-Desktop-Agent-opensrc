with open("mission-control/dashboard/js/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "drag" in line.lower() or "drop" in line.lower():
        print(f"Line {i+1}: {line.strip()}")
