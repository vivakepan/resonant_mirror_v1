/**
 * Vocal-fold close-up driven by available evidence.
 *
 * Audio can support vibration-pattern candidates, but it cannot directly
 * observe glottal posture or tissue tension. Posture is therefore an
 * inferred/simulated candidate and unavailable quantities remain unknown.
 */

import { createFoldDynamics, edgeDisplacement } from './vocalFoldDynamics.js';

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

export const VOCAL_TECHNIQUE_PROFILES = Object.freeze({
  clean: {
    label: 'Clean phonation',
    openingRange: [0.08, 0.18],
    tensionRange: [0.42, 0.58],
    medialCompression: 0.5,
    edgeThickness: 0.52,
    falseFoldActivity: 0.05,
    supraglotticNarrowing: 0.18,
    vibration: 'consistent candidate',
    periodicity: 0.95,
    note: 'Balanced periodic phonation model.',
  },
  chest_dominant: {
    label: 'Chest-dominant coordination',
    openingRange: [0.04, 0.13],
    tensionRange: [0.42, 0.62],
    medialCompression: 0.72,
    edgeThickness: 0.76,
    falseFoldActivity: 0.05,
    supraglotticNarrowing: 0.24,
    vibration: 'stable periodic model',
    periodicity: 0.94,
    note: 'Thicker participating edge and longer modeled contact; the folds still open and close every cycle.',
  },
  breathy: {
    label: 'Breathy phonation',
    openingRange: [0.25, 0.45],
    tensionRange: [0.28, 0.48],
    medialCompression: 0.2,
    edgeThickness: 0.38,
    falseFoldActivity: 0.03,
    supraglotticNarrowing: 0.1,
    vibration: 'variable candidate',
    note: 'Modeled incomplete closure and continued airflow.',
  },
  fry: {
    label: 'Vocal fry',
    openingRange: [0.03, 0.12],
    tensionRange: [0.12, 0.3],
    medialCompression: 0.68,
    edgeThickness: 0.82,
    falseFoldActivity: 0.08,
    supraglotticNarrowing: 0.22,
    vibration: 'irregular / pulse candidate',
    note: 'Low longitudinal-tension, pulse-like model.',
  },
  grit: {
    label: 'Grit / rasp',
    openingRange: [0.08, 0.25],
    tensionRange: [0.38, 0.68],
    medialCompression: 0.58,
    edgeThickness: 0.6,
    falseFoldActivity: 0.45,
    supraglotticNarrowing: 0.48,
    vibration: 'irregular / noisy candidate',
    note: 'Illustrative irregularity; grit can arise from different mechanisms.',
  },
  false_fold_distortion: {
    label: 'False-fold distortion',
    openingRange: [0.14, 0.32],
    tensionRange: [0.34, 0.62],
    medialCompression: 0.44,
    edgeThickness: 0.62,
    falseFoldActivity: 0.92,
    supraglotticNarrowing: 0.7,
    vibration: 'irregular supraglottic model',
    note: 'Models ventricular-fold participation, not a diagnosis.',
  },
  growl: {
    label: 'Growl',
    openingRange: [0.12, 0.3],
    tensionRange: [0.28, 0.55],
    medialCompression: 0.42,
    edgeThickness: 0.72,
    falseFoldActivity: 0.8,
    supraglotticNarrowing: 0.62,
    vibration: 'subharmonic / irregular model',
    note: 'Growl mechanisms vary; this is one illustrative supraglottic model.',
  },
  scream: {
    label: 'Scream / extreme distortion',
    openingRange: [0.08, 0.28],
    tensionRange: [0.45, 0.8],
    medialCompression: 0.62,
    edgeThickness: 0.48,
    falseFoldActivity: 0.68,
    supraglotticNarrowing: 0.78,
    vibration: 'complex irregular model',
    note: 'A broad family of techniques, not one anatomical configuration.',
  },
  pressed: {
    label: 'Pressed phonation',
    openingRange: [0.01, 0.08],
    tensionRange: [0.72, 0.94],
    medialCompression: 0.92,
    edgeThickness: 0.68,
    falseFoldActivity: 0.18,
    supraglotticNarrowing: 0.5,
    vibration: 'constricted periodic model',
    note: 'High modeled compression; not measured strain.',
  },
  whisper: {
    label: 'Whisper',
    openingRange: [0.34, 0.58],
    tensionRange: [0.28, 0.5],
    medialCompression: 0.05,
    edgeThickness: 0.42,
    falseFoldActivity: 0.05,
    supraglotticNarrowing: 0.18,
    vibration: 'unphonated airflow model',
    note: 'Open posterior airway with no periodic fold vibration.',
  },
  falsetto: {
    label: 'Falsetto / light head production',
    openingRange: [0.16, 0.32],
    tensionRange: [0.62, 0.82],
    medialCompression: 0.22,
    edgeThickness: 0.18,
    falseFoldActivity: 0.03,
    supraglotticNarrowing: 0.2,
    vibration: 'thin-edge periodic model',
    note: 'Illustrative thin-edge, reduced-contact model.',
  },
  belt: {
    label: 'Belt',
    openingRange: [0.05, 0.16],
    tensionRange: [0.58, 0.78],
    medialCompression: 0.76,
    edgeThickness: 0.72,
    falseFoldActivity: 0.12,
    supraglotticNarrowing: 0.48,
    vibration: 'firm periodic model',
    note: 'Modeled firm closure and thicker participation; not harmful by definition.',
  },
  twang: {
    label: 'Twang',
    openingRange: [0.07, 0.18],
    tensionRange: [0.45, 0.66],
    medialCompression: 0.58,
    edgeThickness: 0.46,
    falseFoldActivity: 0.04,
    supraglotticNarrowing: 0.88,
    vibration: 'focused periodic model',
    note: 'Strong epilaryngeal narrowing model.',
  },
  whistle: {
    label: 'Whistle register',
    openingRange: [0.01, 0.07],
    tensionRange: [0.78, 0.96],
    medialCompression: 0.42,
    edgeThickness: 0.1,
    falseFoldActivity: 0.02,
    supraglotticNarrowing: 0.72,
    vibration: 'small-aperture high-frequency model',
    note: 'Whistle mechanisms vary and cannot be confirmed from this view.',
  },
  mixed: {
    label: 'Mixed coordination',
    openingRange: [0.07, 0.2],
    tensionRange: [0.5, 0.72],
    medialCompression: 0.58,
    edgeThickness: 0.4,
    falseFoldActivity: 0.05,
    supraglotticNarrowing: 0.38,
    vibration: 'balanced periodic model',
    periodicity: 0.93,
    note: 'Coordination model, not a separate cavity or single fold posture.',
  },
  head_dominant: {
    label: 'Head-dominant coordination',
    openingRange: [0.08, 0.2],
    tensionRange: [0.62, 0.82],
    medialCompression: 0.42,
    edgeThickness: 0.24,
    falseFoldActivity: 0.03,
    supraglotticNarrowing: 0.24,
    vibration: 'thin-edge stable periodic model',
    periodicity: 0.94,
    note: 'Thinner participating edge and shorter modeled contact; complete closure can still occur.',
  },
});

