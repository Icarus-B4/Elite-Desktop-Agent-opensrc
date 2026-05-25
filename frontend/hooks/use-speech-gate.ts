import { useEffect, useRef, useState } from 'react';
import { getAudioContext } from './use-audio-analyzer';

const MIN_THRESHOLD = 4;
const SPEECH_RATIO = 2.6;
const SPEECH_OPEN_MS = 220;
const SILENCE_CLOSE_MS = 850;
const CALIBRATION_MS = 2800;
const UI_LEVEL_INTERVAL_MS = 120;

export type SpeechGateState = 'idle' | 'calibrating' | 'standby' | 'transmitting';

/**
 * Client-seitiges Sprach-Gate – steuert Übertragung über Callback (z. B. LiveKit track.mute),
 * ohne mediaStreamTrack.enabled zu toggeln (verhindert Reconnect-Loops).
 */
export function useSpeechGate(
  mediaTrack: MediaStreamTrack | null | undefined,
  options: {
    enabled: boolean;
    paused: boolean;
    /** true = Audio an Elite senden, false = Gate zu */
    onTransmitChange?: (transmitting: boolean) => void;
  },
) {
  const { enabled, paused, onTransmitChange } = options;
  const onTransmitRef = useRef(onTransmitChange);
  onTransmitRef.current = onTransmitChange;

  const [level, setLevel] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateState, setGateState] = useState<SpeechGateState>('idle');

  const gateOpenRef = useRef(false);
  const noiseFloorRef = useRef(MIN_THRESHOLD);
  const speechMsRef = useRef(0);
  const silenceMsRef = useRef(0);
  const calibratingUntilRef = useRef(0);
  const lastUiLevelAtRef = useRef(0);

  useEffect(() => {
    gateOpenRef.current = gateOpen;
  }, [gateOpen]);

  const applyTransmit = (transmitting: boolean) => {
    if (gateOpenRef.current === transmitting) return;
    gateOpenRef.current = transmitting;
    setGateOpen(transmitting);
    onTransmitRef.current?.(transmitting);
  };

  useEffect(() => {
    if (!enabled || !mediaTrack || mediaTrack.readyState !== 'live') {
      applyTransmit(false);
      setGateState('idle');
      setLevel(0);
      onTransmitRef.current?.(false);
      return;
    }

    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const stream = new MediaStream([mediaTrack]);
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);

    const buf = new Uint8Array(analyser.fftSize);
    calibratingUntilRef.current = performance.now() + CALIBRATION_MS;
    noiseFloorRef.current = MIN_THRESHOLD;
    speechMsRef.current = 0;
    silenceMsRef.current = 0;
    gateOpenRef.current = false;
    setGateOpen(false);
    setGateState('calibrating');
    onTransmitRef.current?.(false);

    const measureRms = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / buf.length) * 100;
    };

    const tick = () => {
      if (paused) {
        onTransmitRef.current?.(false);
        setGateState('standby');
        return;
      }

      const rms = measureRms();
      const now = performance.now();
      if (now - lastUiLevelAtRef.current >= UI_LEVEL_INTERVAL_MS) {
        lastUiLevelAtRef.current = now;
        setLevel(rms);
      }

      const calibrating = now < calibratingUntilRef.current;
      const threshold = Math.max(noiseFloorRef.current * SPEECH_RATIO, MIN_THRESHOLD);

      if (calibrating) {
        noiseFloorRef.current = noiseFloorRef.current * 0.92 + rms * 0.08;
        setGateState('calibrating');
        return;
      }

      const isSpeech = rms >= threshold;

      if (isSpeech) {
        speechMsRef.current += 50;
        silenceMsRef.current = 0;
        if (!gateOpenRef.current && speechMsRef.current >= SPEECH_OPEN_MS) {
          applyTransmit(true);
        }
      } else {
        speechMsRef.current = 0;
        noiseFloorRef.current = noiseFloorRef.current * 0.97 + rms * 0.03;
        if (gateOpenRef.current) {
          silenceMsRef.current += 50;
          if (silenceMsRef.current >= SILENCE_CLOSE_MS) {
            applyTransmit(false);
          }
        }
      }

      setGateState(gateOpenRef.current ? 'transmitting' : 'standby');
    };

    const id = setInterval(tick, 50);
    return () => {
      clearInterval(id);
      try {
        source.disconnect();
      } catch {
        /* noop */
      }
      gateOpenRef.current = false;
      onTransmitRef.current?.(false);
    };
  }, [enabled, paused, mediaTrack]);

  return { level, gateOpen, gateState };
}
