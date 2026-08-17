/**
 * Canonical data schemas (spec §23).
 * Validators return { ok, errors, value } and never invent fields.
 */

import { isEvidenceClass } from './evidence.js';
import { QUALITY_FLAG_SET } from './qualityFlags.js';

const SOURCES = new Set(['user', 'reference']);
const INPUT_MODES = new Set(['microphone', 'microphone_plus_reference']);

function err(errors, path, message) {
  errors.push({ path, message });
}

function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isNullNum(n) {
  return n == null || isNum(n);
}

export function validateProvenance(p, path, errors) {
  if (!p || typeof p !== 'object') {
    err(errors, path, 'provenance object required');
    return;
  }
  if (!isEvidenceClass(p.evidenceClass)) err(errors, `${path}.evidenceClass`, 'invalid evidence class');
  if (!Array.isArray(p.sourceIds)) err(errors, `${path}.sourceIds`, 'must be an array');
  if (!isNum(p.observedAtSeconds)) err(errors, `${path}.observedAtSeconds`, 'must be a number');
  if (p.confidence != null && (!isNum(p.confidence) || p.confidence < 0 || p.confidence > 1)) {
    err(errors, `${path}.confidence`, 'must be null or [0, 1]');
  }
  if (p.qualityFlags) {
    for (const flag of p.qualityFlags) {
      if (!QUALITY_FLAG_SET.has(flag)) err(errors, `${path}.qualityFlags`, `unknown flag ${flag}`);
    }
  }
}

export function validateSession(session) {
  const errors = [];
  if (!session || typeof session !== 'object') return { ok: false, errors: [{ path: '', message: 'object required' }] };
  if (typeof session.sessionId !== 'string' || !session.sessionId) err(errors, 'sessionId', 'required string');
  if (typeof session.startedAt !== 'string' && !isNum(session.startedAt)) err(errors, 'startedAt', 'timestamp required');
  if (session.endedAt != null && typeof session.endedAt !== 'string' && !isNum(session.endedAt)) {
    err(errors, 'endedAt', 'timestamp or null');
  }
  if (!session.modelVersions || typeof session.modelVersions !== 'object') {
    err(errors, 'modelVersions', 'object required');
  }
  if (!INPUT_MODES.has(session.inputMode)) err(errors, 'inputMode', 'microphone | microphone_plus_reference');
  if (session.referenceTrackId != null && typeof session.referenceTrackId !== 'string') {
    err(errors, 'referenceTrackId', 'string or null');
  }
  if (!session.calibration || typeof session.calibration !== 'object') err(errors, 'calibration', 'object required');
  if (!session.userConsent || typeof session.userConsent !== 'object') err(errors, 'userConsent', 'object required');
  if (!Array.isArray(session.notes)) err(errors, 'notes', 'array required');
  return { ok: errors.length === 0, errors, value: session };
}

export function validateVocalFrame(frame) {
  const errors = [];
  if (!frame || typeof frame !== 'object') return { ok: false, errors: [{ path: '', message: 'object required' }] };
  if (!isNum(frame.timestampSeconds)) err(errors, 'timestampSeconds', 'required number');
  if (!SOURCES.has(frame.source)) err(errors, 'source', 'user | reference');
  if (!frame.features || typeof frame.features !== 'object') {
    err(errors, 'features', 'object required');
  } else {
    const f = frame.features;
    if (!isNullNum(f.fundamentalFrequencyHertz)) err(errors, 'features.fundamentalFrequencyHertz', 'number or null');
    if (!isNullNum(f.pitchConfidence)) err(errors, 'features.pitchConfidence', 'number or null');
    if (!isNullNum(f.relativeLevelDecibelsFullScale)) {
      err(errors, 'features.relativeLevelDecibelsFullScale', 'number or null');
    }
    if (!isNullNum(f.spectralCentroidHertz)) err(errors, 'features.spectralCentroidHertz', 'number or null');
    if (!isNullNum(f.spectralTilt)) err(errors, 'features.spectralTilt', 'number or null');
    if (!isNullNum(f.periodicity)) err(errors, 'features.periodicity', 'number or null');
    if (f.formantsHertz != null && !Array.isArray(f.formantsHertz)) err(errors, 'features.formantsHertz', 'array');
    if (f.formantConfidence != null && !Array.isArray(f.formantConfidence)) {
      err(errors, 'features.formantConfidence', 'array');
    }
  }
  if (!frame.inferences || typeof frame.inferences !== 'object') err(errors, 'inferences', 'object required');
  if (!Array.isArray(frame.qualityFlags)) err(errors, 'qualityFlags', 'array required');
  else {
    for (const flag of frame.qualityFlags) {
      if (!QUALITY_FLAG_SET.has(flag)) err(errors, 'qualityFlags', `unknown flag ${flag}`);
    }
  }
  if (frame.modelVersion != null && typeof frame.modelVersion !== 'string') {
    err(errors, 'modelVersion', 'string or null');
  }
  if (!frame.provenanceByField || typeof frame.provenanceByField !== 'object') {
    err(errors, 'provenanceByField', 'object required');
  } else {
    for (const [key, prov] of Object.entries(frame.provenanceByField)) {
      validateProvenance(prov, `provenanceByField.${key}`, errors);
    }
  }
  return { ok: errors.length === 0, errors, value: frame };
}