export const VOCAL_TECHNIQUE_EVIDENCE = Object.freeze({
  clean: evidence('moderate', 'Periodic phonation is supported; the exact opening and tension percentages are illustrative.', 'Titze; EGG and high-speed imaging literature'),
  chest_dominant: evidence('moderate', 'M1 commonly has greater participating mass and lower open quotient than M2. “Chest” is not a universal posture.', 'Henrich et al. 2005; Roubeau et al. 2009'),
  mixed: evidence('limited', 'Mixed voice has no single agreed laryngeal configuration; this profile is a coordination interpolation.', 'register-transition literature'),
  head_dominant: evidence('moderate', 'M2 often has lower participating mass and higher open quotient, but “head voice” can refer to different mechanisms by singer and tradition.', 'Henrich et al. 2005; Roubeau et al. 2009'),
  breathy: evidence('strong relationship', 'Breathy phonation commonly shows reduced adduction and incomplete closure; longitudinal tension is not recoverable from audio.', 'glottal-flow and EGG literature'),
  fry: evidence('moderate', 'M0/fry is associated with low-rate pulse-like vibration and irregular timing; exact aperture varies.', 'laryngeal-mechanism literature'),
  grit: evidence('limited', 'Grit is an auditory label covering multiple periodic, aperiodic, glottal, and supraglottic mechanisms.', 'high-speed distortion imaging studies'),
  false_fold_distortion: evidence('moderate', 'Ventricular-fold participation is documented for some distortion types; the numeric posture remains illustrative.', 'laryngoscopic distortion studies'),
  growl: evidence('moderate', 'Growl often includes supraglottic vibration or constriction, but aryepiglottic and ventricular variants both occur.', 'Sakakibara; Caffier; Guzman studies'),
  scream: evidence('limited', 'Scream is a broad technique family rather than one reproducible vocal-fold setting.', 'high-speed distortion imaging studies'),
  pressed: evidence('moderate', 'Pressed phonation is associated with stronger adduction and longer contact; “tension” is not one measurable scalar.', 'EGG and glottal-flow literature'),
  whisper: evidence('strong relationship', 'Whisper lacks periodic true-fold vibration and usually retains a posterior glottal opening.', 'laryngoscopy and airflow literature'),
  falsetto: evidence('moderate', 'M2/falsetto usually uses less participating mass and reduced contact than M1; complete closure may still occur.', 'Henrich et al. 2005'),
  belt: evidence('moderate', 'Many belt productions use M1-like firm adduction and vocal-tract narrowing, with substantial singer-to-singer variation.', 'CCM belt imaging and EGG literature'),
  twang: evidence('moderate', 'Epilaryngeal narrowing is well supported; the displayed true-fold tension is not directly established by twang alone.', 'Sundberg and vocal-tract imaging literature'),
  whistle: evidence('limited', 'M3/whistle is recognized, but multiple vibratory and aerodynamic mechanisms have been reported.', 'laryngeal-mechanism literature'),
});

function evidence(strength, summary, sources) {
  return Object.freeze({
    strength,
    summary,
    sources,
    numericCalibration: 'none',
  });
}

export function techniqueProfileState(id, timeMs = 0) {
  const profile = VOCAL_TECHNIQUE_PROFILES[id];
  if (!profile) return null;
  const evidenceBasis = VOCAL_TECHNIQUE_EVIDENCE[id];
  const pulse = (Math.sin(timeMs * 0.0042) + 1) / 2;
  const opening = profile.openingRange[0]
    + (profile.openingRange[1] - profile.openingRange[0]) * pulse;
  const tension = profile.tensionRange[0]
    + (profile.tensionRange[1] - profile.tensionRange[0]) * (1 - pulse * 0.35);
  const profileSignals = techniqueSignals(id, profile);
  return {
    posture: `${Math.round(opening * 100)}% open · simulated`,
    postureDetail: `${Math.round(profile.openingRange[0] * 100)}–${Math.round(profile.openingRange[1] * 100)}% illustrative range`,
    postureEvidenceClass: 'simulated',
    vibration: profile.vibration,
    vibrationDetail: profile.note,
    vibrationEvidenceClass: 'simulated',
    periodicity: profile.periodicity
      ?? (profile.vibration.includes('periodic') ? 0.82 : profile.vibration.includes('irregular') ? 0.28 : 0.5),
    glottisOpen: opening,
    openingPercent: Math.round(opening * 100),
    modeledTension: tension,
    tensionPercent: Math.round(tension * 100),
    tensionDetail: `${Math.round(profile.tensionRange[0] * 100)}–${Math.round(profile.tensionRange[1] * 100)}% illustrative range`,
    medialCompression: profile.medialCompression,
    edgeThickness: profile.edgeThickness,
    falseFoldActivity: profile.falseFoldActivity,
    supraglotticNarrowing: profile.supraglotticNarrowing,
    technique: profile.label,
    techniqueId: id,
    techniqueDetail: profile.note,
    techniqueEvidenceClass: 'simulated',
    evidenceStrength: evidenceBasis?.strength ?? 'limited',
    evidenceSummary: evidenceBasis?.summary ?? 'Illustrative model; exact parameters are not calibrated.',
    evidenceSources: evidenceBasis?.sources ?? 'voice-science literature',
    numericCalibration: evidenceBasis?.numericCalibration ?? 'none',
    airflow: {
      flowRate: 0.42 + opening * 0.48,
      direction: 1,
      phonated: !profile.vibration.includes('unphonated') && !profile.vibration.includes('not '),
    },
    ...profileSignals,
  };
}

