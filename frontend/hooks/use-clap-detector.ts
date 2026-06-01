import { useEffect, useRef, useState } from 'react';
import {
  CLAP_SENSITIVITY_PRESETS,
  StrictDoubleClapEngine,
  measureBands,
  tryAcquireClapTriggerLock,
} from './clap-detector-engine';
import { getAudioContext } from './use-audio-analyzer';

const KEYBOARD_GUARD_MS = 900;
const TRIGGER_COOLDOWN_MS = 2200;

/** Eine globale Pipeline pro Track — verhindert parallele ScriptProcessor. */
const pipelineByTrackId = new Map<
  string,
  { refcount: number; teardown: () => void }
>();

/**
 * Strikte Doppelklatsch-Erkennung (Impuls + Abfall + Zeitfenster).
 * Sprache und Tastatur werden über Form, Median und Tastatur-Sperre gefiltert.
 */
export function useClapDetector(
  track: MediaStreamTrack | null,
  onDoubleClap: () => void,
  enabled: boolean = true,
) {
  const onDoubleClapRef = useRef(onDoubleClap);
  onDoubleClapRef.current = onDoubleClap;

  const keyboardGuardUntilRef = useRef(0);

  const [sensitivity, setSensitivity] = useState<number>(() => {
    if (typeof window === 'undefined') return 3;
    const stored = localStorage.getItem('elite-clap-sensitivity');
    const n = stored ? Number(stored) : 3;
    return n === 2 ? 3 : n;
  });

  useEffect(() => {
    const handleChanged = (e: CustomEvent<number>) => {
      setSensitivity(e.detail);
    };
    window.addEventListener('elite-clap-sensitivity-changed' as any, handleChanged);
    return () => {
      window.removeEventListener('elite-clap-sensitivity-changed' as any, handleChanged);
    };
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const armKeyboardGuard = () => {
      keyboardGuardUntilRef.current = Date.now() + KEYBOARD_GUARD_MS;
    };

    window.addEventListener('keydown', armKeyboardGuard, true);
    window.addEventListener('keyup', armKeyboardGuard, true);
    return () => {
      window.removeEventListener('keydown', armKeyboardGuard, true);
      window.removeEventListener('keyup', armKeyboardGuard, true);
    };
  }, [enabled]);

  useEffect(() => {
    const preset = CLAP_SENSITIVITY_PRESETS[sensitivity];
    const trackId = track?.id;

    if (!enabled || !preset || !track || track.readyState !== 'live' || !trackId) {
      return;
    }

    const existing = pipelineByTrackId.get(trackId);
    if (existing) {
      existing.refcount++;
      return () => {
        existing.refcount--;
        if (existing.refcount <= 0) {
          existing.teardown();
          pipelineByTrackId.delete(trackId);
        }
      };
    }

    const context = getAudioContext();
    if (!context) return;

    if (context.state === 'suspended') {
      void context.resume();
    }

    const engine = new StrictDoubleClapEngine(preset);
    const stream = new MediaStream([track]);
    const source = context.createMediaStreamSource(stream);

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 220;
    highpass.Q.value = 0.707;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3000;
    lowpass.Q.value = 0.707;

    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);

    const bufferSize = 2048;
    const scriptNode = context.createScriptProcessor(bufferSize, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(analyser);
    lowpass.connect(scriptNode);
    scriptNode.connect(silentGain);
    silentGain.connect(context.destination);

    const onAudio = (event: AudioProcessingEvent) => {
      if (track.readyState !== 'live') return;

      const now = Date.now();
      if (now < keyboardGuardUntilRef.current) return;

      const input = event.inputBuffer.getChannelData(0);
      analyser.getByteFrequencyData(frequencyData);
      const bands = measureBands(frequencyData);

      if (engine.processFrame(input, bands, now)) {
        if (tryAcquireClapTriggerLock(TRIGGER_COOLDOWN_MS)) {
          onDoubleClapRef.current();
        }
      }
    };

    scriptNode.onaudioprocess = onAudio;

    const teardown = () => {
      scriptNode.onaudioprocess = null;
      engine.reset();
      try {
        source.disconnect();
        highpass.disconnect();
        lowpass.disconnect();
        analyser.disconnect();
        scriptNode.disconnect();
        silentGain.disconnect();
      } catch (_) {}
    };

    pipelineByTrackId.set(trackId, { refcount: 1, teardown });

    return () => {
      const entry = pipelineByTrackId.get(trackId);
      if (!entry) return;
      entry.refcount--;
      if (entry.refcount <= 0) {
        entry.teardown();
        pipelineByTrackId.delete(trackId);
      }
    };
  }, [enabled, track?.id, sensitivity]);
}
