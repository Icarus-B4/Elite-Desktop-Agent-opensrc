"""Offline Voice-Stack: Whisper STT + Ollama LLM + Piper/Windows TTS."""

from __future__ import annotations

import asyncio
import audioop
import json
import logging
import os
import tempfile
import urllib.error
import urllib.request
import wave
from dataclasses import dataclass

import aiohttp
import numpy as np
from livekit import rtc
from livekit.agents import llm, stt, tts, utils
from livekit.agents._exceptions import APIConnectionError, APIStatusError
from livekit.agents.llm import ChatChunk, ChoiceDelta
from livekit.agents.stt import SpeechData, SpeechEvent, SpeechEventType, STTCapabilities
from livekit.agents.stt.stream_adapter import StreamAdapter
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, NOT_GIVEN, APIConnectOptions, NotGivenOr
from livekit.agents.utils import AudioBuffer
from livekit.plugins import openai, silero

from elite_config import resolve_ollama_model
from piper_tts import (
    DEFAULT_PIPER_VOICE,
    PiperOfflineTTS,
    emit_pcm_to_audio_emitter,
)
from stt_corrections import WHISPER_INITIAL_PROMPT, apply_german_stt_corrections

logger = logging.getLogger("elite-local-voice")

SAMPLE_RATE = 24000
NUM_CHANNELS = 1
TARGET_STT_RATE = 16000


def _audio_buffer_to_numpy(buffer: AudioBuffer) -> np.ndarray:
    frames = buffer if isinstance(buffer, list) else [buffer]
    if not frames:
        return np.array([], dtype=np.float32)
    merged = utils.merge_frames(frames)
    pcm = bytes(merged.data)
    width = 2
    nch = merged.num_channels
    in_rate = merged.sample_rate

    if in_rate != TARGET_STT_RATE and len(pcm) > 0:
        pcm, _ = audioop.ratecv(pcm, width, nch, in_rate, TARGET_STT_RATE, None)

    samples = np.frombuffer(pcm, dtype=np.int16)
    if nch > 1:
        samples = samples.reshape(-1, nch).mean(axis=1).astype(np.int16)
    return samples.astype(np.float32) / 32768.0


class WhisperBatchSTT(stt.STT):
    """Batch-STT mit faster-whisper (lokal, Deutsch)."""

    def __init__(self, model_size: str = "base") -> None:
        super().__init__(
            capabilities=STTCapabilities(
                streaming=False,
                interim_results=False,
                offline_recognize=True,
            )
        )
        self._model_size = model_size
        self._model = None

    @property
    def model(self) -> str:
        return f"whisper-{self._model_size}"

    @property
    def provider(self) -> str:
        return "faster-whisper"

    def _ensure_model(self):
        if self._model is not None:
            return
        from faster_whisper import WhisperModel

        device = "cuda" if os.environ.get("ELITE_WHISPER_DEVICE") == "cuda" else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        logger.info("Lade Whisper-Modell %s (%s)...", self._model_size, device)
        self._model = WhisperModel(self._model_size, device=device, compute_type=compute_type)

    async def _recognize_impl(
        self,
        buffer: AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> SpeechEvent:
        samples = _audio_buffer_to_numpy(buffer)
        if len(samples) < 1600:
            return SpeechEvent(
                type=SpeechEventType.FINAL_TRANSCRIPT,
                alternatives=[SpeechData(language="de", text="")],
            )

        lang = "de"
        if language is not NOT_GIVEN and language:
            lang = str(language).split("-")[0]

        def _transcribe() -> str:
            self._ensure_model()
            segments, _ = self._model.transcribe(
                samples,
                language=lang,
                beam_size=8,
                temperature=0.0,
                vad_filter=True,
                condition_on_previous_text=False,
                initial_prompt=WHISPER_INITIAL_PROMPT,
            )
            raw = " ".join(s.text.strip() for s in segments if s.text.strip())
            return apply_german_stt_corrections(raw)

        try:
            text = await asyncio.to_thread(_transcribe)
        except Exception as e:
            logger.exception("Whisper-Transkription fehlgeschlagen")
            raise APIConnectionError(f"Whisper: {e}") from e

        return SpeechEvent(
            type=SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[SpeechData(language=lang, text=text)],
        )


class _Pyttsx3ChunkedStream(tts.ChunkedStream):
    def __init__(self, *, tts_impl: "WindowsPyttsx3TTS", input_text: str, conn_options: APIConnectOptions):
        super().__init__(tts=tts_impl, input_text=input_text, conn_options=conn_options)
        self._tts_impl = tts_impl

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        wav_path = await asyncio.to_thread(self._tts_impl._synth_to_wav, self.input_text)
        try:
            with wave.open(wav_path, "rb") as wf:
                in_rate = wf.getframerate()
                nch = wf.getnchannels()
                raw = wf.readframes(wf.getnframes())

            samples = np.frombuffer(raw, dtype=np.int16)
            if nch > 1:
                samples = samples.reshape(-1, nch).mean(axis=1).astype(np.int16)

            emit_pcm_to_audio_emitter(output_emitter, samples, in_rate=in_rate, out_rate=SAMPLE_RATE)
        finally:
            try:
                os.unlink(wav_path)
            except OSError:
                pass


class WindowsPyttsx3TTS(tts.TTS):
    """Offline TTS über Windows SAPI (pyttsx3)."""

    def __init__(self) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
        )
        self._engine = None

    @property
    def model(self) -> str:
        return "pyttsx3-sapi"

    @property
    def provider(self) -> str:
        return "windows"

    def _ensure_engine(self):
        if self._engine is not None:
            return
        import pyttsx3

        self._engine = pyttsx3.init()
        for voice in self._engine.getProperty("voices"):
            vid = (voice.id or "").lower()
            if "de" in vid or "german" in (voice.name or "").lower():
                self._engine.setProperty("voice", voice.id)
                break
        self._engine.setProperty("rate", 165)

    def _synth_to_wav(self, text: str) -> str:
        self._ensure_engine()
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        self._engine.save_to_file(text, path)
        self._engine.runAndWait()
        return path

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return _Pyttsx3ChunkedStream(tts_impl=self, input_text=text, conn_options=conn_options)