export function estimateVocalFoldState(frame, pose = {}) {
  const respiration = frame?.inferences?.respiration;
  const registration = registrationCoordination(frame?.inferences?.registration);
  const features = frame?.features || {};
  const periodicity = features.periodicity;
  const pitchConfidence = features.pitchConfidence;
  const f0 = Number(features.fundamentalFrequencyHertz) || 0;
  const voiced = f0 > 60 && ((pitchConfidence ?? 0) > 0.18 || (periodicity ?? 0) > 0.32);
  const technique = inferTechniqueCandidate(features, voiced, frame?.inferences?.registration);
  const active = voiced || DISTORTION_TECHNIQUES.has(technique.id);
  const levelDb = features.relativeLevelDecibelsFullScale;
  const drive = active
    ? (Number.isFinite(levelDb)
      ? clamp((levelDb + 55) / 45)
      : clamp(0.25 + (periodicity ?? 0) * 0.45 + (features.rmsAmplitude || 0) * 2.2))
    : clamp(pose.flowRate ?? 0);
  const irregularity = Number.isFinite(periodicity) ? clamp(1 - periodicity) : 0;
  const tensionEvidence = frame?.inferences?.tensionEvidence;
  const acousticTension = Number.isFinite(tensionEvidence?.regions?.throat)
    ? tensionEvidence.regions.throat
    : (Number.isFinite(tensionEvidence?.global) ? tensionEvidence.global : null);

  const glottisOpen = clamp(registration?.opening ?? pose.glottisOpen ?? 0.45);
  const openingPercent = Math.round(glottisOpen * 100);
  const posture = `${openingPercent}% open candidate`;
  let postureDetail = 'not observable from audio';
  let postureEvidenceClass = 'unknown';
  if (respiration?.class === 'inhale') {
    postureDetail = 'inferred inhale → simulated abduction';
    postureEvidenceClass = 'simulated';
  } else if (respiration?.class === 'unphonated_exhale') {
    postureDetail = 'inferred unphonated exhale';
    postureEvidenceClass = 'simulated';
  } else if (respiration?.class === 'phonated_exhale' && voiced) {
    postureDetail = 'phonation detected; closure is not directly measured';
    postureEvidenceClass = 'inferred';
  }
  if (registration && voiced) {
    postureDetail = `${registration.label} → simulated contact and thickness; closure is not directly measured`;
    postureEvidenceClass = 'simulated';
  }

  let vibration = 'unknown';
  let vibrationDetail = 'no reliable voiced evidence';
  let vibrationEvidenceClass = 'unknown';
  if (voiced && Number.isFinite(periodicity)) {
    vibrationEvidenceClass = 'derived';
    if (periodicity >= 0.72 && pitchConfidence >= 0.65) {
      vibration = 'consistent candidate';
      vibrationDetail = 'high periodicity and stable pitch evidence';
    } else if (periodicity >= 0.38) {
      vibration = 'variable candidate';
      vibrationDetail = 'moderate periodicity';
    } else {
      vibration = 'irregular / noisy candidate';
      vibrationDetail = 'low periodicity; cause is unknown';
    }
  } else if (respiration?.class === 'inhale' || respiration?.class === 'unphonated_exhale') {
    vibration = 'not detected';
    vibrationDetail = 'unphonated respiratory candidate';
    vibrationEvidenceClass = 'inferred';
  }

  const state = {
    posture,
    postureDetail,
    postureEvidenceClass,
    vibration,
    vibrationDetail,
    vibrationEvidenceClass,
    periodicity: Number.isFinite(periodicity) ? clamp(periodicity) : null,
    glottisOpen,
    openingPercent,
    modeledTension: null,
    tensionPercent: null,
    tensionDetail: 'not measurable from microphone audio',
    medialCompression: registration?.medialCompression ?? (voiced ? 0.5 : 0.2),
    edgeThickness: registration?.edgeThickness ?? 0.5,
    coordinationTension: registration?.tension ?? null,
    falseFoldActivity: 0.05,
    supraglotticNarrowing: 0.18,
    technique: technique.label,
    techniqueId: technique.id,
    techniqueDetail: registration
      ? `${technique.detail}; ${registration.note}`
      : technique.detail,
    techniqueEvidenceClass: technique.evidenceClass,
    evidenceStrength: 'acoustic candidate only',
    evidenceSummary: 'Audio can suggest periodicity, breathiness, and register class. It cannot measure glottal width, contact quotient, or tissue tension.',
    evidenceSources: 'source-filter acoustics; no endoscopic or EGG sensor',
    numericCalibration: 'none',
    frequencyHertz: f0 > 60 ? f0 : null,
    drive,
    breathiness: 0.12,
    irregularity,
    registrationLabel: registration?.label ?? 'unknown',
    airflow: {
      flowRate: Number.isFinite(pose.flowRate) ? pose.flowRate : (active ? Math.max(drive, 0.35) : 0),
      direction: pose.flowDirection ?? (active ? 1 : 0),
      phonated: voiced || technique.id === 'scream' || technique.id === 'grit',
    },
  };
  return applyInferredTechnique(state, technique, drive, { acousticTension });
}

export function registrationCoordination(registration) {
  if (!registration || registration.class === 'unknown') return null;
  const targets = {
    chest_dominant: {
      opening: 0.085,
      medialCompression: 0.72,
      edgeThickness: 0.76,
      tension: 0.52,
    },
    mixed: {
      opening: 0.12,
      medialCompression: 0.58,
      edgeThickness: 0.4,
      tension: 0.61,
    },
    head_dominant: {
      opening: 0.14,
      medialCompression: 0.42,
      edgeThickness: 0.24,
      tension: 0.72,
    },
  };
  const probabilities = registration.probabilities || {};
  let weights = {
    chest_dominant: Math.max(0, probabilities.chest_dominant ?? 0),
    mixed: Math.max(0, probabilities.mixed ?? 0),
    head_dominant: Math.max(0, probabilities.head_dominant ?? 0),
  };
  let total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total === 0 && targets[registration.class]) {
    weights = { chest_dominant: 0, mixed: 0, head_dominant: 0, [registration.class]: 1 };
    total = 1;
  }
  if (total === 0) return null;

  const blend = (field) => Object.entries(weights).reduce(
    (sum, [key, weight]) => sum + targets[key][field] * weight / total,
    0,
  );
  const labels = {
    chest_dominant: 'chest-dominant candidate',
    mixed: 'mixed-coordination candidate',
    head_dominant: 'head-dominant candidate',
    transition: `${registration.transition?.from?.replaceAll('_', ' ') ?? 'register'} → ${registration.transition?.to?.replaceAll('_', ' ') ?? 'register'} transition`,
  };
  return {
    label: labels[registration.class] ?? 'registration candidate',
    opening: blend('opening'),
    medialCompression: blend('medialCompression'),
    edgeThickness: blend('edgeThickness'),
    tension: blend('tension'),
    note: registration.class === 'transition'
      ? 'Modeled as a continuous coordination shift, not a closed-to-open valve.'
      : 'Register changes modeled thickness and contact duration (open quotient), not a static abduction valve.',
  };
}

export function idleVocalFoldState(pose = {}) {
  const glottisOpen = clamp(pose.glottisOpen ?? 0.45);
  const openingPercent = Math.round(glottisOpen * 100);
  return {
    posture: `${openingPercent}% open · demo`,
    postureDetail: 'simulated idle breathing cycle',
    postureEvidenceClass: 'simulated',
    vibration: 'not analyzed',
    vibrationDetail: 'enable microphone for acoustic evidence',
    vibrationEvidenceClass: 'unknown',
    periodicity: null,
    glottisOpen,
    openingPercent,
    modeledTension: null,
    tensionPercent: null,
    tensionDetail: 'not analyzed during idle breathing',
    medialCompression: 0.2,
    edgeThickness: 0.5,
    falseFoldActivity: 0.05,
    supraglotticNarrowing: 0.18,
    technique: 'idle breathing',
    techniqueId: 'unknown',
    techniqueDetail: 'no vocal technique analyzed',
    techniqueEvidenceClass: 'unknown',
    evidenceStrength: 'orientation only',
    evidenceSummary: 'Idle motion is a simulated anatomy demonstration.',
    evidenceSources: 'generic physiology model',
    numericCalibration: 'none',
    evidenceStrength: 'orientation only',
    evidenceSummary: 'Idle posture is simulated and is not a measurement of the user.',
    evidenceSources: 'generic anatomical orientation',
    numericCalibration: 'none',
    frequencyHertz: null,
    drive: clamp(pose.flowRate ?? 0),
    breathiness: 1,
    irregularity: 0,
    airflow: {
      flowRate: pose.flowRate ?? 0,
      direction: pose.flowDirection ?? 0,
      phonated: false,
    },
  };
}

