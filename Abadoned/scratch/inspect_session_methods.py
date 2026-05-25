import inspect
from livekit.agents import voice

methods = [m for m in dir(voice.AgentSession) if not m.startswith('__')]
for m in methods:
    attr = getattr(voice.AgentSession, m)
    if inspect.isfunction(attr):
        try:
            sig = inspect.signature(attr)
            print(f"def {m}{sig}")
        except:
            print(f"def {m}(...)")
