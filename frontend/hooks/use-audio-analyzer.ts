import { useEffect, useRef, useState, useCallback } from 'react';

// Gemeinsamer AudioContext für alle Analyzer-Instanzen
let sharedAudioContext: AudioContext | null = null;

export const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioContext) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
};

/**
 * Audio-Analyzer Hook.
 * Akzeptiert:
 * - LiveKit Track-Objekt (hat .mediaStreamTrack)
 * - Roher MediaStreamTrack (von getUserMedia)
 * - null/undefined (keine Analyse)
 */
export function useAudioAnalyzer(track: any) {
  const [levels, setLevels] = useState<number[]>(new Array(8).fill(0));
  const animationRef = useRef<number>(undefined);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const lastTrackRef = useRef<any>(null);

  useEffect(() => {
    if (!track) return;
    // Vermeidung doppelter Verbindungen zum selben Track
    if (track === lastTrackRef.current) return;
    lastTrackRef.current = track;

    const context = getAudioContext();
    if (!context) return;
    if (context.state === 'suspended') {
      context.resume();
    }

    try {
      // MediaStreamTrack extrahieren
      let rawTrack: MediaStreamTrack | null = null;

      if (track instanceof MediaStreamTrack) {
        // Direkt von getUserMedia
        rawTrack = track;
      } else if (track.mediaStreamTrack) {
        // LiveKit Track-Objekt
        rawTrack = track.mediaStreamTrack;
      }

      if (!rawTrack || rawTrack.readyState === 'ended') {
        console.log('[AudioAnalyzer] Track nicht bereit:', rawTrack?.readyState);
        return;
      }

      console.log(
        '[AudioAnalyzer] Verbinde:',
        rawTrack.kind,
        rawTrack.label,
        '(' + rawTrack.readyState + ')'
      );

      // Alten Source trennen
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (_) {}
      }

      // Neuen Stream erstellen und verbinden
      const stream = new MediaStream([rawTrack]);
      const source = context.createMediaStreamSource(stream);
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 256;
      analyzer.smoothingTimeConstant = 0.8;
      source.connect(analyzer);

      sourceRef.current = source;
      analyzerRef.current = analyzer;
      console.log('[AudioAnalyzer] ✅ Verbunden!');
    } catch (err) {
      console.warn('[AudioAnalyzer] Fehler:', err);
    }
  }, [track]);

  // Animation Loop: Frequenzdaten lesen
  useEffect(() => {
    const dataArray = new Uint8Array(128);

    const update = () => {
      const analyzer = analyzerRef.current;
      if (analyzer) {
        analyzer.getByteFrequencyData(dataArray);
        const newLevels: number[] = [];
        for (let i = 0; i < 8; i++) {
          let sum = 0;
          for (let j = 0; j < 16; j++) {
            sum += dataArray[i * 16 + j];
          }
          newLevels[i] = sum / 16 / 256;
        }
        setLevels(newLevels);
      }
      animationRef.current = requestAnimationFrame(update);
    };

    animationRef.current = requestAnimationFrame(update);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return { levels };
}