def build_local_tts(config: dict) -> tuple[tts.TTS, str]:
    """Piper (Standard) oder pyttsx3-Fallback."""
    engine = str(config.get("offlineTtsEngine", "piper")).lower().strip()
    if engine == "pyttsx3":
        logger.info("Offline-TTS: Windows SAPI (pyttsx3)")
        return WindowsPyttsx3TTS(), "pyttsx3-sapi"

    voice_id = str(config.get("piperVoice") or DEFAULT_PIPER_VOICE).strip()
    try:
        tts_engine = PiperOfflineTTS(voice_id=voice_id)
        logger.info("Offline-TTS: Piper Neural-Stimme %s", voice_id)
        return tts_engine, f"piper:{voice_id}"
    except Exception as exc:
        logger.warning(
            "Piper TTS nicht verfügbar (%s) – Fallback auf Windows SAPI. "
            "pip install piper-tts onnxruntime",
            exc,
        )
        return WindowsPyttsx3TTS(), "pyttsx3-sapi"


@dataclass
class LocalVoiceStack:
    vad: silero.VAD
    stt: stt.STT
    llm: llm.LLM
    tts: tts.TTS
    ollama_api_mode: str = "openai-v1"
    tts_engine: str = "piper"


def ollama_root_url(base_url: str) -> str:
    return str(base_url or "http://127.0.0.1:11434/v1").rstrip("/").replace("/v1", "")


