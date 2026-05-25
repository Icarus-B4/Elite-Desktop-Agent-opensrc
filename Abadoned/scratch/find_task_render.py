with open("mission-control/dashboard/js/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

found = False
for i, line in enumerate(lines):
    if "class=" in line and "task-card" in line:
        found = True
        print(f"Match found at line {i+1}:")
        for j in range(max(0, i-5), min(len(lines), i+35)):
            print(f"{j+1}: {lines[j].rstrip()}")
        print("-" * 50)
