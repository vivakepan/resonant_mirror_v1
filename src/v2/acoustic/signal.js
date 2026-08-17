/**
 * Deterministic signal helpers. No learned models.
 */

export const A4_HZ = 440;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiFromFrequency(frequencyHertz) {
  return 69 + 12 * Math.log2(frequencyHertz / A4_HZ);
}

export function frequencyFromMidi(midi) {
  return A4_HZ * 2 ** ((midi - 69) / 12);
}

export function freqToNote(frequencyHertz) {
  if (!(frequencyHertz > 0)) {
    return { noteName: null, midi: null, nearestFrequencyHertz: null, centsDeviation: null };
  }
  const midiFloat = midiFromFrequency(frequencyHertz);
  const midi = Math.round(midiFloat);
  const nearest = frequencyFromMidi(midi);
  return {
    midi,
    noteName: `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`,
    nearestFrequencyHertz: nearest,
    centsDeviation: centsError(frequencyHertz, nearest),
  };
}

/** Deterministic cents error (REQ-013). */
export function centsError(measuredFrequency, targetFrequency) {
  return 1200 * Math.log2(measuredFrequency / targetFrequency);
}

export function generateSine(frequencyHertz, sampleRate, seconds, amplitude = 0.5, phase = 0) {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  const w = 2 * Math.PI * frequencyHertz / sampleRate;
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin(w * i + phase);
  return out;
}

export function applyHannInPlace(samples, length = samples.length) {
  const n = length;
  if (n <= 1) return samples;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    samples[i] *= w;
  }
  return samples;
}

export function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function formatPitchDisplay(frequencyHertz, targetFrequency = null) {
  const note = freqToNote(frequencyHertz);
  if (!note.noteName) return 'unknown pitch';
  const freq = frequencyHertz.toFixed(1);
  if (targetFrequency != null) {
    const cents = centsError(frequencyHertz, targetFrequency);
    const rounded = Math.abs(cents).toFixed(0);
    const side = cents > 0.5 ? 'sharp' : cents < -0.5 ? 'flat' : 'in tune';
    if (side === 'in tune') return `${note.noteName} · ${freq} hertz · approximately in tune`;
    return `${note.noteName} · ${freq} hertz · approximately ${rounded} cents ${side}`;
  }
  const cents = note.centsDeviation;
  const rounded = Math.abs(cents).toFixed(0);
  const side = cents > 0.5 ? 'sharp' : cents < -0.5 ? 'flat' : 'in tune';
  if (side === 'in tune') return `${note.noteName} · ${freq} hertz · approximately in tune`;
  return `${note.noteName} · ${freq} hertz · approximately ${rounded} cents ${side}`;
}
