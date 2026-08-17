/**
 * Vibrato rate/extent from a pitch contour. Deterministic.
 */

import { centsError } from './signal.js';

export function vibratoFromPitchContour(frequenciesHertz, hopSeconds) {
  const voiced = frequenciesHertz.map((f, i) => ({ f, i })).filter((p) => p.f > 0);
  if (voiced.length < 8) {
    return { rateHertz: null, extentCents: null, consistency: null };
  }
  const meanF = voiced.reduce((s, p) => s + p.f, 0) / voiced.length;
  const cents = voiced.map((p) => centsError(p.f, meanF));
  const extent = Math.max(...cents.map(Math.abs));

  let crossings = 0;
  for (let i = 1; i < cents.length; i++) {
    if ((cents[i - 1] < 0 && cents[i] >= 0) || (cents[i - 1] >= 0 && cents[i] < 0)) crossings += 1;
  }
  const duration = (voiced.length - 1) * hopSeconds;
  const rate = duration > 0 ? (crossings / 2) / duration : null;
  const plausible = rate != null && rate >= 3 && rate <= 12 && extent >= 10 && extent <= 250;
  return {
    rateHertz: plausible ? rate : rate,
    extentCents: extent,
    consistency: plausible ? 1 - Math.min(1, Math.abs((rate || 0) - 5.5) / 5.5) : 0.2,
  };
}

export function spectralFlux(prevMag, mag) {
  if (!prevMag || !mag) return 0;
  const n = Math.min(prevMag.length, mag.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.max(0, mag[i] - prevMag[i]);
  return s / n;
}

export function detectOnset(fluxHistory, { k = 1.6 } = {}) {
  if (fluxHistory.length < 4) return { onset: false, strength: 0 };
  const cur = fluxHistory[fluxHistory.length - 1];
  const prev = fluxHistory.slice(0, -1);
  const mean = prev.reduce((a, b) => a + b, 0) / prev.length;
  const onset = cur > mean * k && cur > 1e-4;
  return { onset, strength: mean > 0 ? cur / mean : 0 };
}

export function attackReleaseShape(levelDb, hopSeconds, noiseFloor = -70) {
  const voiced = levelDb.map((v, i) => (v > noiseFloor ? i : -1)).filter((i) => i >= 0);
  if (voiced.length < 3) {
    return { attackSeconds: null, releaseSeconds: null, durationSeconds: null };
  }
  const start = voiced[0];
  const end = voiced[voiced.length - 1];
  const peak = levelDb.reduce((best, v, i) => (v > best.v ? { v, i } : best), { v: -Infinity, i: 0 });
  return {
    attackSeconds: Math.max(0, (peak.i - start) * hopSeconds),
    releaseSeconds: Math.max(0, (end - peak.i) * hopSeconds),
    durationSeconds: (end - start) * hopSeconds,
  };
}
