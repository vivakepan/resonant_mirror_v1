/**
 * Map analysis frames to provenance-tagged visual states.
 * Combination rules are explicit and testable (REQ-087B).
 */

import { resolveVisualState, createUnknownVisualState } from './mirrorState.js';
import { simulatedAirflow } from '../respiration/estimator.js';
import { defaultFeatureFlags } from '../contracts/featureFlags.js';

export function composeVisualStates(frame, {
  flags = defaultFeatureFlags(),
  timestampSeconds = frame.timestampSeconds,
} = {}) {
  const visuals = [];
  const f = frame.features;
  const inf = frame.inferences;

  visuals.push(resolveVisualState({
    visualName: 'actualPitchLayer',
    timestampSeconds,
    value: f.fundamentalFrequencyHertz,
    evidenceClass: f.fundamentalFrequencyHertz == null ? 'unknown' : 'derived',
    confidence: f.pitchConfidence ?? 0,
    observedAtSeconds: timestampSeconds,
    qualityFlags: frame.qualityFlags.filter((q) => q === 'low_pitch_confidence'),
  }));

  visuals.push(resolveVisualState({
    visualName: 'levelTrace',
    timestampSeconds,
    value: f.relativeLevelDecibelsFullScale,
    evidenceClass: 'derived',
    observedAtSeconds: timestampSeconds,
  }));

  const formantOk = (f.formantConfidence || []).some((c) => c > 0.25);
  visuals.push(resolveVisualState({
    visualName: 'formantTrajectories',
    timestampSeconds,
    value: formantOk ? f.formantsHertz : null,
    evidenceClass: formantOk ? 'derived' : 'unknown',
    observedAtSeconds: timestampSeconds,
    reliabilityOk: formantOk,
  }));

  const reg = inf.registration || { class: 'unknown', confidence: 0 };
  visuals.push(registrationVisual('chestRegionGlow', reg, 'chest_dominant', timestampSeconds, flags.registration));
  visuals.push(registrationVisual('skullRimUpperProduction', reg, 'head_dominant', timestampSeconds, flags.registration));
  visuals.push(registrationVisual('mixedCoordinationField', reg, 'mixed', timestampSeconds, flags.registration));

  const resp = inf.respiration || { class: 'unknown', confidence: 0 };
  const assertiveBreath = flags.respiration?.assertiveVisuals === true;
  const breathValue = resp.class === 'unknown' || !assertiveBreath && resp.confidence < 0.5
    ? (assertiveBreath ? resp.class : null)
    : resp.class;
  // Until held-out validation, assertive breath visuals stay off.
  const showBreath = assertiveBreath && resp.class !== 'unknown';
  visuals.push(resolveVisualState({
    visualName: frame.source === 'reference' ? 'breathLaneReference' : 'breathLaneUser',
    timestampSeconds,
    value: showBreath ? resp.class : null,
    evidenceClass: showBreath ? 'inferred' : 'unknown',
    confidence: resp.confidence ?? 0,
    observedAtSeconds: timestampSeconds,
    modelVersion: resp.modelVersion ?? null,
    reliabilityOk: showBreath,
  }));

  const air = simulatedAirflow(showBreath ? resp : { class: 'unknown' });
  visuals.push(resolveVisualState({
    visualName: 'airflowParticles',
    timestampSeconds,
    value: air.direction,
    evidenceClass: air.evidenceClass === 'simulated' ? 'simulated' : 'unknown',
    observedAtSeconds: timestampSeconds,
    reliabilityOk: air.direction != null,
  }));
  visuals.push(resolveVisualState({
    visualName: 'diaphragmMotion',
    timestampSeconds,
    value: air.direction == null ? null : (air.direction < 0 ? 0.35 : 0.15),
    evidenceClass: air.direction == null ? 'unknown' : 'simulated',
    observedAtSeconds: timestampSeconds,
    reliabilityOk: air.direction != null,
  }));
  visuals.push(resolveVisualState({
    visualName: 'ribMotion',
    timestampSeconds,
    value: air.direction == null ? null : (air.direction < 0 ? 0.3 : 0.12),
    evidenceClass: air.direction == null ? 'unknown' : 'simulated',
    observedAtSeconds: timestampSeconds,
    reliabilityOk: air.direction != null,
  }));

  const tension = inf.tensionEvidence || { global: null, regions: {}, confidence: 0 };
  const tensionOk = flags.tensionEvidence?.enabled && tension.global != null;
  visuals.push(resolveVisualState({
    visualName: 'jawTensionGlow',
    timestampSeconds,
    value: tensionOk ? tension.regions.jaw ?? tension.global : null,
    evidenceClass: tensionOk ? 'inferred' : 'unknown',
    confidence: tension.confidence ?? 0,
    observedAtSeconds: timestampSeconds,
    modelVersion: tension.modelVersion ?? null,
    reliabilityOk: tensionOk,
  }));
  visuals.push(resolveVisualState({
    visualName: 'throatTensionGlow',
    timestampSeconds,
    value: tensionOk ? tension.regions.throat ?? tension.global : null,
    evidenceClass: tensionOk ? 'inferred' : 'unknown',
    confidence: tension.confidence ?? 0,
    observedAtSeconds: timestampSeconds,
    reliabilityOk: tensionOk,
  }));

  const periodicity = f.periodicity ?? 0;
  visuals.push(resolveVisualState({
    visualName: 'auraCoherence',
    timestampSeconds,
    value: periodicity,
    evidenceClass: 'derived',
    confidence: f.pitchConfidence ?? 0,
    observedAtSeconds: timestampSeconds,
  }));
  const intensity = inf.expressiveIntensity?.value;
  const intensityOk = flags.expressiveIntensity?.userFacing && intensity != null;
  visuals.push(resolveVisualState({
    visualName: 'auraEnergy',
    timestampSeconds,
    value: intensityOk ? intensity : 0,
    evidenceClass: intensityOk ? 'inferred' : 'unknown',
    observedAtSeconds: timestampSeconds,
    reliabilityOk: intensityOk,
  }));

  return visuals;
}

function registrationVisual(name, reg, matchClass, timestampSeconds, flag) {
  const enabled = flag?.enabled && reg.class === matchClass;
  if (!enabled) return createUnknownVisualState(name, timestampSeconds);
  return resolveVisualState({
    visualName: name,
    timestampSeconds,
    value: reg.confidence,
    evidenceClass: 'inferred',
    confidence: reg.confidence,
    observedAtSeconds: timestampSeconds,
    modelVersion: reg.modelVersion ?? null,
  });
}

/**
 * Aura coherence (alignment/stability) and energy (expressive intensity)
 * remain independent (REQ-044–047).
 */
export function auraSemantics(visuals) {
  const coherence = visuals.find((v) => v.visualName === 'auraCoherence');
  const energy = visuals.find((v) => v.visualName === 'auraEnergy');
  return {
    coherence: coherence?.value ?? 0,
    energy: energy?.value ?? 0,
    independent: true,
    judgment: null,
  };
}
