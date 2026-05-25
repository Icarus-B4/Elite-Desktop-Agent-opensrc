import inspect
import livekit.agents.voice.audio_recognition as audio_recognition

source = inspect.getsource(audio_recognition.AudioRecognition)
lines = source.split('\n')

start = 970
for idx in range(start, min(start + 80, len(lines))):
    print(f"{idx+1}: {lines[idx]}")
