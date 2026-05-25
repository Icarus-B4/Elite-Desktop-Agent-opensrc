import requests
import json

def test_mission_control():
    print("Testing Mission Control Task Creation...")
    payload = {
        "title": "Test Task from Script",
        "description": "Verification of Task Creation API",
        "priority": "high",
        "labels": ["test"],
        "created_by": "test-script"
    }
    try:
        r = requests.post("http://localhost:3001/api/tasks", json=payload, timeout=5)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}")
    except Exception as e:
        print(f"Error connecting to Mission Control: {e}")

def test_pulse_loop_control():
    print("\nTesting Pulse Loop Start...")
    start_payload = {
        "task": "Test Loop from Script",
        "mode": "algorithm",
        "problem": "Test Loop from Script"
    }
    try:
        r = requests.post("http://localhost:31337/api/loops/start", json=start_payload, timeout=5)
        print(f"Status start: {r.status_code}")
        print(f"Response start: {r.text}")
        data = r.json()
        slug = data.get("slug")
        if slug:
            print(f"Activating loop {slug}...")
            control_payload = {
                "action": "start",
                "prdFile": f"{slug}/ISA.md",
                "mode": "algorithm",
                "source": "test-script"
            }
            r2 = requests.post("http://localhost:31337/api/loops/control", json=control_payload, timeout=5)
            print(f"Status control: {r2.status_code}")
            print(f"Response control: {r2.text}")
    except Exception as e:
        print(f"Error connecting to Pulse Daemon: {e}")

if __name__ == "__main__":
    test_mission_control()
    test_pulse_loop_control()