function techniqueSignals(id, profile) {
  const frequencyHertz = {
    fry: 72,
    falsetto: 440,
    whistle: 920,
    belt: 260,
    twang: 240,
    scream: 360,
  }[id] ?? 180;
  const breathiness = {
    breathy: 0.82,
    whisper: 1,
    falsetto: 0.35,
  }[id] ?? 0.1;
  const irregularity = (
    profile.vibration.includes('irregular')
    || profile.vibration.includes('subharmonic')
    || profile.vibration.includes('complex')
    || id === 'fry'
  ) ? 0.72 : ['clean', 'chest_dominant', 'mixed', 'head_dominant'].includes(id) ? 0.03 : 0.08;
  const drive = {
    whisper: 0.08,
    fry: 0.34,
    breathy: 0.48,
    belt: 0.82,
    scream: 0.88,
    growl: 0.72,
  }[id] ?? 0.62;
  return { frequencyHertz, breathiness, irregularity, drive };
}

function inferTechniqueCandidate(features, voiced, registration = null) {
  const f0 = Number(features.fundamentalFrequencyHertz) || 0;
  const periodicity = features.periodicity ?? 0;
  const db = features.relativeLevelDecibelsFullScale ?? -120;
  const rms = features.rmsAmplitude ?? 0;
  const centroid = features.spectralCentroidHertz || 0;
  const formants = Array.isArray(features.formantsHertz) ? features.formantsHertz : [];
  const f1 = Number(formants[0]) || 0;
  const f2 = Number(formants[1]) || 0;
  const noisyLoud = rms > 0.05 && periodicity < 0.34 && db > -34;
  const bright = centroid > 1900;
  const screamLike = (noisyLoud && (rms > 0.08 || db > -26 || bright))
    || (
      rms > 0.07
      && (db > -28 || rms > 0.1)
      && periodicity < 0.55
      && bright
      && !(f1 > 180 && f1 < 450 && f2 > 1800 && periodicity > 0.62)
    );

  if (!voiced) {
    if (screamLike) {
      return {
        id: 'scream',
        label: 'scream / extreme-distortion candidate',
        detail: 'loud aperiodic energy; scream family, not a confirmed fold setting',
        evidenceClass: 'inferred',
      };
    }
    if (noisyLoud) {
      return {
        id: 'grit',
        label: 'irregular / grit candidate',
        detail: 'aperiodic energy detected; mechanism and safety are unknown',
        evidenceClass: 'inferred',
      };
    }
    return {
      id: 'unknown',
      label: 'unknown',
      detail: 'no reliable voiced evidence',
      evidenceClass: 'unknown',
    };
  }
  if (screamLike) {
    return {
      id: 'scream',
      label: 'scream / extreme-distortion candidate',
      detail: 'loud aperiodic energy; scream family, not a confirmed fold setting',
      evidenceClass: 'inferred',
    };
  }
  if (f0 < 105 && periodicity < 0.58 && rms < 0.08) {
    return {
      id: 'fry',
      label: 'fry-like candidate',
      detail: 'low-frequency pulse-like evidence; not confirmed',
      evidenceClass: 'inferred',
    };
  }
  if (periodicity < 0.38 && db > -38) {
    return {
      id: 'grit',
      label: 'irregular / grit candidate',
      detail: 'aperiodic energy detected; mechanism and safety are unknown',
      evidenceClass: 'inferred',
    };
  }
  if (f0 > 880 && periodicity > 0.45) {
    return {
      id: 'whistle',
      label: 'whistle-register candidate',
      detail: 'very high fundamental; mechanism is not confirmed',
      evidenceClass: 'inferred',
    };
  }
  if (f0 > 480 && periodicity > 0.55 && db < -18) {
    return {
      id: 'falsetto',
      label: 'falsetto / light-head candidate',
      detail: 'high pitch with lighter modeled contact; not M2 proof',
      evidenceClass: 'inferred',
    };
  }
  if (db > -22 && periodicity > 0.52 && f0 < 420 && f1 > 500) {
    return {
      id: 'belt',
      label: 'belt-like candidate',
      detail: 'loud mid-range with open-vowel energy; not a confirmed belt mechanism',
      evidenceClass: 'inferred',
    };
  }
  if (periodicity < 0.7) {
    return {
      id: 'breathy',
      label: 'breathy / variable candidate',
      detail: 'moderate periodicity; not a direct closure measurement',
      evidenceClass: 'inferred',
    };
  }
  if (registration?.class === 'head_dominant') {
    return {
      id: 'head_dominant',
      label: 'head-dominant candidate',
      detail: 'register estimate suggests thinner participating mass; not sinus gain',
      evidenceClass: 'inferred',
    };
  }
  if (registration?.class === 'chest_dominant') {
    return {
      id: 'chest_dominant',
      label: 'chest-dominant candidate',
      detail: 'register estimate suggests thicker participating mass; not a closed valve',
      evidenceClass: 'inferred',
    };
  }
  if (registration?.class === 'mixed') {
    return {
      id: 'mixed',
      label: 'mixed-coordination candidate',
      detail: 'register estimate is between chest- and head-dominant patterns',
      evidenceClass: 'inferred',
    };
  }
  return {
    id: 'clean',
    label: 'clean periodic candidate',
    detail: 'high periodicity; technique is not confirmed',
    evidenceClass: 'inferred',
  };
}

export { inferTechniqueCandidate };

const DISTORTION_TECHNIQUES = new Set([
  'scream', 'grit', 'growl', 'false_fold_distortion', 'pressed', 'fry', 'whisper', 'belt', 'twang', 'falsetto', 'whistle', 'breathy',
]);

