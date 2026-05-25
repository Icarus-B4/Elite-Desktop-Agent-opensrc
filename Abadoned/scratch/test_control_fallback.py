import requests
import json

def test_control_fallback():
    print("Testing Loop Control Fallback (Pause without filename)...")
    payload = {
        "action": "pause",
        "mode": "algorithm",
        "source": "test-script"
    }
    try:
        r = requests.post("http://localhost:31337/api/loops/control", json=payload, timeout=5)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_control_fallback()
