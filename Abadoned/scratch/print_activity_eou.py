import inspect
import livekit.agents.voice.agent_activity as agent_activity

source = inspect.getsource(agent_activity)
lines = source.split('\n')

for idx in range(1870, 1910):
    if idx < len(lines):
        print(f"{idx+1}: {lines[idx]}")