function applyInferredTechnique(state, technique, drive, extras = {}) {
  const profile = VOCAL_TECHNIQUE_PROFILES[technique.id];
  const acousticTension = Number.isFinite(extras.acousticTension) ? extras.acousticTension : null;
  if (!profile) {
    if (acousticTension == null && state.coordinationTension == null) {
      return { ...state, techniqueId: technique.id };
    }
    const modeled = clamp(
      (state.coordinationTension ?? 0.48) * 0.6
      + (acousticTension ?? state.coordinationTension ?? 0.48) * 0.4,
    );
    return {
      ...state,
      techniqueId: technique.id,
      modeledTension: modeled,
      tensionPercent: Math.round(modeled * 100),
      tensionDetail: acousticTension != null
        ? 'register model blended with tension evidence · not tissue measurement'
        : 'register coordination model · not tissue measurement',
    };
  }
  const mix = clamp(drive);
  const profileOpen = profile.openingRange[0] + (profile.openingRange[1] - profile.openingRange[0]) * mix;
  const profileTension = profile.tensionRange[0] + (profile.tensionRange[1] - profile.tensionRange[0]) * mix;
  const next = {
    ...state,
    techniqueId: technique.id,
    falseFoldActivity: profile.falseFoldActivity,
    supraglotticNarrowing: profile.supraglotticNarrowing,
    medialCompression: clamp((state.medialCompression ?? 0.5) * 0.45 + profile.medialCompression * 0.55),
    edgeThickness: clamp((state.edgeThickness ?? 0.5) * 0.45 + profile.edgeThickness * 0.55),
    breathiness: techniqueSignals(technique.id, profile).breathiness,
  };
  if (DISTORTION_TECHNIQUES.has(technique.id)) {
    next.glottisOpen = profileOpen;
  } else {
    next.glottisOpen = clamp(state.glottisOpen * 0.65 + profileOpen * 0.35);
  }
  next.openingPercent = Math.round(next.glottisOpen * 100);
  next.posture = `${next.openingPercent}% open candidate`;
  const coord = Number.isFinite(state.coordinationTension) ? state.coordinationTension : profileTension;
  const acoustic = acousticTension ?? profileTension;
  next.modeledTension = clamp(profileTension * 0.5 + coord * 0.25 + acoustic * 0.25);
  next.tensionPercent = Math.round(next.modeledTension * 100);
  next.tensionDetail = acousticTension != null
    ? 'technique and tension evidence blended · not tissue measurement'
    : 'simulated from technique and register candidates · not tissue measurement';
  return next;
}

export function overlayTechniqueOnLive(live, techniqueId, timeMs = 0) {
  if (!techniqueId || techniqueId === 'live' || techniqueId === 'unknown') return live;
  const profile = techniqueProfileState(techniqueId, timeMs);
  const unphonated = (profile.vibration || '').includes('unphonated');
  const mixedTension = clamp(
    (profile.modeledTension ?? 0.5) * 0.65
    + (live.modeledTension ?? profile.modeledTension ?? 0.5) * 0.35,
  );
  return {
    ...profile,
    frequencyHertz: unphonated ? null : (live.frequencyHertz ?? profile.frequencyHertz),
    drive: unphonated ? Math.min(live.drive ?? 0.2, 0.08) : (live.drive ?? profile.drive),
    periodicity: unphonated ? 0 : (live.periodicity ?? profile.periodicity),
    irregularity: live.irregularity ?? profile.irregularity,
    vibration: unphonated ? profile.vibration : live.vibration,
    vibrationDetail: unphonated
      ? profile.vibrationDetail
      : live.vibrationDetail,
    vibrationEvidenceClass: unphonated ? 'simulated' : live.vibrationEvidenceClass,
    airflow: live.airflow || profile.airflow,
    modeledTension: mixedTension,
    tensionPercent: Math.round(mixedTension * 100),
    tensionDetail: 'selected technique model blended with live evidence · not tissue measurement',
    coordinationTension: live.coordinationTension ?? profile.coordinationTension,
    technique: `${profile.technique} · live pitch/air`,
    techniqueDetail: `${profile.techniqueDetail} Overlaying the selected model on live F0 and airflow.`,
    techniqueEvidenceClass: 'simulated',
  };
}

/** Honest HUD copy: audio cannot see folds; opening and tension stay modeled. */
export function foldHudSummary(state, dynamics = {}) {
  const meanOpen = Math.round(clamp(state.glottisOpen ?? 0) * 100);
  const cycleGap = Number.isFinite(dynamics.superiorGap)
    ? Math.round(clamp(dynamics.superiorGap) * 100)
    : null;
  const openingClass = state.postureEvidenceClass || 'simulated';
  const vibrationClass = state.vibrationEvidenceClass || 'unknown';
  const cycle = dynamics.actualFrequencyHertz
    ? `${Math.round(dynamics.actualFrequencyHertz)} Hz derived → ${Number(dynamics.visualFrequencyHertz).toFixed(1)} Hz slow motion`
    : `${Number(dynamics.visualFrequencyHertz || 0).toFixed(1)} Hz orientation demo`;
  const contactPct = Number.isFinite(dynamics.contactQuotient)
    ? Math.round(dynamics.contactQuotient * 100)
    : null;
  const phaseDeg = Number.isFinite(dynamics.verticalPhaseDelayDegrees)
    ? Math.round(dynamics.verticalPhaseDelayDegrees)
    : null;
  return {
    openingMarkerPercent: meanOpen,
    openingLabel: `${meanOpen}% mean aperture · ${openingClass}`,
    openingDetail: [
      state.postureDetail || 'Modeled adduction / open-quotient candidate.',
      cycleGap == null ? null : `Slow-motion cycle gap ${cycleGap}%.`,
      'Not laryngoscopy.',
    ].filter(Boolean).join(' '),
    tensionLabel: state.tensionPercent == null ? 'unknown' : `${state.tensionPercent}% · simulated`,
    tensionDetail: state.tensionDetail || 'not measured from audio',
    vibrationLabel: state.vibration,
    vibrationDetail: `${state.vibrationDetail || 'no voiced evidence'} · ${vibrationClass}`,
    techniqueLabel: state.technique,
    techniqueDetail: state.techniqueDetail,
    evidenceLabel: vibrationClass === 'derived'
      ? 'mixed · vibration derived'
      : `${state.evidenceStrength || 'limited'} · uncalibrated`,
    evidenceDetail: [
      vibrationClass === 'derived'
        ? 'Vibration and F0 are derived from the recording.'
        : (state.evidenceSummary || 'Illustrative model.'),
      'Opening, tension, contact, and mucosal phase are simulated teaching geometry.',
      state.evidenceSources || '',
    ].filter(Boolean).join(' ').trim(),
    cycleLabel: `cycle: ${cycle}`,
    contactLabel: contactPct == null
      ? 'contact: unknown'
      : `contact: ${contactPct}% ${(dynamics.contactEvidenceClass || 'simulated')} candidate`,
    waveLabel: phaseDeg == null
      ? 'mucosal phase: unknown'
      : `mucosal phase: ${phaseDeg}° modeled inferior-leads-superior`,
  };
}

