from livekit.agents import voice
import inspect

print("UserInputTranscribedEvent attributes:", dir(voice.UserInputTranscribedEvent))
# Let's see what attributes it has by printing doc or annot
print("annotations:", voice.UserInputTranscribedEvent.__annotations__)
