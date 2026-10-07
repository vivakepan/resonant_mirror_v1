/**
 * Registration / resonance-pattern estimator (REQ-021–025).
 * RESEARCH TARGET. Outputs are probabilistic candidates and may be unknown.
 * There is no universal “correct register.”
 *
 * Absolute pitch bands MUST NOT alone light chest or skull (prohibited
 * visual shortcuts). Classification is timbre-led; F0 is used only for
 * voicing gates, singer-relative context, and transition abruptness.
 */

export const REGISTRATION_CLASSES = Object.freeze([
  'chest_dominant',
  'head_dominant',
  'mixed',
  'transition',
  'unknown',
]);

export const REGISTRATION_MODEL_VERSION = 'registration-heuristic-2';
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

function unknownResult(extra = {}) {
  return {
    class: 'unknown',
    confidence: 0,
    probabilities: {
      chest_dominant: 0.2,
      mixed: 0.2,
      head_dominant: 0.2,
      transition: 0.1,
      unknown: 0.3,
    },
    notes: 'Probabilistic registration/resonance-pattern candidate. Not a correct-register judgment and not cavity proof.',
    ...extra,
  };
}

/**
 * Timbre-led registration. Absolute F0 thresholds are not used to assign
 * chest vs head mass — that would implement the prohibited pitch→region
 * shortcut. Singer-relative F0 (vs a running median) may nudge slightly
 * when timbre evidence already exists.
 */
export function classifyRegistration(features, prev = null) {
  const f0 = features.fundamentalFrequencyHertz;
  const conf = features.pitchConfidence ?? 0;
  const centroid = features.spectralCentroidHertz;
  const tilt = features.spectralTilt;
  const harm = features.harmonicity;
  const periodicity = features.periodicity;

  if (!(f0 > 0) || conf < 0.35) {
    return unknownResult();
  }

  const hasCentroid = Number.isFinite(centroid) && centroid > 0;
  const hasTilt = Number.isFinite(tilt);
  if (!hasCentroid && !hasTilt) {
    return unknownResult({
      notes: 'Registration withheld: pitch alone must not light chest or skull. Need spectral evidence.',
    });
  }

  let chest = 0.08;
  let head = 0.08;
  let mixed = 0.18;

  if (hasCentroid) {
    // Harmonic brightness relative to F0 — not absolute pitch height.
    const ratio = centroid / f0;
    if (ratio < 4.2) {
      chest += 0.48;
      head *= 0.35;
    } else if (ratio < 6.2) {
      chest += 0.22;
      mixed += 0.28;
    } else if (ratio < 9.5) {
      mixed += 0.42;
    } else if (ratio < 13) {
      head += 0.22;
      mixed += 0.28;
    } else {
      head += 0.48;
      chest *= 0.35;
    }
  }

  if (hasTilt) {
    if (tilt < -1.35) {
      chest += 0.18;
      head *= 0.55;
    } else if (tilt < -0.85) {
      chest += 0.08;
      mixed += 0.1;
    } else if (tilt > -0.25) {
      head += 0.18;
      chest *= 0.55;
    } else if (tilt > -0.55) {
      head += 0.08;
      mixed += 0.1;
    }
  }

  if (Number.isFinite(harm)) {
    if (harm > 0.72) mixed += 0.06;
    if (harm < 0.35) {
      // Breathier / less harmonic — do not invent a register from noise.
      chest *= 0.7;
      head *= 0.7;
      mixed *= 0.7;
    }
  }

  if (Number.isFinite(periodicity) && periodicity < 0.35) {
    return unknownResult({
      notes: 'Registration withheld: low periodicity is not a register class.',
    });
  }

  // Weak singer-relative prior: only when we already have timbre evidence
  // and a recent median F0 from this singer. Never the sole lighting rule.
  const medianF0 = Number(prev?.medianF0);
  if (Number.isFinite(medianF0) && medianF0 > 80 && (hasCentroid || hasTilt)) {
    const relative = Math.log2(f0 / medianF0);
    if (relative < -0.55) chest += 0.08;
    else if (relative > 0.55) head += 0.08;
    else mixed += 0.04;
  }

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
    if (probabilities[k] > best) {
      best = probabilities[k];
      cls = k;
    }
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
    notes: 'Probabilistic registration/resonance-pattern candidate from spectral shape, not pitch height alone. Not a correct-register judgment and not cavity proof.',
  };
}

function nextMedianF0(prevMedian, f0) {
  if (!(f0 > 80)) return prevMedian ?? null;
  if (!(prevMedian > 80)) return f0;
  // One-pole toward recent pitch — singer-relative context, not a band gate.
  return prevMedian * 0.92 + f0 * 0.08;
}

export class RegistrationEstimator {
  constructor() {
    this.prev = null;
    this.modelVersion = REGISTRATION_MODEL_VERSION;
  }

  infer(frame) {
    const result = classifyRegistration(frame.features, this.prev);
    const medianF0 = nextMedianF0(this.prev?.medianF0, frame.features.fundamentalFrequencyHertz);
    const state = {
      ...result,
      evidenceClass: result.class === 'unknown' ? 'unknown' : 'inferred',
      modelVersion: this.modelVersion,
      capabilityStatus: REGISTRATION_CAPABILITY_STATUS,
      f0: frame.features.fundamentalFrequencyHertz,
      medianF0,
    };
    this.prev = state;
    frame.inferences.registration = state;
    return state;
  }
}
