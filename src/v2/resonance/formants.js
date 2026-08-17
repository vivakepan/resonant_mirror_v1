/**
 * Formant estimates from a linear-predictive envelope (REQ-018).
 *
 * High fundamentals sparsely sample the vocal-tract envelope. The estimator
 * MUST return unknown rather than false precision.
 */

import { binToHertz, magnitudeSpectrum } from '../acoustic/fft.js';

export const FORMANT_ALGORITHM_VERSION = 'lpc-envelope-1';

export function autocorrelation(samples, order) {
  const r = new Float64Array(order + 1);
  const n = samples.length;
  for (let lag = 0; lag <= order; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += samples[i] * samples[i + lag];
    r[lag] = s;
  }
  return r;
}

export function levinsonDurbin(r, order) {
  const a = new Float64Array(order + 1);
  a[0] = 1;
  let e = r[0];
  if (!(e > 1e-12)) return { a, error: e, gain: 0 };
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc -= a[j] * r[i - j];
    const k = acc / e;
    const next = new Float64Array(a);
    next[i] = k;
    for (let j = 1; j < i; j++) next[j] = a[j] - k * a[i - j];
    for (let j = 1; j <= i; j++) a[j] = next[j];
    e *= 1 - k * k;
    if (!(e > 0)) break;
  }
  return { a, error: e, gain: Math.sqrt(Math.max(e, 0)) };
}

function dftMagOfPolynomial(a, gain, fftSize) {
  const n = fftSize;
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < mag.length; k++) {
    const w = -2 * Math.PI * k / n;
    let re = 0;
    let im = 0;
    for (let j = 0; j < a.length; j++) {
      re += a[j] * Math.cos(w * j);
      im += a[j] * Math.sin(w * j);
    }
    const den = re * re + im * im;
    mag[k] = den > 1e-12 ? gain / Math.sqrt(den) : 0;
  }
  return mag;
}

function peakIndices(mag, sampleRate, fftSize, { minHz = 200, maxHz = 4000, count = 3 } = {}) {
  const peaks = [];
  const minBin = Math.max(2, Math.floor((minHz * fftSize) / sampleRate));
  const maxBin = Math.min(mag.length - 2, Math.floor((maxHz * fftSize) / sampleRate));
  for (let k = minBin; k <= maxBin; k++) {
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > 0) {
      peaks.push({ bin: k, mag: mag[k], hz: binToHertz(k, sampleRate, fftSize) });
    }
  }
  peaks.sort((a, b) => b.mag - a.mag);
  const chosen = [];
  for (const p of peaks) {
    if (chosen.some((c) => Math.abs(c.hz - p.hz) < 200)) continue;
    chosen.push(p);
    if (chosen.length >= count) break;
  }
  chosen.sort((a, b) => a.hz - b.hz);
  return chosen;
}

function smoothedEnvelopePeaks(samples, sampleRate) {
  const { mag, fftSize } = magnitudeSpectrum(samples);
  const width = Math.max(3, Math.round((220 * fftSize) / sampleRate));
  const env = new Float64Array(mag.length);
  for (let i = 0; i < mag.length; i++) {
    let s = 0;
    let n = 0;
    for (let j = i - width; j <= i + width; j++) {
      if (j >= 0 && j < mag.length) {
        s += mag[j];
        n += 1;
      }
    }
    env[i] = n ? s / n : 0;
  }
  return { peaks: peakIndices(env, sampleRate, fftSize, { count: 3 }), env };
}

function packFormants(peaks, {
  confidenceScale = 1,
  qualityFlags = [],
  env = null,
  fallback = false,
} = {}) {
  const formantsHertz = peaks.map((p) => p.hz);
  const maxPeak = Math.max(...peaks.map((p) => p.mag), 0);
  const formantConfidence = peaks.map((p) => {
    const rel = maxPeak > 0 ? p.mag / maxPeak : 0;
    return Math.max(0, Math.min(1, rel * confidenceScale));
  });
  while (formantsHertz.length < 3) {
    formantsHertz.push(null);
    formantConfidence.push(0);
  }
  return {
    formantsHertz,
    formantConfidence,
    spectralEnvelope: env,
    algorithmVersion: FORMANT_ALGORITHM_VERSION,
    qualityFlags,
    unknown: false,
    fallback,
  };
}

export function estimateFormants(samples, sampleRate, { f0 = null, order = 14 } = {}) {
  const n = samples.length;
  if (n < order * 4) {
    return unknownFormants('short_window');
  }

  // Pre-emphasis
  const x = new Float32Array(n);
  x[0] = samples[0];
  for (let i = 1; i < n; i++) x[i] = samples[i] - 0.97 * samples[i - 1];

  const r = autocorrelation(x, order);
  const { a, gain } = levinsonDurbin(r, order);
  const fftSize = 512;
  const env = dftMagOfPolynomial(a, gain || 1, fftSize);
  const peaks = peakIndices(env, sampleRate, fftSize, { count: 3 });

  let confidenceScale = 1;
  const qualityFlags = [];
  if (f0 != null && f0 > 400) {
    return unknownFormants('high_f0', ['unreliable_formant_estimate']);
  }
  if (f0 != null && f0 > 350) {
    confidenceScale *= 0.35;
    qualityFlags.push('unreliable_formant_estimate');
  }

  const maxPeak = peaks.length ? Math.max(...peaks.map((p) => p.mag)) : 0;
  const formantConfidence = peaks.map((p) => {
    const rel = maxPeak > 0 ? p.mag / maxPeak : 0;
    return Math.max(0, Math.min(1, rel * confidenceScale));
  });
  const tooLow = !formantConfidence.length || formantConfidence.every((c) => c < 0.25);
  if (peaks.length >= 2 && !tooLow) {
    return packFormants(peaks, {
      confidenceScale,
      qualityFlags,
      env,
    });
  }

  const spectral = smoothedEnvelopePeaks(samples, sampleRate);
  if (spectral.peaks.length >= 2) {
    return packFormants(spectral.peaks, {
      confidenceScale: Math.min(0.45, confidenceScale),
      qualityFlags: [...qualityFlags, 'unreliable_formant_estimate'],
      env: spectral.env,
      fallback: true,
    });
  }
  return unknownFormants(peaks.length < 2 ? 'too_few_peaks' : 'low_confidence', qualityFlags);
}

function unknownFormants(reason, qualityFlags = []) {
  return {
    formantsHertz: [null, null, null],
    formantConfidence: [0, 0, 0],
    spectralEnvelope: null,
    algorithmVersion: FORMANT_ALGORITHM_VERSION,
    qualityFlags: qualityFlags.includes('unreliable_formant_estimate')
      ? qualityFlags
      : [...qualityFlags, 'unreliable_formant_estimate'],
    unknown: true,
    reason,
  };
}

export function resonanceTrajectory(formantFrames) {
  return {
    f1: formantFrames.map((f) => f.formantsHertz[0] ?? null),
    f2: formantFrames.map((f) => f.formantsHertz[1] ?? null),
    f3: formantFrames.map((f) => f.formantsHertz[2] ?? null),
    confidence: formantFrames.map((f) => Math.min(...(f.formantConfidence || [0]))),
  };
}
