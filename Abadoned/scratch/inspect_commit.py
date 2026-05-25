import inspect
import livekit.agents.voice.audio_recognition as audio_recognition

source = inspect.getsource(audio_recognition.AudioRecognition)
lines = source.split('\n')

# Find commit_user_turn lines
start = -1
for idx, line in enumerate(lines):
    if 'def commit_user_turn' in line:
        start = idx
        break

if start != -1:
    for idx in range(start, min(start + 100, len(lines))):
        print(f"{idx+1}: {lines[idx]}")
else:
    print("commit_user_turn not found in AudioRecognition")
