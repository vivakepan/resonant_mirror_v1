/**
 * Registration / resonance-pattern estimator (REQ-021–025).
 * RESEARCH TARGET. Outputs are probabilistic candidates and may be unknown.
 * There is no universal “correct register.”
 */

export const REGISTRATION_CLASSES = Object.freeze([
  'chest_dominant',
  'head_dominant',
  'mixed',
  'transition',
  'unknown',
]);

export const REGISTRATION_MODEL_VERSION = 'registration-heuristic-1';
export const REGISTRATION_CAPABILITY_STATUS = 'research_target';

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function glowKey(className) {
  if (className === 'chest_dominant') return 'chest';
  if (className === 'head_dominant') return 'head';
  if (className === 'mixed') return 'mixed';
  return null;
}

/**
 * Anatomy glow for one winning register. Leftover probability on the
 * other classes must not light chest, mixed, and head at the same time.
 * Transition may light the from/to pair only.
 */
export function registerGlowFromInference(reg = {}) {
  const out = { chest: 0, mixed: 0, head: 0 };
  const cls = reg.class;
  if (!cls || cls === 'unknown') return out;
  const p = reg.probabilities || {};
  const amountFor = (name) => {
    const raw = Number(p[name]);
    const conf = clamp01(reg.confidence);
    if (Number.isFinite(raw) && raw > 0) return clamp01(Math.max(raw, cls === name ? conf : 0));
    return cls === name ? conf : 0;
  };
  if (cls === 'transition' && reg.transition) {
    for (const name of [reg.transition.from, reg.transition.to]) {
      const key = glowKey(name);
      if (key) out[key] = Math.max(out[key], Math.max(0.36, amountFor(name)));
    }
    return out;
  }
  const key = glowKey(cls);
  if (!key) return out;
  out[key] = Math.max(0.22, amountFor(cls));
  return out;
}

export function classifyRegistration(features, prev = null) {
  const f0 = features.fundamentalFrequencyHertz;
  const conf = features.pitchConfidence ?? 0;
  const centroid = features.spectralCentroidHertz;
  const tilt = features.spectralTilt;

  if (!(f0 > 0) || conf < 0.35) {
    return {
      class: 'unknown',
      confidence: 0,
      probabilities: { chest_dominant: 0.2, mixed: 0.2, head_dominant: 0.2, transition: 0.1, unknown: 0.3 },
    };
  }

  // PROVISIONAL, singer-relative starting heuristics — not body measurements.
  // Keep loser mass low so a single-register phrase does not look like all three.
  let chest = 0.03;
  let head = 0.03;
  let mixed = 0.03;
  if (f0 < 200) chest += 0.62;
  else if (f0 > 390) head += 0.62;
  else if (f0 < 250) { chest += 0.28; mixed += 0.34; }
  else if (f0 > 330) { head += 0.28; mixed += 0.34; }
  else mixed += 0.55;

  if (centroid != null && centroid < 1200) { chest += 0.12; head *= 0.45; }
  if (centroid != null && centroid > 2200) { head += 0.12; chest *= 0.45; }
  if (tilt != null && tilt < -1.2) chest += 0.05;
  if (tilt != null && tilt > -0.4) head += 0.05;

  const sum = chest + head + mixed + 0.08;
  const probabilities = {
    chest_dominant: chest / sum,
    head_dominant: head / sum,
    mixed: mixed / sum,
    transition: 0.08 / sum,
    unknown: 0.04,
  };

  let cls = 'mixed';
  let best = probabilities.mixed;
  for (const k of ['chest_dominant', 'head_dominant', 'mixed']) {
    if (probabilities[k] > best) { best = probabilities[k]; cls = k; }
  }
  if (best < 0.4) {
    cls = 'unknown';
    best = probabilities.unknown;
  }

  let transition = null;
  if (prev && prev.class !== 'unknown' && cls !== 'unknown' && prev.class !== cls) {
    cls = 'transition';
    transition = {
      from: prev.class,
      to: Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0],
      abrupt: Math.abs((features.fundamentalFrequencyHertz || 0) - (prev.f0 || 0)) > 80,
      shape: Math.abs((features.fundamentalFrequencyHertz || 0) - (prev.f0 || 0)) > 80
        ? 'abrupt_candidate'
        : 'smooth_candidate',
    };
    best = 0.4;
  }

  return {
    class: cls,
    confidence: Math.min(0.7, best),
    probabilities,
    transition,
    notes: 'Probabilistic registration/resonance-pattern candidate. Not a correct-register judgment and not cavity proof.',
  };
}

export class RegistrationEstimator {
  constructor() {
    this.prev = null;
    this.modelVersion = REGISTRATION_MODEL_VERSION;
  }

  infer(frame) {
    const result = classifyRegistration(frame.features, this.prev);
    const state = {
      ...result,
      evidenceClass: result.class === 'unknown' ? 'unknown' : 'inferred',
      modelVersion: this.modelVersion,
      capabilityStatus: REGISTRATION_CAPABILITY_STATUS,
      f0: frame.features.fundamentalFrequencyHertz,
    };
    this.prev = state;
    frame.inferences.registration = state;
    return state;
  }
}
