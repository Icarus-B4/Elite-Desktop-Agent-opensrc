import sys
from livekit import agents
from livekit.agents import voice

print("voice module classes:", dir(voice))
for name in dir(voice):
    obj = getattr(voice, name)
    if isinstance(obj, type):
        print(f"Class {name}:")
        if hasattr(obj, "__init__"):
            import inspect
            try:
                print(f"  init: {inspect.signature(obj.__init__)}")
            except: pass
