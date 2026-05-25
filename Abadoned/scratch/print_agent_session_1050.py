import inspect
import livekit.agents.voice.agent_session as agent_session

source = inspect.getsource(agent_session)
lines = source.split('\n')

for idx in range(1050, 1100):
    if idx < len(lines):
        print(f"{idx+1}: {lines[idx]}")
