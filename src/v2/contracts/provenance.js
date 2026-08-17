/**
 * Provenance records (spec REQ-005A, REQ-073).
 *
 * Every derived field, inference, and visual state must be traceable.
 * Missing or stale evidence becomes unknown — never a plausible guess.
 */

import { assertEvidenceClass } from './evidence.js';
import { normalizeQualityFlags } from './qualityFlags.js';

export function nowSeconds(clockSeconds = null) {
  if (typeof clockSeconds === 'number' && Number.isFinite(clockSeconds)) return clockSeconds;
  return Date.now() / 1000;
}

/**
 * @typedef {object} Provenance
 * @property {string} evidenceClass
 * @property {string[]} sourceIds
 * @property {string|null} algorithmVersion
 * @property {string|null} modelVersion
 * @property {number|null} confidence
 * @property {number} observedAtSeconds
 * @property {number|null} expiresAtSeconds
 * @property {string[]} qualityFlags
 * @property {string[]} sourceFieldPaths
 */

export function createProvenance({
  evidenceClass,
  sourceIds = [],
  algorithmVersion = null,
  modelVersion = null,
  confidence = null,
  observedAtSeconds,
  expiresAtSeconds = null,
  qualityFlags = [],
  sourceFieldPaths = [],
} = {}) {
  assertEvidenceClass(evidenceClass);
  if (!Number.isFinite(observedAtSeconds)) {
    throw new Error('observedAtSeconds is required');
  }
  if (confidence != null && (confidence < 0 || confidence > 1)) {
    throw new Error('confidence must be in [0, 1] or null');
  }
  return {
    evidenceClass,
    sourceIds: [...sourceIds],
    algorithmVersion,
    modelVersion,
    confidence,
    observedAtSeconds,
    expiresAtSeconds,
    qualityFlags: normalizeQualityFlags(qualityFlags),
    sourceFieldPaths: [...sourceFieldPaths],
  };
}

export function isStale(provenance, atSeconds) {
  if (!provenance) return true;
  if (provenance.expiresAtSeconds == null) return false;
  return atSeconds > provenance.expiresAtSeconds;
}

export function unknownProvenance(atSeconds, extras = {}) {
  return createProvenance({
    evidenceClass: 'unknown',
    observedAtSeconds: atSeconds,
    qualityFlags: extras.qualityFlags || ['missing_evidence'],
    sourceIds: extras.sourceIds || [],
    sourceFieldPaths: extras.sourceFieldPaths || [],
    algorithmVersion: extras.algorithmVersion || null,
    modelVersion: extras.modelVersion || null,
    confidence: 0,
    expiresAtSeconds: extras.expiresAtSeconds ?? atSeconds,
  });
}

export function withUnknownIfStale(value, provenance, atSeconds) {
  if (value == null || !provenance || isStale(provenance, atSeconds)) {
    return {
      value: null,
      provenance: unknownProvenance(atSeconds, {
        qualityFlags: value == null ? ['missing_evidence'] : ['stale_evidence'],
        sourceIds: provenance?.sourceIds,
        sourceFieldPaths: provenance?.sourceFieldPaths,
        algorithmVersion: provenance?.algorithmVersion,
        modelVersion: provenance?.modelVersion,
      }),
    };
  }
  return { value, provenance };
}
