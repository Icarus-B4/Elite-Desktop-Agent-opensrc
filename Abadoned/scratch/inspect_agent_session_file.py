import inspect
import sys

# Find the file path of livekit.agents.voice
from livekit.agents import voice
print(voice.__file__)

# Let's inspect the agent_session module source code
import livekit.agents.voice.agent_session as agent_session
source = inspect.getsource(agent_session)
print("Source length:", len(source))

# Search for '_user_input_transcribed' in the source
lines = source.split('\n')
for idx, line in enumerate(lines):
    if '_user_input_transcribed' in line:
        print(f"Line {idx+1}: {line}")
