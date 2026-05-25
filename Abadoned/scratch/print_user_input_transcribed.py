import inspect
import sys
import livekit.agents.voice.agent_session as agent_session

source = inspect.getsource(agent_session)
lines = source.split('\n')

# Print lines 1560 to 1600 of agent_session
for idx in range(1560, 1600):
    if idx < len(lines):
        print(f"{idx+1}: {lines[idx]}")
