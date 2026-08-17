/**
 * Visual-state contracts (spec REQ-005A–E, REQ-087A–B).
 *
 * The visualization layer may transform evidence; it may never create evidence.
 * Missing, stale, or low-reliability evidence → unknown / neutral, not a guess.
 */

export const VISUAL_MAPPING_VERSION = 'v2-visual-map-1';

/** PROVISIONAL expiration ages in seconds. Must be tested, not assumed. */
export const PROVISIONAL_MAX_AGE_SECONDS = Object.freeze({
  pitchLayer: 0.12,
  levelTrace: 0.12,
  formantTrajectories: 0.25,
  jawTensionGlow: 0.4,
  skullRimUpperProduction: 0.4,
  chestRegionGlow: 0.4,
  mixedCoordinationField: 0.4,
  registrationTransition: 0.4,
  diaphragmMotion: 0.6,
  ribMotion: 0.6,
  airflowParticles: 0.6,
  breathLaneUser: 0.6,
  breathLaneReference: 0.6,
  auraCoherence: 0.3,
  auraEnergy: 0.3,
  supportEvidence: 0.5,
  actualPitchLayer: 0.12,
});

/**
 * Every dynamic visual must name its upstream fields and unknown behavior.
 * Prohibited shortcuts from the spec are listed so tests can lock them out.
 */
export const VISUAL_CONTRACTS = Object.freeze({
  actualPitchLayer: {
    visualName: 'actualPitchLayer',
    evidenceClass: 'derived',
    sourceFieldPaths: ['features.fundamentalFrequencyHertz'],
    unknownBehavior: 'hide_numeric_and_show_unknown',
    notes: 'Measured/derived pitch independent of resonance visualization.',
  },
  levelTrace: {
    visualName: 'levelTrace',
    evidenceClass: 'derived',
    sourceFieldPaths: ['features.relativeLevelDecibelsFullScale'],
    unknownBehavior: 'gap_in_trace',
    unitLabel: 'dBFS',
    notes: 'Uncalibrated relative digital level. Not sound-pressure level.',
  },
  formantTrajectories: {
    visualName: 'formantTrajectories',
    evidenceClass: 'derived',
    sourceFieldPaths: ['features.formantsHertz', 'features.formantConfidence'],
    unknownBehavior: 'omit_unreliable_formants',
  },
  skullRimUpperProduction: {
    visualName: 'skullRimUpperProduction',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.registration'],
    unknownBehavior: 'fade_to_neutral',
    notes: 'Visual metaphor for head-dominant production evidence, not skull-cavity measurement.',
  },
  chestRegionGlow: {
    visualName: 'chestRegionGlow',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.registration'],
    unknownBehavior: 'fade_to_neutral',
    notes: 'Inferred chest-dominant pattern mapping. Not proof the chest cavity is the resonator.',
  },
  mixedCoordinationField: {
    visualName: 'mixedCoordinationField',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.registration'],
    unknownBehavior: 'fade_to_neutral',
    notes: 'Mixed voice is a coordination pattern, not a third cavity.',
  },
  registrationTransition: {
    visualName: 'registrationTransition',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.registration'],
    unknownBehavior: 'fade_to_neutral',
    notes: 'Probabilistic transition-shape candidate. The label “forced” is not used without annotation.',
  },
  diaphragmMotion: {
    visualName: 'diaphragmMotion',
    evidenceClass: 'simulated',
    sourceFieldPaths: ['inferences.respiration'],
    unknownBehavior: 'neutral_rest_pose',
    notes: 'Simulated anatomy driven by inferred respiratory state. Not measured displacement.',
  },
  ribMotion: {
    visualName: 'ribMotion',
    evidenceClass: 'simulated',
    sourceFieldPaths: ['inferences.respiration'],
    unknownBehavior: 'neutral_rest_pose',
  },
  airflowParticles: {
    visualName: 'airflowParticles',
    evidenceClass: 'simulated',
    sourceFieldPaths: ['inferences.respiration'],
    unknownBehavior: 'stop_and_fade',
    notes: 'Direction follows accepted respiratory state. Not measured airflow velocity.',
  },
  breathLaneUser: {
    visualName: 'breathLaneUser',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.respiration'],
    unknownBehavior: 'lane_gap',
  },
  breathLaneReference: {
    visualName: 'breathLaneReference',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.respiration'],
    unknownBehavior: 'lane_gap',
  },
  jawTensionGlow: {
    visualName: 'jawTensionGlow',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.tensionEvidence'],
    unknownBehavior: 'fade_to_neutral',
    notes: 'Tension/strain evidence, not measured jaw-muscle force.',
    accessibilityCue: 'density_and_label',
  },
  throatTensionGlow: {
    visualName: 'throatTensionGlow',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.tensionEvidence'],
    unknownBehavior: 'fade_to_neutral',
    accessibilityCue: 'density_and_label',
  },
  torsoTensionGlow: {
    visualName: 'torsoTensionGlow',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.tensionEvidence'],
    unknownBehavior: 'fade_to_neutral',
    accessibilityCue: 'density_and_label',
  },
  auraCoherence: {
    visualName: 'auraCoherence',
    evidenceClass: 'derived',
    sourceFieldPaths: ['features.periodicity', 'features.pitchConfidence'],
    unknownBehavior: 'low_persistence_field',
    notes: 'Sustained continuity / technical alignment. Not a reward.',
  },
  auraEnergy: {
    visualName: 'auraEnergy',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.expressiveIntensity'],
    unknownBehavior: 'calm_field',
    notes: 'Expressive intensity is independent of aura coherence.',
  },
  supportEvidence: {
    visualName: 'supportEvidence',
    evidenceClass: 'inferred',
    sourceFieldPaths: ['inferences.supportEvidence'],
    unknownBehavior: 'hide',
    notes: 'Support-related coordination evidence. Not diaphragm truth.',
  },
  wholeSystemLegacyBadge: {
    visualName: 'wholeSystemLegacyBadge',
    evidenceClass: 'legacy_hypothesis',
    sourceFieldPaths: ['legacy.sysAmp', 'legacy.activeCount'],
    unknownBehavior: 'show_as_legacy_only',
    notes: 'Arithmetic prototype badge. MUST NOT trigger a v2 physiology claim.',
    isolated: true,
  },
});

/** Shortcuts that MUST NOT be implemented as evidence rules. */
export const PROHIBITED_VISUAL_SHORTCUTS = Object.freeze([
  'low_pitch_automatically_lights_chest',
  'high_pitch_automatically_lights_skull',
  'louder_means_greater_expressive_intensity',
  'distortion_means_stronger_emotion',
  'orange_red_jaw_glow_is_measured_muscle_tension',
  'probable_inhale_is_measured_diaphragm_displacement',
  'mixed_voice_means_whole_body_physically_resonating',
  'missing_evidence_continues_last_physiological_visual',
]);

export function listVisualContracts() {
  return Object.values(VISUAL_CONTRACTS);
}

export function getVisualContract(visualName) {
  return VISUAL_CONTRACTS[visualName] || null;
}
