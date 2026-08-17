/**
 * Graded tension / strain evidence (REQ-034–038). RESEARCH TARGET.
 * Never diagnosis, never binary tense/not-tense, never measured muscle force.
 */

export const TENSION_REGIONS = Object.freeze(['jaw', 'face', 'throat', 'neck', 'upper_torso', 'global']);
export const TENSION_MODEL_VERSION = 'tension-heuristic-0';
export const TENSION_CAPABILITY_STATUS = 'research_target';

export function orangeRedColor(amount) {
  const a = Math.max(0, Math.min(1, amount));
  const r = 255;
  const g = Math.round(160 - 90 * a);
  const b = Math.round(48 - 30 * a);
  const alpha = 0.12 + 0.7 * a;
  return { css: `rgba(${r},${g},${b},${alpha.toFixed(3)})`, amount: a, nonColorCue: densityCue(a) };
}

export function densityCue(amount) {
  if (amount < 0.2) return 'tension evidence: dim';
  if (amount < 0.5) return 'tension evidence: moderate';
  if (amount < 0.8) return 'tension evidence: strong';
  return 'tension evidence: dense';
}

export function estimateTension(features, { selfLabels = [] } = {}) {
  const periodicity = features.periodicity ?? 0;
  const db = features.relativeLevelDecibelsFullScale ?? -60;
  const tilt = features.spectralTilt;
  const pitchConf = features.pitchConfidence ?? 0;

  let global = 0;
  if (periodicity > 0 && periodicity < 0.35 && db > -28) global += 0.25;
  if (tilt != null && tilt > -0.15 && db > -25) global += 0.2;
  if (pitchConf > 0 && pitchConf < 0.35 && db > -30) global += 0.15;

  const labels = new Set(selfLabels);
    if (labels.has('pressed') || labels.has('strained')) global += 0.25;
    if (labels.has('jaw tight')) global += 0.15;
    if (labels.has('throat tight') || labels.has('neck engaged')) global += 0.15;
    if (labels.has('free') || labels.has('comfortable')) global *= 0.5;

    global = Math.max(0, Math.min(1, global));
    const regions = {
      jaw: labels.has('jaw tight') ? Math.min(1, global + 0.2) : global * 0.6,
      face: global * 0.4,
      throat: (labels.has('throat tight') || labels.has('neck engaged'))
        ? Math.min(1, global + 0.2)
        : global * 0.7,
      neck: labels.has('neck engaged') ? Math.min(1, global + 0.25) : global * 0.65,
      upper_torso: labels.has('shoulders lifted') ? Math.min(1, global + 0.15) : global * 0.3,
    global,
  };

  const confidence = global > 0 ? Math.min(0.55, 0.25 + global * 0.3) : 0.15;
  return {
    global,
    regions,
    confidence,
    evidenceClass: global > 0 ? 'inferred' : 'unknown',
    color: orangeRedColor(global),
    accessibilityCue: densityCue(global),
    wording: 'tension evidence',
    notDiagnosis: true,
    modelVersion: TENSION_MODEL_VERSION,
    capabilityStatus: TENSION_CAPABILITY_STATUS,
  };
}

export class TensionEstimator {
  infer(frame, extras = {}) {
    const state = estimateTension(frame.features, extras);
    frame.inferences.tensionEvidence = state;
    return state;
  }
}

export const SELF_TENSION_LABELS = Object.freeze([
  'jaw tight',
  'throat tight',
  'neck engaged',
  'shoulders lifted',
  'pressed',
  'free',
  'comfortable',
]);
