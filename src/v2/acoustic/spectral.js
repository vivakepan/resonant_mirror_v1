/**
 * Deterministic spectral descriptors from a magnitude spectrum.
 */

import { magnitudeSpectrum, binToHertz } from './fft.js';

export function spectralFeatures(samples, sampleRate) {
  const { mag, fftSize } = magnitudeSpectrum(samples);
  let energy = 0;
  let weighted = 0;
  for (let k = 1; k < mag.length; k++) {
    const f = binToHertz(k, sampleRate, fftSize);
    const m = mag[k];
    energy += m;
    weighted += f * m;
  }
  const centroid = energy > 0 ? weighted / energy : null;

  const total = mag.reduce((a, b) => a + b, 0);
  let acc = 0;
  let rolloff = null;
  if (total > 0) {
    for (let k = 0; k < mag.length; k++) {
      acc += mag[k];
      if (acc >= 0.85 * total) {
        rolloff = binToHertz(k, sampleRate, fftSize);
        break;
      }
    }
  }

  const tilt = spectralTilt(mag, sampleRate, fftSize);
  return {
    spectralCentroidHertz: centroid,
    spectralRolloffHertz: rolloff,
    spectralTilt: tilt,
    fftSize,
  };
}

/** Linear slope of log magnitude vs log frequency. Negative is typical. */
export function spectralTilt(mag, sampleRate, fftSize) {
  const xs = [];
  const ys = [];
  for (let k = 2; k < mag.length; k++) {
    if (mag[k] <= 1e-9) continue;
    const f = binToHertz(k, sampleRate, fftSize);
    if (f < 80 || f > 8000) continue;
    xs.push(Math.log(f));
    ys.push(Math.log(mag[k]));
  }
  if (xs.length < 8) return null;
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i];
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  return (n * sxy - sx * sy) / den;
}

export function harmonicity(samples, sampleRate, f0) {
  if (!(f0 > 0)) return null;
  const { mag, fftSize } = magnitudeSpectrum(samples);
  const binHz = sampleRate / fftSize;
  let harmonic = 0;
  let total = 0;
  for (let k = 1; k < mag.length; k++) {
    const f = k * binHz;
    if (f > 8000) break;
    total += mag[k] * mag[k];
    const nearest = Math.round(f / f0);
    if (nearest >= 1 && nearest <= 12 && Math.abs(f - nearest * f0) < binHz * 1.5) {
      harmonic += mag[k] * mag[k];
    }
  }
  if (!(total > 0)) return null;
  return Math.max(0, Math.min(1, harmonic / total));
}
