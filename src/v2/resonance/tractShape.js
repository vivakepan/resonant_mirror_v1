/**
 * Pedagogical vocal-tract shape from F1/F2/F3.
 *
 * Distinguishes three teaching tokens:
 *   hee  /i/   close-front, velum up, lips spread
 *   him  /ɪ̃/  close-front, velum down (nasal coupling)
 *   haah /a/   open, jaw dropped, tongue low
 *
 * This is a filter (tract) configuration. It is not register.
 */

import { classifyVowel } from './vowelMap.js';

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Nasal coupling cue. Not a measured nasalance score.
 * Close-front vowels with a lowered centroid or a compressed F2–F3
 * gap are treated as likely velum-down ("him"), vs oral /i/ ("hee").
 */
export function nasalanceFromAcoustics({
  formantsHertz = [],
  spectralCentroidHertz = 0,
  vowelSymbol = null,
} = {}) {
  const f1 = Number(formantsHertz[0]) || 0;
  const f2 = Number(formantsHertz[1]) || 0;
  const f3 = Number(formantsHertz[2]) || 0;
  const centroid = Number(spectralCentroidHertz) || 0;
  const closeFront = vowelSymbol === 'i' || vowelSymbol === 'ɪ'
    || (f1 > 220 && f1 < 520 && f2 > 1680);
  let cue = 0;
  if (closeFront) {
    if (vowelSymbol === 'ɪ' || (f1 > 340 && f1 < 520 && f2 > 1680 && f2 < 2100)) cue += 0.28;
    if (centroid > 400 && centroid < 1900) cue += 0.5;
    if (f3 > 0 && f3 < 2450) cue += 0.16;
    if (f3 > 0 && f2 > 0 && f3 - f2 < 650) cue += 0.14;
  } else if (f1 > 220 && f1 < 560 && centroid > 350 && centroid < 1650 && f3 > 0 && f3 < 2400) {
    // Compact mouth + pulled F3: jaw-in / tucked-head nasal candidate, not /i/ proof.
    cue += 0.22;
    if (f2 > 0 && f3 - f2 < 700) cue += 0.18;
  }
  return clamp(cue);
}

/**
 * Jaw-in + head-tuck often couples the velum down for a more directly
 * nasal path. This is a tract-posture candidate, not a measured mandible
 * or cervical angle.
 */
export function nasalPostureFromAcoustics({
  formantsHertz = [],
  spectralCentroidHertz = 0,
  velumOpen = 0,
  open = 0,
} = {}) {
  const nasal = clamp(velumOpen);
  const compact = clamp(1 - open);
  const tucked = nasal > 0.32 && compact > 0.58;
  const jawRetract = tucked
    ? clamp(0.28 + nasal * 0.5 + compact * 0.18)
    : clamp(nasal * 0.14);
  const headTuck = tucked
    ? clamp(0.22 + nasal * 0.48 + compact * 0.12)
    : clamp(nasal * 0.08);
  return {
    jawRetract,
    headTuck,
    directNasal: tucked,
  };
}

export function tractConfigurationFromFormants(formantsHertz = [], {
  nasalShare = 0,
  spectralCentroidHertz = 0,
} = {}) {
  const vowel = classifyVowel(formantsHertz);
  const f1 = vowel.f1 || 0;
  const f2 = vowel.f2 || 0;
  const height = f1 > 180 ? clamp(1 - (f1 - 260) / 620) : 0.42;
  const front = f2 > 400 ? clamp((f2 - 720) / 1550) : 0.4;
  const open = f1 > 180 ? clamp((f1 - 280) / 520) : 0.18;
  const nasalCue = Math.max(
    clamp(Number(nasalShare) || 0),
    nasalanceFromAcoustics({
      formantsHertz,
      spectralCentroidHertz,
      vowelSymbol: vowel.symbol,
    }),
  );
  const lipSpread = clamp(front * 0.9 + height * 0.22 - open * 0.4);
  const jawDrop = clamp(0.08 + open * 0.92);
  const mouthOpen = clamp(0.08 + open * 0.92);
  const velumOpen = clamp(nasalCue);
  const pharynxWide = clamp(0.2 + open * 0.58 + (1 - front) * 0.18);
  const palatalConstriction = clamp(height * front);
  const posture = nasalPostureFromAcoustics({
    formantsHertz,
    spectralCentroidHertz,
    velumOpen,
    open,
  });

  let token = 'unknown';
  let tokenLabel = 'unknown tract shape';
  if (velumOpen > 0.38 && height > 0.52 && front > 0.52) {
    token = 'him';
    tokenLabel = posture.directNasal
      ? '/ɪ̃/ · him · jaw-in / head-tuck nasal'
      : '/ɪ̃/ · him · velum down';
  } else if (height > 0.68 && front > 0.72 && velumOpen < 0.35) {
    token = 'hee';
    tokenLabel = '/i/ · hee · close-front oral';
  } else if (open > 0.52) {
    token = 'haah';
    tokenLabel = '/a/ · haah · open oral';
  } else if (posture.directNasal) {
    token = vowel.symbol || 'nasal';
    tokenLabel = 'jaw-in / head-tuck · direct nasal candidate';
  } else if (vowel.symbol) {
    token = vowel.symbol;
    tokenLabel = `/${vowel.symbol}/`;
  }

  return {
    vowel,
    token,
    tokenLabel,
    height,
    front,
    open,
    lipSpread,
    jawDrop,
    mouthOpen,
    velumOpen,
    pharynxWide,
    palatalConstriction,
    jawRetract: posture.jawRetract,
    headTuck: posture.headTuck,
    directNasal: posture.directNasal,
    evidenceClass: vowel.evidenceClass,
  };
}
