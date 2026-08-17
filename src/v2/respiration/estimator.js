/**
 * Respiratory-event estimator (REQ-027–030). RESEARCH TARGET.
 *
 * Microphone audio does not measure airflow direction or diaphragm motion.
 * Frame-level guesses are smoothed; unknown is a first-class state.
 */

export const RESPIRATION_CLASSES = Object.freeze([
  'inhale',
  'phonated_exhale',
  'unphonated_exhale',
  'pause',
  'unknown',
]);

export const RESPIRATION_MODEL_VERSION = 'respiration-heuristic-0';
export const RESPIRATION_CAPABILITY_STATUS = 'research_target';

const CLASS_INDEX = Object.fromEntries(RESPIRATION_CLASSES.map((c, i) => [c, i]));

/**
 * PROVISIONAL frame classifier. Not a validated detector.
 * Uses voiced energy vs noisy residual vs silence.
 */
export function classifyRespirationFrame(features) {
  const rms = features.rmsAmplitude ?? 0;
  const periodicity = features.periodicity ?? 0;
  const centroid = features.spectralCentroidHertz;
  const db = features.relativeLevelDecibelsFullScale ?? -120;

  if (db < -55 || rms < 0.004) {
    return { class: 'pause', confidence: 0.45, scores: scoresToward('pause', 0.45) };
  }
  if (periodicity >= 0.45 && db > -40) {
    return { class: 'phonated_exhale', confidence: Math.min(0.75, 0.4 + periodicity * 0.4), scores: scoresToward('phonated_exhale', 0.7) };
  }
  const noisy = periodicity < 0.25 && rms > 0.01;
  const bright = centroid != null && centroid > 1800;
  if (noisy && bright) {
    return { class: 'inhale', confidence: 0.35, scores: scoresToward('inhale', 0.35) };
  }
  if (noisy) {
    return { class: 'unphonated_exhale', confidence: 0.3, scores: scoresToward('unphonated_exhale', 0.3) };
  }
  return { class: 'unknown', confidence: 0.2, scores: scoresToward('unknown', 0.2) };
}

function scoresToward(name, conf) {
  const scores = Object.fromEntries(RESPIRATION_CLASSES.map((c) => [c, 0.05]));
  scores[name] = conf;
  return scores;
}

/**
 * Majority / hysteresis smoother to prevent frame flicker (REQ-029C).
 */
export class TemporalSmoother {
  constructor({ window = 7, minHold = 4 } = {}) {
    this.window = window;
    this.minHold = minHold;
    this.history = [];
    this.current = 'unknown';
    this.held = 0;
  }

  push(frameClass) {
    this.history.push(frameClass);
    if (this.history.length > this.window) this.history.shift();
    const counts = {};
    for (const c of this.history) counts[c] = (counts[c] || 0) + 1;
    let best = 'unknown';
    let n = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (v > n) { n = v; best = k; }
    }
    if (best === this.current) {
      this.held += 1;
      return this.current;
    }
    if (this.held < this.minHold && this.current !== 'unknown') {
      this.held += 1;
      return this.current;
    }
    this.current = best;
    this.held = 1;
    return this.current;
  }
}

export class RespirationEstimator {
  constructor({ source = 'user' } = {}) {
    this.source = source;
    this.smoother = new TemporalSmoother();
    this.openEvent = null;
    this.events = [];
    this.modelVersion = RESPIRATION_MODEL_VERSION;
  }

  infer(frame) {
    const raw = classifyRespirationFrame(frame.features);
    const smoothed = this.smoother.push(raw.class);
    const state = {
      class: smoothed,
      confidence: smoothed === raw.class ? raw.confidence : Math.min(raw.confidence, 0.4),
      evidenceClass: 'inferred',
      modelVersion: this.modelVersion,
      source: this.source,
      capabilityStatus: RESPIRATION_CAPABILITY_STATUS,
      qualityFlags: [...(frame.qualityFlags || [])],
      rawClass: raw.class,
    };
    this._updateEvent(frame.timestampSeconds, state);
    frame.inferences.respiration = state;
    return state;
  }

  _updateEvent(t, state) {
    if (!this.openEvent || this.openEvent.class !== state.class) {
      if (this.openEvent) {
        this.openEvent.endSeconds = t;
        this.events.push(this.openEvent);
      }
      this.openEvent = {
        eventClass: state.class,
        class: state.class,
        estimatedStart: t,
        startSeconds: t,
        endSeconds: null,
        confidence: state.confidence,
        evidenceClass: 'inferred',
        modelVersion: this.modelVersion,
        sourceStream: this.source,
        qualityFlags: state.qualityFlags,
      };
    } else {
      this.openEvent.confidence = Math.max(this.openEvent.confidence, state.confidence);
      this.openEvent.endSeconds = t;
    }
  }

  close(t) {
    if (this.openEvent) {
      this.openEvent.endSeconds = t;
      this.events.push(this.openEvent);
      this.openEvent = null;
    }
    return this.events;
  }
}

/** Simulated airflow direction from accepted respiratory state. */
export function simulatedAirflow(respirationState) {
  if (!respirationState || respirationState.class === 'unknown') {
    return { direction: null, evidenceClass: 'unknown', label: 'unknown airflow' };
  }
  const inbound = respirationState.class === 'inhale';
  const outbound = respirationState.class === 'phonated_exhale'
    || respirationState.class === 'unphonated_exhale';
  if (!inbound && !outbound) {
    return { direction: 0, evidenceClass: 'simulated', label: 'simulated pause / no net flow' };
  }
  return {
    direction: inbound ? -1 : 1,
    evidenceClass: 'simulated',
    label: 'simulated airflow direction, not measured velocity',
  };
}
