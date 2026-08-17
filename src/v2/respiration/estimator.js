/**
 * Respiratory-event estimator (REQ-027–030). RESEARCH TARGET.
 *
 * Microphone audio does not measure airflow direction or diaphragm motion.
 * Frame-level guesses are smoothed; unknown is a first-class state.
 */

import { voiceActivity } from '../anatomy/breathKinematics.js';

export const RESPIRATION_CLASSES = Object.freeze([
  'inhale',
  'phonated_exhale',
  'unphonated_exhale',
  'pause',
  'unknown',
]);

export const RESPIRATION_MODEL_VERSION = 'respiration-heuristic-1';
export const RESPIRATION_CAPABILITY_STATUS = 'research_target';

const CLASS_INDEX = Object.fromEntries(RESPIRATION_CLASSES.map((c, i) => [c, i]));

/**
 * PROVISIONAL frame classifier. Not a validated detector.
 * Uses vocal-source cues vs pitched-instrument cues vs quiet breath noise.
 */
export function classifyRespirationFrame(features, extras = {}) {
  const rms = features.rmsAmplitude ?? 0;
  const periodicity = features.periodicity ?? 0;
  const centroid = features.spectralCentroidHertz;
  const db = features.relativeLevelDecibelsFullScale ?? -120;
  const dRms = Number(extras.dRms) || 0;
  const v = voiceActivity(features);

  if (v.pitchedInstrument || v.percussion) {
    return { class: 'pause', confidence: 0.4, scores: scoresToward('pause', 0.4) };
  }
  if (db < -62 && rms < 0.0014) {
    return { class: 'pause', confidence: 0.42, scores: scoresToward('pause', 0.42) };
  }
  if (v.sung || (periodicity >= 0.38 && db > -48 && rms > 0.007 && !v.pitchedInstrument)) {
    return {
      class: 'phonated_exhale',
      confidence: Math.min(0.78, 0.38 + periodicity * 0.42),
      scores: scoresToward('phonated_exhale', 0.7),
    };
  }
  const breathNoise = v.breathNoise || (periodicity < 0.28 && rms > 0.0018 && rms < 0.09);
  if (breathNoise && (dRms > 0.0007 || (rms > 0.003 && dRms >= 0))) {
    return { class: 'inhale', confidence: 0.42, scores: scoresToward('inhale', 0.42) };
  }
  if (breathNoise && dRms < -0.0005) {
    return { class: 'unphonated_exhale', confidence: 0.38, scores: scoresToward('unphonated_exhale', 0.38) };
  }
  const noisy = periodicity < 0.25 && rms > 0.008;
  const bright = centroid != null && centroid > 1400;
  if (noisy && bright) {
    return { class: 'inhale', confidence: 0.36, scores: scoresToward('inhale', 0.36) };
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
    this.smoother = new TemporalSmoother({ window: 5, minHold: 3 });
    this.openEvent = null;
    this.events = [];
    this.modelVersion = RESPIRATION_MODEL_VERSION;
    this.prevRms = 0;
  }

  infer(frame) {
    const rms = Number(frame.features?.rmsAmplitude) || 0;
    const dRms = rms - this.prevRms;
    this.prevRms = rms;
    const raw = classifyRespirationFrame(frame.features, { dRms });
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
