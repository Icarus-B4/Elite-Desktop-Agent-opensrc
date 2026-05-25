"""
Frame Analyse Server – Lightweight FastAPI Service.
Empfängt Base64-Frames vom Frontend und analysiert sie mit:
  - OpenCV: Objekt-/Kantendetektion
  - DeepFace (optional): Gesichtserkennung
  - cluster-fk Clustering-Logik (DBSCAN)

Port: 8001 (unabhängig vom LiveKit Agent auf Port 8000)
"""
import sys
import os
import base64
import logging
import asyncio
import json
from io import BytesIO

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Lade Umgebungsvariablen (.env & .env.local)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_BACKEND_DIR, ".env"))
    load_dotenv(os.path.join(_BACKEND_DIR, ".env.local"))
except ImportError:
    pass

# Pfad zu cluster-fk hinzufügen
sys.path.insert(0, os.path.join(_BACKEND_DIR, "..", "lib", "cluster-fk-main"))

import numpy as np
import cv2
from PIL import Image

try:
    from aiohttp import web
except ImportError:
    print("aiohttp fehlt. Installiere mit: pip install aiohttp")
    sys.exit(1)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("frame-analyzer")

# ============================================================
# OpenCV HAAR-Cascades für schnelle Gesichtserkennung
# ============================================================
face_cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
eye_cascade_path = cv2.data.haarcascades + "haarcascade_eye.xml"
body_cascade_path = cv2.data.haarcascades + "haarcascade_upperbody.xml"

FACE_CASCADE = cv2.CascadeClassifier(face_cascade_path)
EYE_CASCADE = cv2.CascadeClassifier(eye_cascade_path)
BODY_CASCADE = cv2.CascadeClassifier(body_cascade_path)

# ============================================================
# CORS Headers
# ============================================================
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def decode_frame(base64_data: str) -> np.ndarray:
    """Dekodiert einen Base64-Frame zu einem OpenCV-Bild."""
    # Entferne Data-URL-Prefix falls vorhanden
    if "," in base64_data:
        base64_data = base64_data.split(",", 1)[1]

    img_bytes = base64.b64decode(base64_data)
    img_pil = Image.open(BytesIO(img_bytes)).convert("RGB")
    img_np = np.array(img_pil)
    # PIL ist RGB, OpenCV erwartet BGR
    return cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)


def detect_faces(frame: np.ndarray) -> list:
    """
    Face-Clustering via OpenCV HAAR-Cascades.
    Gibt Liste von Bounding Boxes zurück: {x, y, w, h, label, confidence}
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)  # Kontrast verbessern

    faces = FACE_CASCADE.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30), # Sensibler für kleine Gesichter
        flags=cv2.CASCADE_SCALE_IMAGE,
    )

    results = []
    h_frame, w_frame = frame.shape[:2]

    for i, (x, y, w, h) in enumerate(faces):
        results.append({
            "id": f"face_{i}",
            "label": "Person / Gesicht",
            "type": "face",
            "confidence": 0.92,
            "x": round(x / w_frame * 100, 2),
            "y": round(y / h_frame * 100, 2),
            "w": round(w / w_frame * 100, 2),
            "h": round(h / h_frame * 100, 2),
            "color": "#ff3366", # Kräftigeres Rot
        })

    return results


def detect_objects_contour_fallback(frame: np.ndarray) -> list:
    """Notfall-Fallback ohne KI – nur kleine Konturen, generische Labels vermeiden."""
    h_frame, w_frame = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = (w_frame * h_frame) * 0.015
    max_area = (w_frame * h_frame) * 0.35

    valid = [c for c in contours if min_area < cv2.contourArea(c) < max_area]
    valid = sorted(valid, key=cv2.contourArea, reverse=True)[:4]

    results = []
    for i, cnt in enumerate(valid):
        x, y, w, h = cv2.boundingRect(cnt)
        pad_x = int(w * 0.08)
        pad_y = int(h * 0.08)
        x, y = x + pad_x, y + pad_y
        w, h = max(8, w - 2 * pad_x), max(8, h - 2 * pad_y)

        results.append({
            "id": f"cv_{i}",
            "label": "Unbekanntes Objekt",
            "type": "object",
            "confidence": 0.45,
            "x": round(x / w_frame * 100, 2),
            "y": round(y / h_frame * 100, 2),
            "w": round(w / w_frame * 100, 2),
            "h": round(h / h_frame * 100, 2),
            "color": "#00f2ff",
        })
    return results


def estimate_brightness(frame: np.ndarray) -> float:
    """Berechnet die durchschnittliche Helligkeit des Frames (0-100)."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return round(np.mean(gray) / 255 * 100, 1)

# Pfad für persistente Musikbibliothek
MUSIC_DB_PATH = os.path.join(os.path.dirname(__file__), "music_library.json")

def load_music_cache():
    if os.path.exists(MUSIC_DB_PATH):
        try:
            with open(MUSIC_DB_PATH, "r", encoding="utf-8") as f:
                return json.load(f).get("songs", [])
        except Exception as e:
            logger.error(f"Fehler beim Laden der Musik-DB: {e}")
    return []

