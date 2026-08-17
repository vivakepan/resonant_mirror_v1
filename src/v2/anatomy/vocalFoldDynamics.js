/**
 * Deterministic slow-motion body-cover approximation.
 *
 * This is not a clinical vocal-fold simulation. It preserves useful
 * relationships—pitch-linked cycle rate, inferior/superior phase delay,
 * contact timing, medial compression, and bounded irregularity—without
 * pretending microphone audio is laryngoscopy, EGG, pressure, or airflow.
 */

const TAU = Math.PI * 2;

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

export function visualFrequencyFromPitch(frequencyHertz) {
  if (!(frequencyHertz > 0)) return 2.4;
  // Watchable slow motion that stays linearly tied to measured F0 (~48× slower).
  return Math.max(1.6, Math.min(14, frequencyHertz / 48));
}

export function contactQuotientCandidate({
  opening = 0.15,
  drive = 0.5,
  medialCompression = 0.5,
  tension = 0.5,
  breathiness = 0,
  samples = 96,
} = {}) {
  const amplitude = oscillationAmplitude({ drive, medialCompression, tension, breathiness });
  const delay = verticalPhaseDelay({ drive, tension });
  let contacted = 0;
  for (let i = 0; i < samples; i++) {
    const phase = (i / samples) * TAU;
    const inferior = opening + amplitude * Math.sin(phase);
    const superior = opening + amplitude * 0.86 * Math.sin(phase - delay);
    if (Math.min(inferior, superior) <= 0) contacted += 1;
  }
  return contacted / samples;
}

export function createFoldDynamics(state, timeMs = 0) {
  const actualFrequencyHertz = state.frequencyHertz > 0 ? state.frequencyHertz : null;
  const visualFrequencyHertz = visualFrequencyFromPitch(actualFrequencyHertz);
  const tension = clamp(state.coordinationTension ?? state.modeledTension ?? 0.5);
  const compression = clamp(state.medialCompression ?? 0.5);
  const drive = clamp(state.drive ?? (state.vibration?.includes('not') ? 0.05 : 0.5));
  const breathiness = clamp(state.breathiness ?? 0);
  const irregularity = clamp(state.irregularity ?? (state.periodicity == null ? 0 : 1 - state.periodicity));
  const opening = clamp(state.glottisOpen ?? 0.2);
  const amplitude = oscillationAmplitude({
    drive,
    medialCompression: compression,
    tension,
    breathiness,
  });
  const delay = verticalPhaseDelay({ drive, tension });

  const timeSeconds = timeMs / 1000;
  const basePhase = timeSeconds * TAU * visualFrequencyHertz;
  const frequencyWander = irregularity * (
    Math.sin(timeSeconds * 5.7) * 0.18
    + Math.sin(timeSeconds * 11.3 + 0.7) * 0.08
  );
  const leftPhase = basePhase + frequencyWander;
  const rightPhase = basePhase - frequencyWander * 0.72;

  const inferiorRaw = opening + amplitude * Math.sin((leftPhase + rightPhase) / 2);
  const superiorRaw = opening + amplitude * 0.86 * Math.sin((leftPhase + rightPhase) / 2 - delay);
  const contactAmount = clamp(-Math.min(inferiorRaw, superiorRaw) / Math.max(0.02, amplitude));
  const contactQuotient = contactQuotientCandidate({
    opening,
    drive,
    medialCompression: compression,
    tension,
    breathiness,
  });

  return {
    actualFrequencyHertz,
    visualFrequencyHertz,
    slowMotionRatio: actualFrequencyHertz ? actualFrequencyHertz / visualFrequencyHertz : null,
    tension,
    compression,
    drive,
    breathiness,
    irregularity,
    opening,
    amplitude,
    verticalPhaseDelayRadians: delay,
    verticalPhaseDelayDegrees: delay * 180 / Math.PI,
    leftPhase,
    rightPhase,
    inferiorGap: clamp(inferiorRaw),
    superiorGap: clamp(superiorRaw),
    contactAmount,
    contactQuotient,
    contactEvidenceClass: (
      state.techniqueEvidenceClass === 'simulated'
      || state.postureEvidenceClass === 'simulated'
    ) ? 'simulated' : 'inferred',
    label: 'slow-motion body-cover approximation',
  };
}

export function edgeDisplacement(dynamics, {
  t,
  side,
  layer = 'superior',
} = {}) {
  const x = clamp(t);
  const attachmentEnvelope = Math.sin(Math.PI * x);
  const phase = side < 0 ? dynamics.leftPhase : dynamics.rightPhase;
  const delayedPhase = layer === 'superior'
    ? phase - dynamics.verticalPhaseDelayRadians
    : phase;
  const layerScale = layer === 'superior' ? 0.86 : 1;
  const primary = Math.sin(delayedPhase) * dynamics.amplitude * layerScale;

  // A small second tissue mode gives bounded irregular deformation while
  // remaining zero at the anterior and posterior attachments.
  const secondMode = Math.sin(Math.PI * 2 * x)
    * dynamics.irregularity
    * dynamics.amplitude
    * 0.22
    * Math.sin(phase * 0.63 + side * 0.9);

  return attachmentEnvelope * (primary + secondMode);
}

function oscillationAmplitude({
  drive,
  medialCompression,
  tension,
  breathiness,
}) {
  const powered = clamp(drive) * (0.18 + clamp(medialCompression) * 0.48);
  const tensionDamping = 1 - clamp(tension) * 0.32;
  const breathyDamping = 1 - clamp(breathiness) * 0.45;
  return clamp(powered * tensionDamping * breathyDamping, 0, 0.46);
}

function verticalPhaseDelay({ drive, tension }) {
  return 0.42 + clamp(drive) * 0.3 + (1 - clamp(tension)) * 0.12;
}
