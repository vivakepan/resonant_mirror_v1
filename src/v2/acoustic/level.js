/**
 * Relative digital level (REQ-015, REQ-016).
 *
 * Uncalibrated consumer microphones MUST be stored as dBFS, never as
 * physical sound-pressure level.
 */

export const LEVEL_UNIT = 'dBFS';
export const LEVEL_FLOOR_DBFS = -120;

export function rmsAmplitude(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function dbFullScale(rmsValue) {
  if (!(rmsValue > 0)) return LEVEL_FLOOR_DBFS;
  return Math.max(LEVEL_FLOOR_DBFS, 20 * Math.log10(rmsValue));
}

export function relativeLevel(samples) {
  const rms = rmsAmplitude(samples);
  return {
    rmsAmplitude: rms,
    relativeLevelDecibelsFullScale: dbFullScale(rms),
    unit: LEVEL_UNIT,
    isSoundPressureLevel: false,
    unitLabel: 'decibels relative to full scale',
  };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : 0.5 * (s[mid - 1] + s[mid]);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return s / values.length;
}

/**
 * Phrase-level dense trajectory descriptors. Two phrases with the same
 * average level MAY have different contours.
 */
export function levelTrajectory(dbSeries, hopSeconds = 0.02) {
  const xs = dbSeries.filter((v) => Number.isFinite(v) && v > LEVEL_FLOOR_DBFS + 1);
  if (!xs.length) {
    return {
      mean: null, median: null, min: null, max: null, dynamicRange: null,
      variance: null, rateOfIncrease: null, rateOfDecrease: null,
      attackSteepness: null, timeNearPeak: null, buildDuration: null,
      releaseDuration: null, localFluctuations: null,
      unit: LEVEL_UNIT,
    };
  }
  const mx = Math.max(...xs);
  const mn = Math.min(...xs);
  const peakIdx = dbSeries.indexOf(Math.max(...dbSeries.filter(Number.isFinite)));
  const nearPeak = dbSeries.filter((v) => Number.isFinite(v) && v >= mx - 3).length * hopSeconds;
  const diffs = [];
  for (let i = 1; i < dbSeries.length; i++) {
    if (Number.isFinite(dbSeries[i]) && Number.isFinite(dbSeries[i - 1])) {
      diffs.push((dbSeries[i] - dbSeries[i - 1]) / hopSeconds);
    }
  }
  const rises = diffs.filter((d) => d > 0);
  const falls = diffs.filter((d) => d < 0);
  const firstVoiced = dbSeries.findIndex((v) => Number.isFinite(v) && v > mn + 6);
  const lastVoiced = (() => {
    for (let i = dbSeries.length - 1; i >= 0; i--) {
      if (Number.isFinite(dbSeries[i]) && dbSeries[i] > mn + 6) return i;
    }
    return dbSeries.length - 1;
  })();
  const build = peakIdx >= 0 && firstVoiced >= 0 ? (peakIdx - firstVoiced) * hopSeconds : null;
  const release = peakIdx >= 0 ? (lastVoiced - peakIdx) * hopSeconds : null;
  return {
    mean: mean(xs),
    median: median(xs),
    min: mn,
    max: mx,
    dynamicRange: mx - mn,
    variance: variance(xs),
    rateOfIncrease: rises.length ? mean(rises) : 0,
    rateOfDecrease: falls.length ? mean(falls) : 0,
    attackSteepness: rises.length ? Math.max(...rises) : 0,
    timeNearPeak: nearPeak,
    buildDuration: build != null ? Math.max(0, build) : null,
    releaseDuration: release != null ? Math.max(0, release) : null,
    localFluctuations: diffs.length ? Math.sqrt(variance(diffs)) : 0,
    unit: LEVEL_UNIT,
  };
}
