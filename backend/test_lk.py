import os
import asyncio
from livekit import rtc, api
from dotenv import load_dotenv

# Env aus backend ordner laden
load_dotenv("backend/.env.local")

async def test_connection():
    url = os.environ.get("LIVEKIT_URL")
    api_key = os.environ.get("LIVEKIT_API_KEY")
    api_secret = os.environ.get("LIVEKIT_API_SECRET")
    
    print(f"Testing connection to {url}")
    print(f"API Key: {api_key}")
    
    if not url or not api_key:
        print("Error: Environment variables not loaded correctly.")
        return

    token = api.AccessToken(api_key, api_secret) \
        .with_identity("test-connection") \
        .with_grants(api.VideoGrants(room_join=True, room="elite-main-room")) \
        .to_jwt()
    
    room = rtc.Room()
    try:
        await room.connect(url, token)
        print("Successfully connected to LiveKit!")
        await room.disconnect()
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
