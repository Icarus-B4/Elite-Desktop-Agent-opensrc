import inspect
import livekit.agents.voice.agent_activity as agent_activity

source = inspect.getsource(agent_activity)
lines = source.split('\n')

for idx, line in enumerate(lines):
    if 'def on_end_of_turn' in line or 'on_end_of_turn' in line:
        print(f"Line {idx+1}: {line}")
