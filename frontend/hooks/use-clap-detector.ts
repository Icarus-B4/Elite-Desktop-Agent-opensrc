import { useEffect, useRef } from 'react';
import { getAudioContext } from './use-audio-analyzer';

/**
 * Hook zur Erkennung eines Händeklatschens (Clap Detection).
 * Analysiert den Audiostream direkt im Audio-Thread des Browsers (via ScriptProcessorNode).
 * Nutzt hochsensible Parameter für Onset-Flanke und Spektralenergie bei gleichzeitiger
 * Beibehaltung der strengen Daueranalyse (Decay im nächsten Puffer), damit normales/leiseres
 * Klatschen mühelos erkannt wird, während Sprache weiterhin absolut blockiert bleibt.
 */
export function useClapDetector(
  track: MediaStreamTrack | null,
  onDoubleClap: () => void,
  enabled: boolean = true
) {
  const onDoubleClapRef = useRef(onDoubleClap);
  onDoubleClapRef.current = onDoubleClap;

  useEffect(() => {
    if (!enabled || !track || track.readyState !== 'live') {
      return;
    }

    const context = getAudioContext();
    if (!context) return;

    if (context.state === 'suspended') {
      void context.resume();
    }

    const stream = new MediaStream([track]);
    const source = context.createMediaStreamSource(stream);
    
    // ScriptProcessorNode für drosselungsresistente Hintergrundanalyse im Audio-Thread.
    const bufferSize = 2048;
    const scriptNode = context.createScriptProcessor(bufferSize, 1, 1);
    
    const analyser = context.createAnalyser();
    analyser.fftSize = 256; // 128 Frequenzbänder (Bins)
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);

    source.connect(analyser);
    analyser.connect(scriptNode);
    scriptNode.connect(context.destination);

    let longEnergy = 1.0; // Dynamischer Rauschpegel (TV, Hintergrund)
    let prevRms = 1.0; // Pegel des vorherigen Puffers zur Flankenanalyse
    let lastClapBufferIndex = 0;
    let bufferCount = 0;
    
    let isPeak = false;
    let peakValue = 0;
    let peakIndex = 0;
    let cooldownUntilBuffer = 0;

    scriptNode.onaudioprocess = (audioProcessingEvent) => {
      if (track.readyState !== 'live') return;

      bufferCount++;
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);
      const len = inputData.length;

      // 1. RMS (Effektivwert des Pegels) aus der Time-Domain berechnen
      let sum = 0;
      for (let i = 0; i < len; i++) {
        const val = inputData[i];
        sum += val * val;
      }
      const rms = Math.sqrt(sum / len) * 100;

      // Langsame Anpassung des Hintergrundrauschens (TV, Gespräche)
      if (rms < longEnergy * 2) {
        longEnergy = longEnergy * 0.995 + rms * 0.005;
      } else {
        longEnergy = longEnergy * 0.999 + rms * 0.001;
      }
      longEnergy = Math.max(longEnergy, 0.3); // Mindestrauschpegel

      // Frequenzdaten holen
      analyser.getByteFrequencyData(frequencyData);

      // Spektral-Verhältnis berechnen (Höhen zu Tiefen/Mitten)
      // Bins 0-8: 0Hz bis 1500Hz, Bins 12-40: 2250Hz bis 7500Hz
      let lowEnergy = 0;
      for (let i = 0; i <= 8; i++) {
        lowEnergy += frequencyData[i];
      }
      let highEnergy = 0;
      for (let i = 12; i <= 40; i++) {
        highEnergy += frequencyData[i];
      }
      const spectralRatio = lowEnergy > 0 ? highEnergy / lowEnergy : 0;

      // A. Erkennung eines Onsets (sensiblere Parameter für normales Klatschen)
      // Ein Klatschen muss:
      // 1. Eine geringere Mindestlautstärke haben (rms > 3.5)
      // 2. Das 3.0-fache des Rauschens übersteigen (rms > longEnergy * 3.0)
      // 3. Mindestens das 2.0-fache des vorherigen Pegels betragen (Flankensteilheit)
      // 4. Einen gewissen Höhenanteil besitzen (spectralRatio > 0.30)
      if (!isPeak && rms > 3.5 && rms > longEnergy * 3.0 && rms > prevRms * 2.0 && spectralRatio > 0.30 && bufferCount > cooldownUntilBuffer) {
        isPeak = true;
        peakValue = rms;
        peakIndex = bufferCount;
      } else if (isPeak) {
        // B. Analyse des direkten Nachfolge-Puffers (Decay-Prüfung)
        const elapsed = bufferCount - peakIndex;
        if (elapsed === 1) {
          // Im direkt nächsten Puffer (ca. 45ms später) muss der Pegel auf unter 45% abfallen.
          // Dies blockiert jegliche Sprache/Gesang/TV-Ton zuverlässig.
          if (rms < peakValue * 0.45) {
            isPeak = false;
            cooldownUntilBuffer = bufferCount + 4; // Cooldown von 4 Puffern (ca. 180ms)
            
            const buffersSinceLastClap = bufferCount - lastClapBufferIndex;
            // Double-Clap prüfen (Zeitfenster: 3 bis 18 Puffer, ca. 130ms bis 800ms)
            if (buffersSinceLastClap >= 3 && buffersSinceLastClap <= 18) {
              console.log(`[ClapDetector] 🔥 DOUBLE CLAP ERKANNT! Spektral-Ratio: ${spectralRatio.toFixed(2)}, Peak: ${peakValue.toFixed(1)}`);
              onDoubleClapRef.current();
              lastClapBufferIndex = 0; // Entprellen für Dreifach-Claps
            } else {
              lastClapBufferIndex = bufferCount;
            }
          } else {
            // Signal blieb laut -> Es war Sprache/TV -> verwerfen!
            isPeak = false;
          }
        } else {
          isPeak = false;
        }
      }

      prevRms = rms;
    };

    return () => {
      try {
        source.disconnect(analyser);
        analyser.disconnect(scriptNode);
        scriptNode.disconnect(context.destination);
      } catch (_) {}
    };
  }, [enabled, track]);
}
