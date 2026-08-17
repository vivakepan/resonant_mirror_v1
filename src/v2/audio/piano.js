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

export function metronomeClick(sampleRate, seconds = 0.04, { accent = false } = {}) {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  const freq = accent ? 2650 : 1680;
  const amp = accent ? 0.62 : 0.4;
  const w = 2 * Math.PI * freq / sampleRate;
  for (let i = 0; i < n; i++) {
    const env = (1 - i / n) ** 2;
    out[i] = env * Math.sin(w * i) * amp;
  }
  return out;
}

export function metronomeTimes(bpm, durationSeconds, offsetSeconds = 0) {
  const period = 60 / bpm;
  const times = [];
  for (let t = offsetSeconds; t < durationSeconds; t += period) times.push(t);
  return times;
}

export function clampBpm(bpm, min = 30, max = 240) {
  const n = Number(bpm);
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}

export function metronomePeriodSeconds(bpm) {
  return 60 / clampBpm(bpm);
}

/** Look-ahead beat list used by the live scheduler (REQ-014). */
export function metronomeSchedule({
  bpm,
  fromTime,
  untilTime,
  beatIndex = 0,
  beatsPerMeasure = 4,
} = {}) {
  const period = metronomePeriodSeconds(bpm);
  const meter = Math.max(1, Math.round(beatsPerMeasure));
  const events = [];
  let t = fromTime;
  let beat = beatIndex;
  while (t < untilTime) {
    events.push({
      time: t,
      beat,
      beatInMeasure: beat % meter,
      accent: beat % meter === 0,
    });
    t += period;
    beat += 1;
    if (events.length > 64) break;
  }
  return { events, nextTime: t, nextBeat: beat, periodSeconds: period };
}

export function tapTempoBpm(timestampsMs, { minBpm = 30, maxBpm = 240 } = {}) {
  if (!timestampsMs || timestampsMs.length < 2) return null;
  const recent = timestampsMs.slice(-8);
  const intervals = [];
  for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1]);
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (!(mean > 0)) return null;
  const bpm = 60000 / mean;
  if (bpm < minBpm || bpm > maxBpm) return null;
  return Math.round(bpm);
}

export function isBlackMidi(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export function midiNoteName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const n = Math.round(midi);
  return `${names[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

/**
 * Two-octave-style keyboard starting on a white key.
 * Default C3–C5 (15 white keys).
 */
export function pianoKeyLayout({ startMidi = 48, whiteKeys = 15 } = {}) {
  let midi = startMidi;
  while (isBlackMidi(midi)) midi += 1;
  const keys = [];
  let whiteIndex = 0;
  while (whiteIndex < whiteKeys) {
    if (isBlackMidi(midi)) {
      keys.push({ midi, color: 'black', whiteIndex: whiteIndex - 1 });
    } else {
      keys.push({ midi, color: 'white', whiteIndex, name: midiNoteName(midi) });
      whiteIndex += 1;
    }
    midi += 1;
  }
  return keys;
}

export function pianoRangeLabel(keys) {
  const whites = keys.filter((k) => k.color === 'white');
  if (!whites.length) return '';
  return `${midiNoteName(whites[0].midi)}–${midiNoteName(whites[whites.length - 1].midi)}`;
}

/** Computer-keyboard map for two octaves above `baseMidi` (a C). */
export const COMPUTER_KEY_OFFSETS = Object.freeze({
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
  KeyI: 24,
});

export function computerKeyToMidi(code, baseMidi = 48) {
  if (!(code in COMPUTER_KEY_OFFSETS)) return null;
  return baseMidi + COMPUTER_KEY_OFFSETS[code];
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
