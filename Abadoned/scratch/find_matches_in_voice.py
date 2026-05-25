import os
import livekit.agents.voice as voice

voice_dir = os.path.dirname(voice.__file__)
print("voice directory:", voice_dir)
for root, dirs, files in os.walk(voice_dir):
    for f in files:
        if f.endswith('.py'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8', errors='ignore') as file:
                content = file.read()
            if 'def commit_user_turn' in content or '_user_input_transcribed' in content:
                print(f"Match in: {f}")