export function validatePhrase(phrase) {
  const errors = [];
  if (!phrase || typeof phrase !== 'object') return { ok: false, errors: [{ path: '', message: 'object required' }] };
  if (typeof phrase.phraseId !== 'string' || !phrase.phraseId) err(errors, 'phraseId', 'required');
  if (typeof phrase.sessionId !== 'string' || !phrase.sessionId) err(errors, 'sessionId', 'required');
  if (!SOURCES.has(phrase.source)) err(errors, 'source', 'user | reference');
  if (!isNum(phrase.startSeconds) || !isNum(phrase.endSeconds)) err(errors, 'startSeconds/endSeconds', 'numbers');
  if (isNum(phrase.startSeconds) && isNum(phrase.endSeconds) && phrase.endSeconds < phrase.startSeconds) {
    err(errors, 'endSeconds', 'must be >= startSeconds');
  }
  if (!Array.isArray(phrase.humanLabels)) err(errors, 'humanLabels', 'array required');
  return { ok: errors.length === 0, errors, value: phrase };
}

export function validatePersonalPrototype(proto) {
  const errors = [];
  if (!proto || typeof proto !== 'object') return { ok: false, errors: [{ path: '', message: 'object required' }] };
  if (typeof proto.prototypeId !== 'string' || !proto.prototypeId) err(errors, 'prototypeId', 'required');
  if (typeof proto.name !== 'string' || !proto.name) err(errors, 'name', 'required');
  if (!Array.isArray(proto.exampleIds)) err(errors, 'exampleIds', 'array required');
  if (typeof proto.embeddingVersion !== 'string' || !proto.embeddingVersion) {
    err(errors, 'embeddingVersion', 'required string');
  }
  if (!Array.isArray(proto.centroid)) err(errors, 'centroid', 'array required');
  return { ok: errors.length === 0, errors, value: proto };
}

export function validateVisualState(record) {
  const errors = [];
  if (!record || typeof record !== 'object') return { ok: false, errors: [{ path: '', message: 'object required' }] };
  if (typeof record.visualStateId !== 'string' || !record.visualStateId) err(errors, 'visualStateId', 'required');
  if (!isNum(record.timestampSeconds)) err(errors, 'timestampSeconds', 'required number');
  if (typeof record.visualName !== 'string' || !record.visualName) err(errors, 'visualName', 'required');
  if (record.value != null && typeof record.value !== 'number' && typeof record.value !== 'string') {
    err(errors, 'value', 'number, string, or null');
  }
  if (!isEvidenceClass(record.evidenceClass)) err(errors, 'evidenceClass', 'invalid');
  if (record.confidence != null && (!isNum(record.confidence) || record.confidence < 0 || record.confidence > 1)) {
    err(errors, 'confidence', 'null or [0, 1]');
  }
  if (!Array.isArray(record.sourceFieldPaths)) err(errors, 'sourceFieldPaths', 'array required');
  if (typeof record.mappingVersion !== 'string') err(errors, 'mappingVersion', 'required string');
  if (!isNum(record.observedAtSeconds)) err(errors, 'observedAtSeconds', 'required number');
  if (record.expiresAtSeconds != null && !isNum(record.expiresAtSeconds)) {
    err(errors, 'expiresAtSeconds', 'number or null');
  }
  if (!Array.isArray(record.qualityFlags)) err(errors, 'qualityFlags', 'array required');
  if (record.evidenceClass === 'inferred' && record.visualName === 'jawTensionGlow') {
    // Jaw glow is tension evidence, never measured muscle force.
    if (record.claimsMeasuredMuscleForce) err(errors, 'claimsMeasuredMuscleForce', 'must not be set');
  }
  return { ok: errors.length === 0, errors, value: record };
}

export function emptyFeatures() {
  return {
    fundamentalFrequencyHertz: null,
    pitchConfidence: 0,
    relativeLevelDecibelsFullScale: null,
    spectralCentroidHertz: null,
    spectralRolloffHertz: null,
    spectralTilt: null,
    periodicity: null,
    harmonicity: null,
    rmsAmplitude: null,
    formantsHertz: [],
    formantConfidence: [],
  };
}

export function emptyInferences() {
  return {
    respiration: { class: 'unknown', confidence: 0 },
    registration: { class: 'unknown', confidence: 0 },
    supportEvidence: { value: null, confidence: 0 },
    tensionEvidence: { global: null, regions: {}, confidence: 0 },
    expressiveIntensity: { value: null, confidence: 0 },
  };
}

export function createVocalFrame({
  timestampSeconds,
  source,
  features = emptyFeatures(),
  inferences = emptyInferences(),
  qualityFlags = [],
  modelVersion = null,
  provenanceByField = {},
} = {}) {
  return {
    timestampSeconds,
    source,
    features,
    inferences,
    qualityFlags,
    modelVersion,
    provenanceByField,
  };
}

export function createSession({
  sessionId,
  startedAt,
  endedAt = null,
  modelVersions = {},
  inputMode = 'microphone',
  referenceTrackId = null,
  calibration = { soundPressureLevel: null, units: 'dBFS' },
  userConsent = { rawAudioRetention: false, remoteUpload: false, camera: false },
  notes = [],
  captureSettings = {},
} = {}) {
  return {
    sessionId,
    startedAt,
    endedAt,
    modelVersions,
    inputMode,
    referenceTrackId,
    calibration,
    userConsent,
    notes,
    captureSettings,
  };
}
