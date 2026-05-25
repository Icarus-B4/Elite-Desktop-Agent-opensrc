
import os
import asyncio
from openai import AsyncOpenAI
from dotenv import load_dotenv

# Env aus backend ordner laden
load_dotenv("backend/.env.local")

async def check_systems():
    load_dotenv("backend/.env.local")
    
    # 1. OpenAI Check
    openai_key = os.environ.get("OPENAI_API_KEY")
    print("--- OpenAI Status ---")
    client = AsyncOpenAI(api_key=openai_key)
    try:
        await client.chat.completions.create(model="gpt-3.5-turbo", messages=[{"role":"user","content":"hi"}], max_tokens=5)
        print("OK: OpenAI is active (Credits available)")
    except Exception as e:
        print(f"FAILED: OpenAI Error ({e})")

    # 2. LiveKit Check
    print("\n--- LiveKit Status ---")
    lk_url = os.environ.get("LIVEKIT_URL")
    lk_key = os.environ.get("LIVEKIT_API_KEY")
    lk_secret = os.environ.get("LIVEKIT_API_SECRET")
    
    from livekit.api import LiveKitAPI, ListRoomsRequest
    try:
        api = LiveKitAPI(lk_url, lk_key, lk_secret)
        rooms = await api.room.list_rooms(ListRoomsRequest())
        print(f"OK: LiveKit connected (Project active)")
        print(f"Active Rooms: {len(rooms.rooms)}")
        await api.aclose()
    except Exception as e:
        print(f"FAILED: LiveKit Error ({e})")

if __name__ == "__main__":
    asyncio.run(check_systems())