def check_ollama_reachable(base_url: str) -> bool:
    try:
        root = ollama_root_url(base_url)
        with urllib.request.urlopen(f"{root}/api/tags", timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def check_ollama_openai_compatible(base_url: str, model: str) -> bool:
    """True wenn /v1/chat/completions erreichbar ist (Ollama >= ~0.1.24)."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "stream": False,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        return True
    except Exception:
        return False


def _chat_ctx_to_ollama_messages(chat_ctx: llm.ChatContext) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for item in chat_ctx.items:
        if not isinstance(item, llm.ChatMessage):
            continue
        text = item.text_content
        if not text:
            continue
        role = item.role
        if role in ("developer", "system"):
            role = "system"
        elif role not in ("user", "assistant"):
            role = "user"
        messages.append({"role": role, "content": text})
    return messages


class OllamaNativeLLM(llm.LLM):
    """Ollama /api/chat für ältere Server ohne OpenAI-kompatible /v1-Route."""

    def __init__(self, *, model: str, base_url: str, temperature: float = 0.4) -> None:
        super().__init__()
        self._model = model
        self._root = ollama_root_url(base_url)
        self._temperature = temperature

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider(self) -> str:
        return "ollama-native"

    def chat(
        self,
        *,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: NotGivenOr[bool] = NOT_GIVEN,
        tool_choice: NotGivenOr[llm.ToolChoice] = NOT_GIVEN,
        extra_kwargs: NotGivenOr[dict] = NOT_GIVEN,
    ) -> llm.LLMStream:
        if tools:
            logger.debug(
                "Ollama native /api/chat: %d Tools werden nicht unterstützt (nur Text-Antworten).",
                len(tools),
            )
        return _OllamaNativeLLMStream(
            self,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
        )


class _OllamaNativeLLMStream(llm.LLMStream):
    async def _run(self) -> None:
        messages = _chat_ctx_to_ollama_messages(self._chat_ctx)
        if not messages:
            messages = [{"role": "user", "content": "Hallo"}]

        payload = {
            "model": self._llm._model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": self._llm._temperature},
        }
        req_id = utils.shortuuid("ollama_")
        timeout = aiohttp.ClientTimeout(total=max(30, self._conn_options.timeout))

        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(f"{self._llm._root}/api/chat", json=payload) as resp:
                body = await resp.text()
                if resp.status != 200:
                    raise APIStatusError(
                        f"Ollama /api/chat HTTP {resp.status}: {body[:500]}",
                        status_code=resp.status,
                        body=body,
                    )
                data = json.loads(body)

        content = str(data.get("message", {}).get("content", "") or "")
        if content:
            self._event_ch.send_nowait(
                ChatChunk(
                    id=req_id,
                    delta=ChoiceDelta(role="assistant", content=content),
                )
            )


def _silero_vad_for_mode(va_mode: int):
    if va_mode == 1:
        return silero.VAD.load(
            min_speech_duration=0.08,
            min_silence_duration=0.55,
            activation_threshold=0.50,
        )
    if va_mode == 3:
        return silero.VAD.load(
            min_speech_duration=0.08,
            min_silence_duration=0.45,
            activation_threshold=0.52,
        )
    return silero.VAD.load(
        min_speech_duration=0.1,
        min_silence_duration=0.65,
        activation_threshold=0.52,
    )


def build_local_voice_stack(config: dict) -> LocalVoiceStack:
    model, base_url = resolve_ollama_model(config)
    whisper_size = config.get("whisperModel", "small")
    va_mode = int(config.get("voiceAssistant", 0))

    if not check_ollama_reachable(base_url):
        raise RuntimeError(
            f"Ollama nicht erreichbar unter {base_url} – starte: ollama serve && ollama pull {model}"
        )

    if check_ollama_openai_compatible(base_url, model):
        ollama_llm: llm.LLM = openai.LLM.with_ollama(
            model=model, base_url=base_url, temperature=0.4
        )
        ollama_api_mode = "openai-v1"
        logger.info("Ollama LLM: OpenAI-kompatible /v1-API (%s)", model)
    else:
        ollama_llm = OllamaNativeLLM(model=model, base_url=base_url, temperature=0.4)
        ollama_api_mode = "native-api"
        logger.warning(
            "Ollama ohne /v1/chat/completions (Server veraltet?) – native /api/chat für %s. "
            "Empfehlung: Ollama aktualisieren (ollama.com/download) für Tool-Unterstützung.",
            model,
        )

    vad = _silero_vad_for_mode(va_mode)
    batch_stt = WhisperBatchSTT(model_size=whisper_size)
    streaming_stt = StreamAdapter(stt=batch_stt, vad=vad)
    tts_engine, tts_label = build_local_tts(config)

    return LocalVoiceStack(
        vad=vad,
        stt=streaming_stt,
        llm=ollama_llm,
        tts=tts_engine,
        ollama_api_mode=ollama_api_mode,
        tts_engine=tts_label,
    )
