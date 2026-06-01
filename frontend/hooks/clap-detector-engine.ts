/**
 * Strikte Doppelklatsch-Erkennung: kurze Impulse, schneller Abfall, kein Dauerlaut (Sprache).
 */

export interface ClapSensitivityPreset {
  /** Peak muss mindestens medianRms * spikeOverMedian sein. */
  spikeOverMedian: number;
  minPeak: number;
  /** Anteil lauter Samples am Peak — Klatschen < 12 %, Sprache/Tastatur höher. */
  maxLoudSampleFraction: number;
  /** Folge-Buffer muss unter peak * minDecayRatio fallen. */
  minDecayRatio: number;
  maxHighToMidRatio: number;
  minGapMs: number;
  maxGapMs: number;
  /** Bei anhaltendem Pegel (Sprache) höhere Anforderung. */
  speechSpikeMultiplier: number;
}

/** 0 = aus; 1 = empfindlich … 4 = sehr streng */
export const CLAP_SENSITIVITY_PRESETS: Record<number, ClapSensitivityPreset | null> = {
  0: null,
  1: {
    spikeOverMedian: 3.2,
    minPeak: 0.055,
    maxLoudSampleFraction: 0.14,
    minDecayRatio: 0.42,
    maxHighToMidRatio: 1.35,
    minGapMs: 120,
    maxGapMs: 520,
    speechSpikeMultiplier: 1.35,
  },
  2: {
    spikeOverMedian: 3.8,
    minPeak: 0.07,
    maxLoudSampleFraction: 0.11,
    minDecayRatio: 0.38,
    maxHighToMidRatio: 1.15,
    minGapMs: 140,
    maxGapMs: 480,
    speechSpikeMultiplier: 1.45,
  },
  3: {
    spikeOverMedian: 4.5,
    minPeak: 0.085,
    maxLoudSampleFraction: 0.09,
    minDecayRatio: 0.35,
    maxHighToMidRatio: 0.95,
    minGapMs: 160,
    maxGapMs: 450,
    speechSpikeMultiplier: 1.55,
  },
  4: {
    spikeOverMedian: 5.5,
    minPeak: 0.11,
    maxLoudSampleFraction: 0.07,
    minDecayRatio: 0.32,
    maxHighToMidRatio: 0.8,
    minGapMs: 180,
    maxGapMs: 420,
    speechSpikeMultiplier: 1.7,
  },
};

const RMS_HISTORY = 40;
const SPEECH_SUSTAIN_BUFFERS = 5;
const SPEECH_SUSTAIN_RATIO = 1.35;

type Phase = 'idle' | 'decay_check' | 'wait_second';

export interface BandEnergies {
  low: number;
  mid: number;
  high: number;
}

export function measureBands(frequencyData: Uint8Array): BandEnergies {
  let low = 0;
  let mid = 0;
  let high = 0;
  for (let i = 1; i <= 4; i++) low += frequencyData[i];
  for (let i = 5; i <= 16; i++) mid += frequencyData[i];
  for (let i = 20; i <= 50; i++) high += frequencyData[i];
  return { low, mid, high };
}

export function computeRms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function loudSampleFraction(data: Float32Array, peak: number): number {
  if (peak <= 0) return 1;
  const gate = peak * 0.5;
  let loud = 0;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) >= gate) loud++;
  }
  return loud / data.length;
}

/** Globaler Lock — auch bei mehreren Hook-Instanzen nur ein Toggle. */
let globalTriggerLockUntil = 0;

export function tryAcquireClapTriggerLock(cooldownMs: number): boolean {
  const now = Date.now();
  if (now < globalTriggerLockUntil) return false;
  globalTriggerLockUntil = now + cooldownMs;
  return true;
}

export function releaseClapTriggerLockEarly(msFromNow: number): void {
  globalTriggerLockUntil = Date.now() + msFromNow;
}

export class StrictDoubleClapEngine {
  private phase: Phase = 'idle';
  private rmsHistory: number[] = [];
  private sustainHighCount = 0;
  private pendingPeak = 0;
  private pendingPeakAt = 0;
  private firstClapAt = 0;

  constructor(private readonly preset: ClapSensitivityPreset) {}

  reset(): void {
    this.phase = 'idle';
    this.pendingPeak = 0;
    this.sustainHighCount = 0;
  }

  private medianRms(): number {
    return this.rmsHistory.length >= 8 ? median(this.rmsHistory) : 0.008;
  }

  private isSpeechHeavy(rms: number): boolean {
    const med = this.medianRms();
    if (rms > med * SPEECH_SUSTAIN_RATIO) {
      this.sustainHighCount++;
    } else {
      this.sustainHighCount = Math.max(0, this.sustainHighCount - 1);
    }
    return this.sustainHighCount >= SPEECH_SUSTAIN_BUFFERS;
  }

  private isStrictImpulse(
    filtered: Float32Array,
    rms: number,
    bands: BandEnergies,
    speechHeavy: boolean,
  ): boolean {
    const peak = maxAbs(filtered);
    const med = this.medianRms();
    let spikeNeed = this.preset.spikeOverMedian;
    if (speechHeavy) spikeNeed *= this.preset.speechSpikeMultiplier;

    const threshold = Math.max(this.preset.minPeak, med * spikeNeed);
    if (peak < threshold || rms < threshold * 0.85) return false;

    if (loudSampleFraction(filtered, peak) > this.preset.maxLoudSampleFraction) {
      return false;
    }

    const highToMid = bands.mid > 0 ? bands.high / bands.mid : 99;
    if (highToMid > this.preset.maxHighToMidRatio) return false;

    return true;
  }

  /**
   * @param nowMs Date.now() für Timing
   * @returns true genau einmal pro erkanntem Doppelklatschen
   */
  processFrame(filtered: Float32Array, bands: BandEnergies, nowMs: number): boolean {
    const rms = computeRms(filtered);

    this.rmsHistory.push(rms);
    if (this.rmsHistory.length > RMS_HISTORY) this.rmsHistory.shift();

    const speechHeavy = this.isSpeechHeavy(rms);

    if (this.phase === 'decay_check') {
      if (rms < this.pendingPeak * this.preset.minDecayRatio) {
        this.phase = 'wait_second';
        this.firstClapAt = this.pendingPeakAt;
      } else if (nowMs - this.pendingPeakAt > 120) {
        this.phase = 'idle';
      }
      return false;
    }

    if (this.phase === 'wait_second') {
      const gap = nowMs - this.firstClapAt;
      if (gap > this.preset.maxGapMs) {
        this.phase = 'idle';
        return false;
      }

      if (
        gap >= this.preset.minGapMs &&
        this.isStrictImpulse(filtered, rms, bands, speechHeavy)
      ) {
        this.phase = 'idle';
        this.sustainHighCount = 0;
        return true;
      }
      return false;
    }

    if (this.isStrictImpulse(filtered, rms, bands, speechHeavy)) {
      this.pendingPeak = maxAbs(filtered);
      this.pendingPeakAt = nowMs;
      this.phase = 'decay_check';
    }

    return false;
  }
}

function maxAbs(data: Float32Array): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > max) max = v;
  }
  return max;
}
