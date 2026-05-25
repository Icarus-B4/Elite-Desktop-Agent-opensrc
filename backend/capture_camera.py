import cv2
import sys
import time
import numpy as np

def is_black_frame(frame, threshold=10):
    """Prüft ob ein Frame vollständig schwarz / leer ist."""
    if frame is None:
        return True
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean_brightness = np.mean(gray)
    return mean_brightness < threshold

def capture(camera_index, out_path):
    """
    Versucht ein Bild von der Webcam zu machen.
    - Fallback-Kette: übergebener Index → alle Indizes 0..5
    - CAP_DSHOW: Windows DirectShow (stabiler als MSMF für virtuelle Cams)
    - 30 Warm-up Frames + 600ms Delay für Iriun / virtuelle Webcams
    - Schwarzbild-Erkennung: verhindert Halluzinationen bei leerem Frame
    """
    indices = [camera_index] if camera_index != 0 else [0, 1, 2, 3, 4, 5]
    
    for idx in indices:
        cap = None
        try:
            # DirectShow-Backend: stabiler unter Windows für Iriun & virtuelle Cams
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if not cap.isOpened():
                continue
            
            # Kamera-Auflösung setzen für bessere Kompatibilität
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            
            # Warmup: virtuelle Webcams (Iriun) brauchen Zeit für ersten Frame
            time.sleep(0.6)
            
            # 30 Dummy-Reads damit der Puffer mit echten Frames gefüllt wird
            for _ in range(30):
                cap.read()
                time.sleep(0.05)
            
            # Bis zu 5 echte Versuche mit Schwarzbild-Check
            for attempt in range(5):
                ret, frame = cap.read()
                if ret and frame is not None and not is_black_frame(frame, threshold=8):
                    cap.release()
                    cv2.imwrite(out_path, frame)
                    print(f"SUCCESS:{idx}")
                    return
                time.sleep(0.1)
            
            cap.release()
            
        except Exception as e:
            if cap is not None:
                try:
                    cap.release()
                except:
                    pass
            continue
    
    print("FAILED")

if __name__ == "__main__":
    if len(sys.argv) > 2:
        capture(int(sys.argv[1]), sys.argv[2])
