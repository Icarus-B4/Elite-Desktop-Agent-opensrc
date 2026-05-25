import os
import re

directory = r"c:\Users\ed\Webdesign\webstark.org\webstark-landing-page-main\Elite-Desktop-Agent\frontend\components\dashboard"

# Patterns to replace
replacements = [
    (r'text-cyan-400', 'text-primary'),
    (r'text-cyan-300', 'text-primary'),
    (r'text-cyan-500', 'text-primary'),
    (r'bg-cyan-500/10', 'bg-primary/10'),
    (r'bg-cyan-500/20', 'bg-primary/20'),
    (r'bg-cyan-400/10', 'bg-primary/10'),
    (r'ring-cyan-500/20', 'ring-primary/20'),
    (r'ring-cyan-500/30', 'ring-primary/30'),
    (r'border-cyan-500/30', 'border-primary/30'),
    (r'border-cyan-500/40', 'border-primary/40'),
    (r'hover:text-cyan-400', 'hover:text-primary'),
    (r'hover:bg-cyan-500/25', 'hover:bg-primary/25'),
    (r'rgba\(0, 242, 255, 0.8\)', 'var(--accent-glow)'),
    (r'rgba\(34, 211, 238, 0.5\)', 'var(--accent-glow)'),
    (r'rgba\(34, 211, 238, 0.2\)', 'var(--accent-glow)'),
    (r'from-cyan-600', 'from-primary/60'),
    (r'to-blue-700', 'to-primary/70'),
]

for filename in os.listdir(directory):
    if filename.endswith(".tsx"):
        path = os.path.join(directory, filename)
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        
        new_content = content
        for pattern, replacement in replacements:
            new_content = re.sub(pattern, replacement, new_content)
        
        if new_content != content:
            with open(path, "w", encoding="utf-8") as f:
                f.writelines(new_content)
            print(f"Updated {filename}")

print("Bulk replacement completed.")
