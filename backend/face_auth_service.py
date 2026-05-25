"""Local face authentication (MediaPipe Face Landmarker, optional)."""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from pathlib import Path

import numpy as np

from elite_settings import load_elite_settings
from paths import get_writable_path

logger = logging.getLogger("elite-face-auth")

_authenticated = False
_last_score = 0.0


def reference_path() -> str:
    return get_writable_path("reference.jpg")


def auth_state_path() -> str:
    return get_writable_path("auth_state.json")


def is_face_auth_enabled() -> bool:
    return bool(load_elite_settings().get("face_auth_enabled"))


def touch_auth_state() -> None:
    path = auth_state_path()
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                data = json.load(f)
            if data.get("authenticated"):
                data["timestamp"] = time.time()
                with open(path, "w") as f:
                    json.dump(data, f)
        except Exception as e:
            logger.debug("Fehler beim Touchen des Auth-Status: %s", e)


def is_authenticated() -> bool:
    if not is_face_auth_enabled():
        return True
    path = auth_state_path()
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                data = json.load(f)
                if time.time() - data.get("timestamp", 0) < 900:
                    if bool(data.get("authenticated", False)):
                        touch_auth_state()
                        return True
        except Exception as e:
            logger.debug("Fehler beim Lesen des persistenten Auth-Status: %s", e)
    return _authenticated


def set_auth_state(authenticated: bool, score: float = 0.0) -> None:
    global _authenticated, _last_score
    _authenticated = authenticated
    _last_score = score
    
    path = auth_state_path()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump({
                "authenticated": authenticated,
                "score": score,
                "timestamp": time.time()
            }, f)
    except Exception as e:
        logger.error("Fehler beim Speichern des Auth-Status: %s", e)


def get_auth_status() -> dict:
    global _authenticated, _last_score
    path = auth_state_path()
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                data = json.load(f)
                if time.time() - data.get("timestamp", 0) < 900:
                    _authenticated = bool(data.get("authenticated", False))
                    _last_score = float(data.get("score", 0.0))
                else:
                    _authenticated = False
                    _last_score = 0.0
        except Exception:
            pass
            
    return {
        "enabled": is_face_auth_enabled(),
        "authenticated": is_authenticated(),
        "has_reference": os.path.exists(reference_path()),
        "score": _last_score,
    }


def save_reference_image(image_bytes: bytes) -> tuple[bool, str]:
    path = reference_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(image_bytes)
    set_auth_state(True, 1.0)
    return True, "Referenzfoto gespeichert."


def _decode_image(image_b64: str) -> bytes | None:
    raw = image_b64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw)
    except Exception:
        return None


def _load_embedding_mediapipe(image_bytes: bytes) -> np.ndarray | None:
    try:
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision
    except ImportError:
        return None

    model_path = get_writable_path("face_landmarker.task")
    if not model_path or not os.path.exists(model_path):
        logger.warning("face_landmarker.task fehlt – Mock-Modus")
        return None

    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.FaceLandmarkerOptions(
        base_options=base_options,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
        num_faces=1,
    )
    landmarker = vision.FaceLandmarker.create_from_options(options)
    import cv2

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = landmarker.detect(mp_image)
    if not result.face_landmarks:
        return None
    coords = []
    for lm in result.face_landmarks[0]:
        coords.extend([lm.x, lm.y, lm.z])
    return np.array(coords, dtype=np.float32)


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
    return float(np.dot(a, b) / denom)


def verify_frame(image_b64: str, threshold: float = 0.85) -> dict:
    settings = load_elite_settings()
    if not settings.get("face_auth_enabled"):
        set_auth_state(True)
        return {"authenticated": True, "score": 1.0, "message": "Face Auth deaktiviert."}

    ref = reference_path()
    if not os.path.exists(ref):
        return {"authenticated": False, "score": 0.0, "message": "Kein Referenzfoto – bitte Enrollment."}

    frame_bytes = _decode_image(image_b64)
    if not frame_bytes:
        return {"authenticated": False, "score": 0.0, "message": "Ungültiges Bild."}

    ref_bytes = Path(ref).read_bytes()
    ref_emb = _load_embedding_mediapipe(ref_bytes)
    frame_emb = _load_embedding_mediapipe(frame_bytes)

    if ref_emb is None or frame_emb is None:
        # Mock: accept if reference exists and frame decodable
        set_auth_state(True, 0.75)
        return {"authenticated": True, "score": 0.75, "message": "Mock-Auth (MediaPipe nicht verfügbar)."}

    score = _cosine_similarity(ref_emb, frame_emb)
    ok = score >= threshold
    set_auth_state(ok, score)
    return {
        "authenticated": ok,
        "score": round(score, 4),
        "message": "Identität bestätigt." if ok else "Unbekanntes Gesicht.",
    }
