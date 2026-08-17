/**
 * Deterministic piano-tone and metronome sample generators (REQ-014).
 */

import { frequencyFromMidi } from '../acoustic/signal.js';

export function pianoTone(frequencyHertz, sampleRate, seconds, velocity = 0.4) {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  const w = 2 * Math.PI * frequencyHertz / sampleRate;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 3.2);
    out[i] = velocity * env * (
      Math.sin(w * i)
      + 0.45 * Math.sin(2 * w * i)
      + 0.2 * Math.sin(3 * w * i)
      + 0.08 * Math.sin(4 * w * i)
    );
  }
  return out;
}

export function pianoMidi(midi, sampleRate, seconds, velocity) {
  return pianoTone(frequencyFromMidi(midi), sampleRate, seconds, velocity);
}

export function metronomeClick(sampleRate, seconds = 0.04) {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  const w = 2 * Math.PI * 2000 / sampleRate;
  for (let i = 0; i < n; i++) {
    const env = (1 - i / n) ** 2;
    out[i] = env * Math.sin(w * i) * 0.5;
  }
  return out;
}

export function metronomeTimes(bpm, durationSeconds, offsetSeconds = 0) {
  const period = 60 / bpm;
  const times = [];
  for (let t = offsetSeconds; t < durationSeconds; t += period) times.push(t);
  return times;
}

/** Frequency-to-color mapping — deterministic visualization, not a quality score. */
export function frequencyToColor(frequencyHertz) {
  if (!(frequencyHertz > 0)) return '#6b7a88';
  const t = Math.max(0, Math.min(1, Math.log2(frequencyHertz / 70) / Math.log2(2000 / 70)));
  const r = Math.round(255 * t);
  const g = Math.round(180 * (1 - Math.abs(t - 0.5) * 2));
  const b = Math.round(255 * (1 - t));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