export function drawVocalFoldCloseup(ctx, W, H, state, timeMs = 0) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H * 0.51;
  const S = Math.min(W / 680, H / 440);
  const modeledTension = state.modeledTension ?? 0.5;
  const edgeThickness = state.edgeThickness ?? 0.5;
  const falseFoldActivity = state.falseFoldActivity ?? 0.05;
  const supraglotticNarrowing = state.supraglotticNarrowing ?? 0.18;
  const vibrates = (state.drive ?? 0) > 0.08
    && !state.vibration.includes('unphonated')
    && !state.vibration.includes('not ');
  const dynamics = createFoldDynamics(state, timeMs);
  const posteriorGap = Math.max(5 * S, (8 + state.glottisOpen * 68) * S);
  const midGap = Math.max(2 * S, posteriorGap * (0.34 + state.glottisOpen * 0.2));
  const anteriorY = cy - 92 * S;
  const posteriorY = cy + 104 * S;

  // Laryngeal inlet and moist surrounding mucosa.
  const inlet = ctx.createRadialGradient(cx, cy, 24 * S, cx, cy, 236 * S);
  inlet.addColorStop(0, 'rgba(42,10,17,0.98)');
  inlet.addColorStop(0.52, 'rgba(104,29,46,0.96)');
  inlet.addColorStop(0.8, 'rgba(151,57,76,0.9)');
  inlet.addColorStop(1, 'rgba(38,12,20,0)');
  ctx.fillStyle = inlet;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4 * S, 238 * S, 178 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // Epiglottis: anterior leaf-shaped cartilage at the top of the view.
  const epiglottis = ctx.createLinearGradient(cx, cy - 180 * S, cx, cy - 92 * S);
  epiglottis.addColorStop(0, 'rgba(230,123,133,0.95)');
  epiglottis.addColorStop(0.58, 'rgba(181,72,91,0.96)');
  epiglottis.addColorStop(1, 'rgba(111,37,57,0.95)');
  ctx.fillStyle = epiglottis;
  ctx.strokeStyle = 'rgba(255,177,184,0.62)';
  ctx.lineWidth = 1.4 * S;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 184 * S);
  ctx.bezierCurveTo(cx - 76 * S, cy - 177 * S, cx - 116 * S, cy - 134 * S, cx - 102 * S, cy - 108 * S);
  ctx.quadraticCurveTo(cx, cy - 126 * S, cx + 102 * S, cy - 108 * S);
  ctx.bezierCurveTo(cx + 116 * S, cy - 134 * S, cx + 76 * S, cy - 177 * S, cx, cy - 184 * S);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Aryepiglottic folds define the rim of the laryngeal inlet.
  for (const side of [-1, 1]) {
    const rimX = (190 - supraglotticNarrowing * 48) * S;
    ctx.strokeStyle = 'rgba(232,124,143,0.72)';
    ctx.lineWidth = (14 + supraglotticNarrowing * 5) * S;
    ctx.beginPath();
    ctx.moveTo(cx + side * 90 * S, cy - 115 * S);
    ctx.bezierCurveTo(
      cx + side * 168 * S, cy - 67 * S,
      cx + side * rimX, cy + 50 * S,
      cx + side * 93 * S, cy + 132 * S,
    );
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,181,190,0.35)';
    ctx.lineWidth = 2 * S;
    ctx.stroke();
  }

  // False (vestibular) folds sit superior and lateral to the true folds.
  for (const side of [-1, 1]) {
    const falseInner = (24 - falseFoldActivity * 12) * S;
    const falseOuter = (118 - falseFoldActivity * 26) * S;
    const falseFold = ctx.createLinearGradient(cx, cy, cx + side * 170 * S, cy);
    falseFold.addColorStop(0, `rgba(225,111,130,${0.72 + falseFoldActivity * 0.24})`);
    falseFold.addColorStop(1, `rgba(125,43,64,${0.7 + falseFoldActivity * 0.24})`);
    ctx.fillStyle = falseFold;
    ctx.strokeStyle = 'rgba(255,162,176,0.5)';
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath();
    ctx.moveTo(cx + side * falseInner, anteriorY - 4 * S);
    ctx.bezierCurveTo(
      cx + side * 80 * S, cy - 55 * S,
      cx + side * 135 * S, cy + 10 * S,
      cx + side * falseOuter, posteriorY - 10 * S,
    );
    ctx.bezierCurveTo(
      cx + side * 165 * S, cy + 48 * S,
      cx + side * 172 * S, cy - 40 * S,
      cx + side * 95 * S, cy - 102 * S,
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Laryngeal ventricles: recesses between false and true folds.
  for (const side of [-1, 1]) {
    ctx.strokeStyle = 'rgba(31,4,12,0.8)';
    ctx.lineWidth = 9 * S;
    ctx.beginPath();
    ctx.moveTo(cx + side * 34 * S, anteriorY + 20 * S);
    ctx.bezierCurveTo(
      cx + side * 78 * S, cy - 30 * S,
      cx + side * 98 * S, cy + 40 * S,
      cx + side * 82 * S, posteriorY - 12 * S,
    );
    ctx.stroke();
    ctx.strokeStyle = 'rgba(245,137,154,0.28)';
    ctx.lineWidth = 1.2 * S;
    ctx.stroke();
  }

  // Inferior and superior glottal areas reveal the vertical mucosal phase delay.
  drawGlottalOpening(ctx, {
    dynamics, cx, anteriorY, posteriorY, midGap, posteriorGap, S,
    layer: 'inferior',
    fill: 'rgba(80,22,66,0.72)',
  });
  drawGlottalOpening(ctx, {
    dynamics, cx, anteriorY, posteriorY, midGap, posteriorGap, S,
    layer: 'superior',
    fill: 'rgba(1,3,5,0.98)',
  });

  // True vocal folds: translucent tissue bodies around flexible attached edges.
  for (const side of [-1, 1]) {
    const bodyWidth = (54 + edgeThickness * 62 + modeledTension * 10) * S;
    const tense = clamp(modeledTension);
    const trueFold = ctx.createLinearGradient(cx, cy, cx + side * 118 * S, cy);
    trueFold.addColorStop(0, `rgba(255,${Math.round(244 - 90 * tense)},${Math.round(226 - 150 * tense)},0.5)`);
    trueFold.addColorStop(0.28, `rgba(239,${Math.round(188 - 70 * tense)},${Math.round(184 - 90 * tense)},0.46)`);
    trueFold.addColorStop(0.72, `rgba(190,${Math.round(93 - 20 * tense)},${Math.round(114 - 40 * tense)},0.4)`);
    trueFold.addColorStop(1, 'rgba(111,38,61,0.32)');
    ctx.fillStyle = trueFold;
    ctx.strokeStyle = tense > 0.62
      ? `rgba(255,${Math.round(160 - 40 * tense)},${Math.round(120 - 40 * tense)},0.55)`
      : 'rgba(255,218,210,0.42)';
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath();
    traceFoldEdge(ctx, {
      dynamics, cx, anteriorY, posteriorY, midGap, posteriorGap, side, S,
      layer: 'superior',
    });
    ctx.bezierCurveTo(
      cx + side * bodyWidth * 0.92, posteriorY - 12 * S,
      cx + side * bodyWidth, cy + 10 * S,
      cx + side * bodyWidth * 0.58, anteriorY - 4 * S,
    );
    ctx.quadraticCurveTo(cx + side * 25 * S, anteriorY - 10 * S, cx + side * 1.5 * S, anteriorY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Elastic fibers inside the tissue body.
    for (let fiber = 1; fiber <= 3; fiber++) {
      const offset = fiber * 13 * S;
      ctx.strokeStyle = `rgba(255,188,190,${0.22 - fiber * 0.035})`;
      ctx.lineWidth = (0.55 + edgeThickness * 0.55) * S;
      ctx.beginPath();
      ctx.moveTo(cx + side * (5 * S + offset * 0.2), anteriorY + fiber * 3 * S);
      ctx.bezierCurveTo(
        cx + side * (midGap + offset), cy - 22 * S,
        cx + side * (posteriorGap + offset), cy + 55 * S,
        cx + side * (posteriorGap * 0.82 + offset * 0.7), posteriorY - fiber * 2 * S,
      );
      ctx.stroke();
    }

    // Inferior edge (darker) precedes the superior free edge in phase.
    if (vibrates) {
      drawBodyCoverEdge(ctx, {
        dynamics, cx, anteriorY, posteriorY, midGap, posteriorGap, side, S,
        layer: 'inferior',
        color: 'rgba(255,136,162,0.58)',
        width: 4 + edgeThickness * 1.6,
      });
    }
    drawBodyCoverEdge(ctx, {
      dynamics, cx, anteriorY, posteriorY, midGap, posteriorGap, side, S,
      layer: 'superior',
      color: vibrates ? 'rgba(255,252,232,0.96)' : 'rgba(255,240,224,0.78)',
      width: (vibrates ? 2.2 : 1.8) + edgeThickness * 1.4,
    });
  }

  if (dynamics.contactAmount > 0.02) {
    const contact = ctx.createRadialGradient(cx, cy, 2, cx, cy, 54 * S);
    contact.addColorStop(0, `rgba(255,221,155,${0.2 + dynamics.contactAmount * 0.5})`);
    contact.addColorStop(1, 'rgba(255,150,100,0)');
    ctx.fillStyle = contact;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 34 * S, 72 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Posterior arytenoid and corniculate cartilages.
  for (const side of [-1, 1]) {
    const x = cx + side * (posteriorGap + 45 * S);
    const y = posteriorY + 15 * S;
    const ary = ctx.createRadialGradient(x - side * 5 * S, y - 7 * S, 2, x, y, 32 * S);
    ary.addColorStop(0, 'rgba(244,160,158,0.98)');
    ary.addColorStop(0.65, 'rgba(177,72,91,0.96)');
    ary.addColorStop(1, 'rgba(91,31,50,0.95)');
    ctx.fillStyle = ary;
    ctx.strokeStyle = 'rgba(255,190,190,0.55)';
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath();
    ctx.ellipse(x, y, 30 * S, 25 * S, side * -0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(225,126,137,0.9)';
    ctx.beginPath();
    ctx.arc(x - side * 5 * S, y - 25 * S, 8 * S, 0, Math.PI * 2);
    ctx.fill();
  }

  // Interarytenoid posterior wall.
  ctx.strokeStyle = 'rgba(220,103,120,0.72)';
  ctx.lineWidth = 13 * S;
  ctx.beginPath();
  ctx.moveTo(cx - posteriorGap - 26 * S, posteriorY + 32 * S);
  ctx.quadraticCurveTo(cx, posteriorY + 50 * S, cx + posteriorGap + 26 * S, posteriorY + 32 * S);
  ctx.stroke();

  drawGlottalJet(ctx, {
    dynamics,
    cx,
    anteriorY,
    posteriorY,
    midGap,
    posteriorGap,
    S,
    timeMs,
    airflow: state.airflow || {},
    glottisOpen: state.glottisOpen,
    phonated: vibrates,
  });

  // Sparse labels clarify anatomy without obscuring the moving folds.
  drawDetailLabel(ctx, 'EPIGLOTTIS', cx + 116 * S, cy - 157 * S, cx + 63 * S, cy - 145 * S, 'right', S);
  drawDetailLabel(ctx, 'FALSE FOLD', cx - 205 * S, cy - 57 * S, cx - 108 * S, cy - 35 * S, 'left', S);
  drawDetailLabel(ctx, 'TRUE FOLD', cx - 205 * S, cy + 8 * S, cx - 63 * S, cy + 9 * S, 'left', S);
  drawDetailLabel(ctx, 'GLOTTIS', cx + 190 * S, cy + 13 * S, cx + midGap * 0.5, cy + 12 * S, 'right', S);
  drawDetailLabel(ctx, 'ARYTENOID', cx + 195 * S, cy + 125 * S, cx + posteriorGap + 42 * S, posteriorY + 15 * S, 'right', S);

  ctx.font = `${Math.max(9, 10 * S)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(170,190,206,0.72)';
  ctx.fillText('ANTERIOR', cx, 15 * S);
  ctx.fillText('POSTERIOR', cx, H - 10 * S);
  return dynamics;
}

function drawDetailLabel(ctx, text, x, y, targetX, targetY, align, S) {
  ctx.strokeStyle = 'rgba(139,170,186,0.38)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(targetX, targetY);
  ctx.lineTo(x, y - 3 * S);
  ctx.stroke();
  ctx.font = `${Math.max(8, 8.5 * S)}px "JetBrains Mono", monospace`;
  ctx.textAlign = align;
  ctx.fillStyle = 'rgba(178,203,214,0.76)';
  ctx.fillText(text, x, y);
}

function foldEdgePoint({
  dynamics,
  cx,
  anteriorY,
  posteriorY,
  midGap,
  posteriorGap,
  side,
  S,
  layer,
  t,
}) {
  const one = 1 - t;
  const baseGap = (
    3 * one * one * t * midGap
    + 3 * one * t * t * posteriorGap
    + t * t * t * posteriorGap * 0.82
  );
  const lateralDisplacement = edgeDisplacement(dynamics, { t, side, layer }) * 72 * S;
  return {
    x: cx + side * Math.max(0, baseGap + lateralDisplacement),
    y: anteriorY + (posteriorY - anteriorY) * t,
  };
}

function traceFoldEdge(ctx, config, { reverse = false } = {}) {
  const steps = 42;
  for (let i = 0; i <= steps; i++) {
    const t = reverse ? 1 - i / steps : i / steps;
    const point = foldEdgePoint({ ...config, t });
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
}

function drawGlottalOpening(ctx, config) {
  ctx.fillStyle = config.fill;
  ctx.beginPath();
  traceFoldEdge(ctx, { ...config, side: -1 });
  traceFoldEdge(ctx, { ...config, side: 1 }, { reverse: true });
  ctx.closePath();
  ctx.fill();
}

function drawBodyCoverEdge(ctx, config) {
  ctx.strokeStyle = config.color;
  ctx.lineWidth = config.width * config.S;
  ctx.beginPath();
  traceFoldEdge(ctx, config);
  ctx.stroke();
}

function slitPointAtDepth(config, t, depth) {
  const d = Math.max(0, Math.min(1, depth));
  const infL = foldEdgePoint({ ...config, layer: 'inferior', side: -1, t });
  const infR = foldEdgePoint({ ...config, layer: 'inferior', side: 1, t });
  const supL = foldEdgePoint({ ...config, layer: 'superior', side: -1, t });
  const supR = foldEdgePoint({ ...config, layer: 'superior', side: 1, t });
  const lerp = (a, b) => ({ x: a.x + (b.x - a.x) * d, y: a.y + (b.y - a.y) * d });
  const left = lerp(infL, supL);
  const right = lerp(infR, supR);
  return {
    left,
    right,
    gap: Math.max(0, right.x - left.x),
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function membranousOrigin(config) {
  return slitPointAtDepth(config, 0.5, 0);
}

/**
 * Superior-view perspective: depth 0 collapses into the dark membranous
 * chink; depth 1 is the superior free-edge station along the true-fold slit.
 */
function emergeFromSlit(config, t, depth) {
  const d = Math.max(0, Math.min(1, depth));
  const ease = d * d;
  const origin = membranousOrigin(config);
  const surface = slitPointAtDepth(config, t, 1);
  return {
    x: origin.x + (surface.x - origin.x) * ease,
    y: origin.y + (surface.y - origin.y) * ease,
    gap: Math.max(0.4 * (config.S || 1), surface.gap * (0.08 + 0.92 * d)),
    depth: d,
  };
}

export function glottalJetParticles({
  timeMs = 0,
  flowRate = 0.45,
  flowDirection = 1,
  phonated = false,
  opening = 0.2,
  superiorGap = 0.2,
  count = 180,
  frequencyHertz = 0,
} = {}) {
  const gap = Math.max(opening, superiorGap, 0);
  const drive = Math.max(flowRate, 0);
  const holding = Math.abs(flowDirection) < 0.12;
  if (!(drive > 0.04) && holding) return [];
  if (!(drive > 0.04)) return [];
  const openGate = Math.max(0.16, gap);
  const n = Math.max(48, Math.round(count * (0.7 + openGate)));
  const visualHz = phonated && frequencyHertz > 60
    ? Math.max(1.6, Math.min(14, frequencyHertz / 48))
    : 0;
  const speed = 0.00115 * (0.85 + drive) * (visualHz ? 0.92 + 0.16 * (0.5 + 0.5 * Math.sin((timeMs / 1000) * visualHz * Math.PI * 2)) : 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = i / n;
    const jitter = ((i * 23) % 13) / 90;
    const phase = ((base + jitter + timeMs * speed) % 1 + 1) % 1;
    const localDir = holding ? (i % 2 === 0 ? 1 : -1) : Math.sign(flowDirection) || 1;
    const t = 0.28 + ((i * 0.618034) % 1) * 0.44;
    const depth = localDir > 0 ? phase : 1 - phase;
    const core = i % 3 === 0;
    const lane = (core ? ((i % 5) - 2) / 22 : ((i % 9) - 4) / 7.2) * (0.22 + 0.78 * depth);
    out.push({
      t,
      depth,
      lane,
      inbound: localDir < 0,
      alpha: (0.16 + 0.84 * depth) * (0.42 + 0.58 * drive) * (core ? 1 : 0.72),
      radius: (0.9 + 2.6 * depth) * (0.7 + openGate) * (phonated ? 1.12 : 1) * (core ? 1.22 : 0.9),
      streak: 0.08 + drive * 0.05,
      phonated,
      core,
    });
  }
  return out;
}

function drawGlottalJet(ctx, {
  dynamics, cx, anteriorY, posteriorY, midGap, posteriorGap, S, timeMs, airflow, glottisOpen, phonated,
}) {
  const flowRate = Number.isFinite(airflow.flowRate) ? airflow.flowRate : Math.max(0.32, glottisOpen || 0.2);
  const flowDirection = airflow.direction == null ? 1 : airflow.direction;
  const jetPhonated = Boolean(airflow.phonated || phonated);
  const particles = glottalJetParticles({
    timeMs,
    flowRate,
    flowDirection,
    phonated: jetPhonated,
    opening: glottisOpen ?? dynamics.opening,
    superiorGap: dynamics.superiorGap,
    frequencyHertz: dynamics.actualFrequencyHertz || 0,
  });
  if (!particles.length) return;

  const edgeConfig = {
    dynamics, cx, anteriorY, posteriorY, midGap, posteriorGap, S,
  };
  const oralRgb = jetPhonated ? { r: 255, g: 224, b: 130 } : { r: 160, g: 225, b: 255 };
  const rgba = (c, a) => `rgba(${c.r},${c.g},${c.b},${a})`;
  const origin = membranousOrigin(edgeConfig);

  ctx.save();
  ctx.beginPath();
  traceFoldEdge(ctx, { ...edgeConfig, layer: 'superior', side: -1 });
  traceFoldEdge(ctx, { ...edgeConfig, layer: 'superior', side: 1 }, { reverse: true });
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = `rgba(2,1,6,${0.42 + flowRate * 0.22})`;
  ctx.beginPath();
  ctx.ellipse(origin.x, origin.y, Math.max(3 * S, midGap * 0.28), Math.max(8 * S, 18 * S), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(oralRgb, 0.28 + flowRate * 0.34);
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, Math.max(1.6 * S, 3.4 * S * (0.35 + flowRate)), 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i <= 12; i++) {
    const t = 0.28 + (i / 12) * 0.44;
    const lip = slitPointAtDepth(edgeConfig, t, 1);
    ctx.strokeStyle = rgba(oralRgb, 0.18 + flowRate * 0.34);
    ctx.lineWidth = Math.max(0.9 * S, Math.max(lip.gap, 1.2 * S) * (0.16 + 0.2 * flowRate));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(lip.x, lip.y);
    ctx.stroke();
  }

  for (const p of particles) {
    const mid = emergeFromSlit(edgeConfig, p.t, p.depth);
    const ahead = emergeFromSlit(
      edgeConfig,
      p.t,
      Math.max(0, Math.min(1, p.depth + ((p.inbound || flowDirection < 0) ? -p.streak : p.streak))),
    );
    const laneScale = mid.gap * (0.04 + 0.34 * p.depth * p.depth);
    const x = mid.x + p.lane * laneScale;
    const y = mid.y;
    const ax = ahead.x + p.lane * ahead.gap * (0.04 + 0.34 * ahead.depth * ahead.depth);
    const ay = ahead.y;
    const r = Math.max(0.35 * S, (0.45 + 2.8 * p.depth * p.depth) * S * (p.core ? 1.15 : 0.85));
    ctx.strokeStyle = rgba(oralRgb, p.alpha);
    ctx.lineWidth = r * (p.core ? 1.55 : 1.1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.fillStyle = rgba(oralRgb, Math.min(1, p.alpha * 0.95));
    ctx.beginPath();
    ctx.arc(x, y, r * (0.4 + 0.95 * p.depth), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.98, p.alpha * (0.12 + 0.88 * p.depth))})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.32 * (0.2 + 0.8 * p.depth), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    if (p.depth < 0.82) continue;
    const mid = emergeFromSlit(edgeConfig, p.t, 1);
    const travel = (p.depth - 0.82) / 0.18;
    const spray = 10 * S * travel;
    const x = mid.x + p.lane * Math.max(4 * S, mid.gap * 0.7);
    const y = mid.y;
    const r = (p.radius * 0.7 + travel * 1.8) * S + spray * 0.12;
    ctx.fillStyle = rgba(oralRgb, p.alpha * 0.5 * (1 - travel * 0.4));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

