/**
 * v2 feature flags and research gates (spec REQ-098).
 *
 * A learned or heuristic feature MUST NOT appear as an ordinary trusted
 * user-facing result merely because code exists.
 */

import { RESEARCH_GATES } from './evidence.js';

function gate(status, extras = {}) {
  if (!RESEARCH_GATES.includes(status)) {
    throw new Error(`Invalid research gate: ${status}`);
  }
  return {
    enabled: status !== 'disabled',
    userFacing: status === 'validated-for-limited-use',
    experimentalLabel: status === 'experimental' || status === 'validation-pending',
    status,
    ...extras,
  };
}

/**
 * Defaults for a fresh v2 build. Thresholds that are not validated are
 * marked provisional. Learned outputs start disabled or experimental.
 */
export function defaultFeatureFlags() {
  return {
    version: 'v2-phase0',
    dualInput: { enabled: true, status: 'validated-for-limited-use' },
    denseAcoustics: { enabled: true, status: 'validated-for-limited-use' },
    piano: { enabled: true, status: 'validated-for-limited-use' },
    metronome: { enabled: true, status: 'validated-for-limited-use' },
    resonanceFormants: gate('experimental', {
      capabilityStatus: 'implemented_unvalidated',
      notes: 'Formants may return unknown at high fundamentals.',
    }),
    anatomyV2: gate('experimental', {
      capabilityStatus: 'implemented_unvalidated',
      motionEvidenceClass: 'simulated',
    }),
    respiration: gate('experimental', {
      capabilityStatus: 'research_target',
      assertiveVisuals: false,
      notes: 'Held-out inhale/exhale validation is required before assertive breath visuals.',
    }),
    registration: gate('experimental', {
      capabilityStatus: 'research_target',
      notes: 'Chest / mixed / head are probabilistic candidates and may be unknown.',
    }),
    tensionEvidence: gate('experimental', {
      capabilityStatus: 'research_target',
      notes: 'Graded tension/strain evidence, not diagnosis.',
    }),
    vocalEncoder: gate('disabled', {
      capabilityStatus: 'research_target',
    }),
    expressiveIntensity: gate('disabled', {
      capabilityStatus: 'research_target',
      notes: 'Must outperform or differ from loudness-only ranking before exposure.',
    }),
    personalMemory: gate('experimental', {
      capabilityStatus: 'implemented_unvalidated',
    }),
    supportEvidence: gate('disabled', {
      capabilityStatus: 'research_target',
    }),
    phraseTemporalModel: gate('disabled', {
      capabilityStatus: 'research_target',
    }),
    personalWeightTraining: gate('disabled', {
      capabilityStatus: 'research_target',
      liveSessionWeightUpdates: false,
    }),
    sourceSeparation: gate('disabled', {
      capabilityStatus: 'research_target',
    }),
    cameraTension: gate('disabled', {
      capabilityStatus: 'research_target',
      optIn: true,
    }),
    calibratedSoundPressureLevel: gate('disabled', {
      capabilityStatus: 'research_target',
      notes: 'Uncalibrated microphones expose dBFS only.',
    }),
    wholeSystemCoordination: gate('disabled', {
      capabilityStatus: 'research_target',
      notes: 'Legacy WHOLE-SYSTEM RESONANCE badge is isolated and must not drive this flag.',
    }),
    legacyPhysicsLayer: {
      enabled: true,
      status: 'experimental',
      evidenceClass: 'legacy_hypothesis',
      isolated: true,
    },
    legacyInterferenceField: {
      enabled: true,
      status: 'experimental',
      evidenceClass: 'simulated',
      isolated: true,
    },
    visualProvenanceInspector: { enabled: true, developmentBuilds: true },
  };
}

export function isUserFacing(flags, key) {
  const entry = flags[key];
  if (!entry) return false;
  return entry.userFacing === true || entry.status === 'validated-for-limited-use';
}

export function assertNoLiveWeightUpdates(flags) {
  if (flags.personalWeightTraining?.liveSessionWeightUpdates) {
    throw new Error('Neural-network weights must not change during a live singing session.');
  }
}