def save_music_cache(songs):
    try:
        with open(MUSIC_DB_PATH, "w", encoding="utf-8") as f:
            json.dump({"songs": songs}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Fehler beim Speichern der Musik-DB: {e}")

# Initialisiere Cache aus Datei
music_library_cache = load_music_cache()

# ============================================================
# HTTP Handler
# ============================================================
async def handle_music_get(request: web.Request) -> web.Response:
    """Gibt die aktuell gescannten Songs zurück."""
    return web.json_response({"songs": music_library_cache}, headers=CORS_HEADERS)

async def handle_music_post(request: web.Request) -> web.Response:
    """Speichert eine neue Songliste persistent."""
    global music_library_cache
    try:
        data = await request.json()
        if "songs" in data:
            music_library_cache = data["songs"]
            save_music_cache(music_library_cache)
            logger.info(f"Musik-Cache persistent gespeichert: {len(music_library_cache)} Songs.")
            return web.json_response({"status": "ok", "count": len(music_library_cache)}, headers=CORS_HEADERS)
        return web.json_response({"error": "No songs provided"}, status=400, headers=CORS_HEADERS)
    except Exception as e:
        logger.error(f"Music Post Fehler: {e}")
        return web.json_response({"error": str(e)}, status=500, headers=CORS_HEADERS)

async def handle_analyze(request: web.Request) -> web.Response:
    """
    POST /analyze
    Body: { "frame": "data:image/jpeg;base64,..." }
    Antwort: { "detections": [...], "brightness": float, "face_count": int }
    """
    try:
        body = await request.json()
        frame_data = body.get("frame", "")

        if not frame_data:
            return web.json_response({"error": "Kein Frame erhalten"}, status=400, headers=CORS_HEADERS)

        # Frame dekodieren
        frame = decode_frame(frame_data)
        logger.info(f"Frame empfangen: {frame.shape[1]}x{frame.shape[0]}")

        from object_vision import detect_objects_with_ai

        brightness = estimate_brightness(frame)
        ai_objects, vision_source = await detect_objects_with_ai(frame_data)

        ai_faces = [o for o in ai_objects if o.get("type") == "face"]
        objects = [o for o in ai_objects if o.get("type") != "face"]

        faces = ai_faces if ai_faces else detect_faces(frame)
        if not objects and vision_source == "none":
            objects = detect_objects_contour_fallback(frame)

        all_detections = faces + objects
        vision_hint = None
        if vision_source == "none" and not ai_objects:
            vision_hint = (
                "Für genaue Objektnamen und Kästen: OPENAI_API_KEY in backend/.env setzen "
                "und frame_analyzer neu starten."
            )

        fh, fw = frame.shape[:2]
        response = {
            "detections": all_detections,
            "face_count": len(faces),
            "object_count": len(objects),
            "brightness": brightness,
            "resolution": f"{fw}x{fh}",
            "frame_width": fw,
            "frame_height": fh,
            "vision_source": vision_source if ai_objects else ("opencv" if objects else "none"),
            "vision_hint": vision_hint,
        }

        logger.info(
            "Analyse: %s Gesichter, %s Objekte (%s), Helligkeit %s%%",
            len(faces),
            len(objects),
            response["vision_source"],
            brightness,
        )
        return web.json_response(response, headers=CORS_HEADERS)

    except Exception as e:
        logger.error(f"Analyse-Fehler: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500, headers=CORS_HEADERS)


async def handle_options(request: web.Request) -> web.Response:
    """CORS Preflight"""
    return web.Response(headers=CORS_HEADERS)


async def handle_health(request: web.Request) -> web.Response:
    """Health-Check Endpunkt"""
    return web.json_response({"status": "ok", "service": "frame-analyzer"}, headers=CORS_HEADERS)


async def handle_analyze_face(request: web.Request) -> web.Response:
    """
    POST /analyze-face
    Body: { "frame": "data:image/jpeg;base64,..." }
  Antwort: { "report": "...", "model": "gpt-4o" } oder { "error": "..." }
    """
    try:
        from face_vision import analyze_face_aesthetics

        body = await request.json()
        frame_data = body.get("frame", "")
        if not frame_data:
            return web.json_response({"error": "Kein Frame erhalten"}, status=400, headers=CORS_HEADERS)

        # Optional: OpenCV-Vorcheck – mindestens ein Gesicht
        frame = decode_frame(frame_data)
        faces = detect_faces(frame)
        if len(faces) == 0:
            return web.json_response(
                {
                    "error": "Kein Gesicht erkannt. Bitte frontal ins Bild schauen.",
                    "face_count": 0,
                },
                status=422,
                headers=CORS_HEADERS,
            )

        result = await analyze_face_aesthetics(frame_data)
        result["face_count"] = len(faces)
        status = 200 if "report" in result else 500
        return web.json_response(result, status=status, headers=CORS_HEADERS)
    except Exception as e:
        logger.error("Face-Report-Fehler: %s", e, exc_info=True)
        return web.json_response({"error": str(e)}, status=500, headers=CORS_HEADERS)


# ============================================================
# Server starten
# ============================================================
def create_app() -> web.Application:
    app = web.Application(client_max_size=50 * 1024 * 1024)  # 50MB für große Frames
    app.router.add_post("/analyze", handle_analyze)
    app.router.add_post("/analyze-face", handle_analyze_face)
    app.router.add_options("/analyze", handle_options)
    app.router.add_options("/analyze-face", handle_options)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/music", handle_music_get)
    app.router.add_post("/music", handle_music_post)
    app.router.add_options("/music", handle_options)
    return app


if __name__ == "__main__":
    port = int(os.environ.get("ANALYZER_PORT", 8001))
    logger.info(f"Frame Analyzer Server startet auf Port {port}...")
    app = create_app()
    web.run_app(app, host="0.0.0.0", port=port)
