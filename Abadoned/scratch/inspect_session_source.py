import inspect
from livekit.agents import voice

try:
    print(inspect.getsource(voice.AgentSession))
except Exception as e:
    print("Error:", e)
