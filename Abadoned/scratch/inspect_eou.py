import inspect
import livekit.agents.voice.audio_recognition as audio_recognition

source = inspect.getsource(audio_recognition.AudioRecognition)
lines = source.split('\n')

start = -1
for idx, line in enumerate(lines):
    if 'def _run_eou_detection' in line:
        start = idx
        break

if start != -1:
    for idx in range(start, min(start + 80, len(lines))):
        print(f"{idx+1}: {lines[idx]}")
else:
    print("_run_eou_detection not found")
