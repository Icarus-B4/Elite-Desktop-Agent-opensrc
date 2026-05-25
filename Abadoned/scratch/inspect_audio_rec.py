import os
import inspect
import livekit.agents.voice.audio_recognition as audio_recognition

source = inspect.getsource(audio_recognition)
lines = source.split('\n')
print("audio_recognition source length:", len(lines))

for idx, line in enumerate(lines):
    if 'def ' in line or 'user_input_transcribed' in line or 'commit_user_turn' in line:
        print(f"Line {idx+1}: {line}")
