"""Offline Neural-TTS via Piper (deutsche Stimmen, z. B. Thorsten)."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import numpy as np
from livekit.agents import tts, utils
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

from paths import get_writable_path

logger = logging.getLogger("elite-piper-tts")

DEFAULT_PIPER_VOICE = "de_DE-thorsten-high"
OUTPUT_SAMPLE_RATE = 24000
NUM_CHANNELS = 1


def get_piper_voices_dir() -> Path:
    path = Path(get_writable_path("voices/piper"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_piper_onnx_path(voice_id: str) -> Path:
    return get_piper_voices_dir() / f"{voice_id}.onnx"


def ensure_piper_voice(voice_id: str) -> Path:
    """Lädt Piper ONNX + JSON nach AppData, falls noch nicht vorhanden."""
    onnx_path = resolve_piper_onnx_path(voice_id)
    if onnx_path.is_file() and onnx_path.with_suffix(".onnx.json").is_file():
        return onnx_path

    from piper.download_voices import download_voice

    logger.info("Lade Piper-Stimme %s (einmalig, ~20–80 MB) …", voice_id)
    download_voice(voice_id, get_piper_voices_dir())
    if not onnx_path.is_file():
        raise FileNotFoundError(f"Piper-Stimme nicht gefunden: {onnx_path}")
    return onnx_path


def synthesize_piper_pcm(text: str, voice_id: str) -> tuple[np.ndarray, int]:
    from piper import PiperVoice

    onnx_path = ensure_piper_voice(voice_id)
    voice = PiperVoice.load(onnx_path)
    chunks: list[np.ndarray] = []
    sample_rate = voice.config.sample_rate
    for chunk in voice.synthesize(text.strip()):
        sample_rate = chunk.sample_rate
        if len(chunk.audio_int16_array):
            chunks.append(chunk.audio_int16_array)
    if not chunks:
        return np.array([], dtype=np.int16), sample_rate
    return np.concatenate(chunks), sample_rate


def resample_pcm_int16(samples: np.ndarray, in_rate: int, out_rate: int) -> np.ndarray:
    if in_rate == out_rate or len(samples) == 0:
        return samples
    ratio = out_rate / in_rate
    new_len = int(len(samples) * ratio)
    if new_len <= 0:
        return samples
    indices = np.linspace(0, len(samples) - 1, new_len).astype(np.int32)
    return samples[indices]


def emit_pcm_to_audio_emitter(
    output_emitter: tts.AudioEmitter,
    samples: np.ndarray,
    *,
    in_rate: int,
    out_rate: int = OUTPUT_SAMPLE_RATE,
) -> None:
    if len(samples) == 0:
        return
    samples = resample_pcm_int16(samples, in_rate, out_rate)
    output_emitter.initialize(
        request_id=utils.shortuuid("tts_"),
        sample_rate=out_rate,
        num_channels=NUM_CHANNELS,
        mime_type="audio/pcm",
    )
    chunk_samples = out_rate // 4
    for i in range(0, len(samples), chunk_samples):
        output_emitter.push(samples[i : i + chunk_samples].tobytes())
    output_emitter.flush()


class _PiperChunkedStream(tts.ChunkedStream):
    def __init__(
        self,
        *,
        tts_impl: "PiperOfflineTTS",
        input_text: str,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(tts=tts_impl, input_text=input_text, conn_options=conn_options)
        self._tts_impl = tts_impl

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        samples, in_rate = await asyncio.to_thread(
            synthesize_piper_pcm,
            self.input_text,
            self._tts_impl.voice_id,
        )
        out_rate = OUTPUT_SAMPLE_RATE
        samples = resample_pcm_int16(samples, in_rate, out_rate)
        if len(samples) == 0:
            return
        output_emitter.initialize(
            request_id=utils.shortuuid("tts_"),
            sample_rate=out_rate,
            num_channels=NUM_CHANNELS,
            mime_type="audio/pcm",
        )
        chunk_samples = max(out_rate // 20, 480)
        for i in range(0, len(samples), chunk_samples):
            await asyncio.sleep(0)
            output_emitter.push(samples[i : i + chunk_samples].tobytes())
        output_emitter.flush()


class PiperOfflineTTS(tts.TTS):
    """Natürliche Offline-Stimme (Piper ONNX, Deutsch)."""

    def __init__(self, voice_id: str = DEFAULT_PIPER_VOICE) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=OUTPUT_SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
        )
        self.voice_id = voice_id

    @property
    def model(self) -> str:
        return f"piper-{self.voice_id}"

    @property
    def provider(self) -> str:
        return "piper"

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return _PiperChunkedStream(
            tts_impl=self, input_text=text, conn_options=conn_options
        )
