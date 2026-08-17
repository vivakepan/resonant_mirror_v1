/**
 * Map analysis frames to provenance-tagged visual states.
 * Combination rules are explicit and testable (REQ-087B).
 */

import { resolveVisualState, createUnknownVisualState } from './mirrorState.js';
import { simulatedAirflow } from '../respiration/estimator.js';
import { snapshotPoseForClass } from '../anatomy/breathKinematics.js';
import { defaultFeatureFlags } from '../contracts/featureFlags.js';
import { registerGlowFromInference } from '../registration/estimator.js';

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

  const formantOk = (f.formantConfidence || []).some((c) => c > 0.2);
  const formantClass = frame.provenanceByField?.['features.formantsHertz']?.evidenceClass;
  visuals.push(resolveVisualState({
    visualName: 'formantTrajectories',
    timestampSeconds,
    value: formantOk ? f.formantsHertz : null,
    evidenceClass: formantOk
      ? (formantClass === 'inferred' ? 'inferred' : 'derived')
      : 'unknown',
    observedAtSeconds: timestampSeconds,
    reliabilityOk: formantOk,
  }));

  const reg = inf.registration || { class: 'unknown', confidence: 0, probabilities: {} };
  visuals.push(registrationVisual('chestRegionGlow', reg, 'chest_dominant', timestampSeconds, flags.registration));
  visuals.push(registrationVisual('skullRimUpperProduction', reg, 'head_dominant', timestampSeconds, flags.registration));
  visuals.push(registrationVisual('mixedCoordinationField', reg, 'mixed', timestampSeconds, flags.registration));
  if (flags.registration?.enabled && reg.class === 'transition' && reg.transition) {
    visuals.push(resolveVisualState({
      visualName: 'registrationTransition',
      timestampSeconds,
      value: reg.transition,
      evidenceClass: 'inferred',
      confidence: reg.confidence ?? 0.4,
      observedAtSeconds: timestampSeconds,
      modelVersion: reg.modelVersion ?? null,
    }));
  } else {
    visuals.push(createUnknownVisualState('registrationTransition', timestampSeconds));
  }

  const resp = inf.respiration || { class: 'unknown', confidence: 0 };
  const knownBreath = flags.respiration?.enabled && resp.class && resp.class !== 'unknown';
  const showLane = knownBreath && flags.respiration?.experimentalLanes;
  visuals.push(resolveVisualState({
    visualName: frame.source === 'reference' ? 'breathLaneReference' : 'breathLaneUser',
    timestampSeconds,
    value: showLane ? resp.class : null,
    evidenceClass: showLane ? 'inferred' : 'unknown',
    confidence: resp.confidence ?? 0,
    observedAtSeconds: timestampSeconds,
    modelVersion: resp.modelVersion ?? null,
    reliabilityOk: showLane,
  }));

  const simulate = knownBreath && flags.respiration?.simulatedAnatomy;
  const air = simulatedAirflow(simulate ? resp : { class: 'unknown' });
  const snap = simulate ? snapshotPoseForClass(resp.class) : snapshotPoseForClass('unknown');
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
    value: air.direction == null ? null : snap.diaphragmDescent,
    evidenceClass: air.direction == null ? 'unknown' : 'simulated',
    observedAtSeconds: timestampSeconds,
    reliabilityOk: air.direction != null,
  }));
  visuals.push(resolveVisualState({
    visualName: 'ribMotion',
    timestampSeconds,
    value: air.direction == null ? null : snap.ribExpansion,
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
    value: tensionOk ? Math.max(tension.regions.throat ?? 0, tension.regions.neck ?? 0) : null,
    evidenceClass: tensionOk ? 'inferred' : 'unknown',
    confidence: tension.confidence ?? 0,
    observedAtSeconds: timestampSeconds,
    reliabilityOk: tensionOk,
  }));
  visuals.push(resolveVisualState({
    visualName: 'torsoTensionGlow',
    timestampSeconds,
    value: tensionOk ? tension.regions.upper_torso ?? tension.global * 0.3 : null,
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

  const support = inf.supportEvidence;
  const supportOk = flags.supportEvidence?.enabled && support?.value != null;
  visuals.push(resolveVisualState({
    visualName: 'supportEvidence',
    timestampSeconds,
    value: supportOk ? support.value : null,
    evidenceClass: supportOk ? (support.evidenceClass || 'inferred') : 'unknown',
    observedAtSeconds: timestampSeconds,
    reliabilityOk: supportOk,
  }));

  return visuals;
}

function registrationVisual(name, reg, matchClass, timestampSeconds, flag) {
  const glows = registerGlowFromInference(reg);
  const key = matchClass === 'chest_dominant' ? 'chest'
    : matchClass === 'head_dominant' ? 'head'
      : matchClass === 'mixed' ? 'mixed'
        : null;
  const p = key ? glows[key] : 0;
  const enabled = flag?.enabled && p > 0.18;
  if (!enabled) return createUnknownVisualState(name, timestampSeconds);
  return resolveVisualState({
    visualName: name,
    timestampSeconds,
    value: p,
    evidenceClass: 'inferred',
    confidence: Math.min(reg.confidence ?? p, p),
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
