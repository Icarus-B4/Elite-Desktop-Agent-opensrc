import livekit.agents.voice.agent_session as agent_session
import inspect

source = inspect.getsource(agent_session)
lines = source.split('\n')

# Search for generate_reply calls inside agent_session.py
for idx, line in enumerate(lines):
    if 'generate_reply' in line or 'commit_user_turn' in line or '_run(' in line or '_run_task' in line:
        print(f"Line {idx+1}: {line}")
