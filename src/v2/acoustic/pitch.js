/**
 * YIN (de Cheveigné & Kawahara 2002) and McLeod Pitch Method (2005).
 * Deterministic pitch estimators. Not a learned model (REQ-012).
 */

export function estimatePitchYin(samples, sampleRate, {
  threshold = 0.15,
  minHz = 70,
  maxHz = 1200,
} = {}) {
  const n = samples.length;
  if (n < 32 || !(sampleRate > 0)) {
    return { frequencyHertz: null, confidence: 0, periodicity: 0, algorithm: 'yin' };
  }
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(n / 2) - 2, Math.floor(sampleRate / minHz));
  if (tauMax <= tauMin) {
    return { frequencyHertz: null, confidence: 0, periodicity: 0, algorithm: 'yin' };
  }

  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    const limit = n - tau;
    for (let j = 0; j < limit; j++) {
      const diff = samples[j] - samples[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  const cmndf = new Float64Array(tauMax + 1);
  cmndf[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmndf[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  let tauEst = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmndf[tau] < threshold) {
      while (tau + 1 <= tauMax && cmndf[tau + 1] < cmndf[tau]) tau += 1;
      tauEst = tau;
      break;
    }
  }
  if (tauEst < 0) {
    let best = 1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmndf[tau] < best) {
        best = cmndf[tau];
        tauEst = tau;
      }
    }
    if (best > 0.45) {
      return { frequencyHertz: null, confidence: 1 - best, periodicity: 1 - best, algorithm: 'yin' };
    }
  }

  const s0 = cmndf[Math.max(tauMin, tauEst - 1)];
  const s1 = cmndf[tauEst];
  const s2 = cmndf[Math.min(tauMax, tauEst + 1)];
  const denom = (2 * s1) - s2 - s0;
  const betterTau = Math.abs(denom) > 1e-12 ? tauEst + (s0 - s2) / (2 * denom) : tauEst;
  const frequencyHertz = sampleRate / betterTau;
  const periodicity = Math.max(0, Math.min(1, 1 - s1));
  return {
    frequencyHertz,
    confidence: periodicity,
    periodicity,
    algorithm: 'yin',
    algorithmVersion: 'yin-1',
  };
}

export function estimatePitchMpm(samples, sampleRate, {
  minHz = 70,
  maxHz = 1200,
  cutoff = 0.93,
} = {}) {
  const n = samples.length;
  if (n < 32) {
    return { frequencyHertz: null, confidence: 0, periodicity: 0, algorithm: 'mpm' };
  }
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(n / 2) - 2, Math.floor(sampleRate / minHz));
  const nsdf = new Float64Array(tauMax + 1);
  for (let tau = 0; tau <= tauMax; tau++) {
    let ac = 0;
    let m = 0;
    const limit = n - tau;
    for (let j = 0; j < limit; j++) {
      const a = samples[j];
      const b = samples[j + tau];
      ac += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m > 0 ? (2 * ac) / m : 0;
  }

  let maxPos = tauMin;
  let maxVal = -1;
  let started = false;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (!started && nsdf[tau] > 0 && nsdf[tau] >= nsdf[tau - 1]) started = true;
    if (started && nsdf[tau] > maxVal) {
      maxVal = nsdf[tau];
      maxPos = tau;
    }
    if (started && nsdf[tau] < 0) break;
  }
  if (maxVal < 0.3) {
    return { frequencyHertz: null, confidence: Math.max(0, maxVal), periodicity: Math.max(0, maxVal), algorithm: 'mpm' };
  }
  const s0 = nsdf[maxPos - 1] ?? nsdf[maxPos];
  const s1 = nsdf[maxPos];
  const s2 = nsdf[maxPos + 1] ?? nsdf[maxPos];
  const denom = (2 * s1) - s2 - s0;
  const betterTau = Math.abs(denom) > 1e-12 ? maxPos + (s0 - s2) / (2 * denom) : maxPos;
  return {
    frequencyHertz: sampleRate / betterTau,
    confidence: Math.max(0, Math.min(1, s1)),
    periodicity: Math.max(0, Math.min(1, s1)),
    algorithm: 'mpm',
    algorithmVersion: 'mpm-1',
    cutoff,
  };
}

/**
 * Default estimator: YIN, with MPM as a cross-check that can lower confidence
 * when the two disagree by more than a semitone.
 */
export function estimatePitch(samples, sampleRate, options = {}) {
  const yin = estimatePitchYin(samples, sampleRate, options);
  const mpm = estimatePitchMpm(samples, sampleRate, options);
  if (yin.frequencyHertz == null) return { ...yin, crossCheck: mpm };
  if (mpm.frequencyHertz != null) {
    const ratio = yin.frequencyHertz / mpm.frequencyHertz;
    const cents = Math.abs(1200 * Math.log2(ratio));
    if (cents > 100) {
      return { ...yin, confidence: Math.min(yin.confidence, 0.35), qualityFlags: ['low_pitch_confidence'], crossCheck: mpm };
    }
  }
  return { ...yin, crossCheck: mpm };
}
