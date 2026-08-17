/**
 * MirrorStateEngine — provenance-tagged visual state (spec REQ-005A–E).
 *
 * Semantic path:
 *   measured → derived → optional validated inference → visual-state record
 *   → deterministic renderer
 *
 * Decorative randomness MUST NOT change evidentiary meaning.
 */

import { createProvenance, isStale, unknownProvenance } from '../contracts/provenance.js';
import {
  VISUAL_CONTRACTS,
  VISUAL_MAPPING_VERSION,
  PROVISIONAL_MAX_AGE_SECONDS,
  PROHIBITED_VISUAL_SHORTCUTS,
} from '../contracts/visualContracts.js';

function idFor(visualName, timestampSeconds) {
  return `${visualName}:${timestampSeconds.toFixed(3)}`;
}

export function createUnknownVisualState(visualName, timestampSeconds, extras = {}) {
  const contract = VISUAL_CONTRACTS[visualName];
  if (!contract) throw new Error(`Unknown visual: ${visualName}`);
  return {
    visualStateId: idFor(visualName, timestampSeconds),
    timestampSeconds,
    visualName,
    value: null,
    evidenceClass: 'unknown',
    confidence: 0,
    sourceFieldPaths: contract.sourceFieldPaths,
    modelVersion: extras.modelVersion ?? null,
    mappingVersion: VISUAL_MAPPING_VERSION,
    observedAtSeconds: timestampSeconds,
    expiresAtSeconds: timestampSeconds,
    qualityFlags: extras.qualityFlags || ['missing_evidence'],
    unknownBehavior: contract.unknownBehavior,
    assertiveness: 0,
  };
}

export function resolveVisualState({
  visualName,
  timestampSeconds,
  value,
  evidenceClass,
  confidence = null,
  sourceFieldPaths,
  modelVersion = null,
  observedAtSeconds,
  expiresAtSeconds,
  qualityFlags = [],
  reliabilityOk = true,
}) {
  const contract = VISUAL_CONTRACTS[visualName];
  if (!contract) throw new Error(`Unknown visual: ${visualName}`);

  const observed = observedAtSeconds ?? timestampSeconds;
  const maxAge = PROVISIONAL_MAX_AGE_SECONDS[visualName];
  const expires = expiresAtSeconds ?? (maxAge != null ? observed + maxAge : null);
  const provenance = createProvenance({
    evidenceClass,
    observedAtSeconds: observed,
    expiresAtSeconds: expires,
    confidence,
    qualityFlags,
    sourceFieldPaths: sourceFieldPaths || contract.sourceFieldPaths,
    modelVersion,
    algorithmVersion: VISUAL_MAPPING_VERSION,
  });

  const missing = value == null || !reliabilityOk;
  if (missing || isStale(provenance, timestampSeconds) || evidenceClass === 'unknown') {
    const flags = missing
      ? (qualityFlags.includes('missing_evidence') ? qualityFlags : [...qualityFlags, 'missing_evidence'])
      : (qualityFlags.includes('stale_evidence') ? qualityFlags : [...qualityFlags, 'stale_evidence']);
    return createUnknownVisualState(visualName, timestampSeconds, { modelVersion, qualityFlags: flags });
  }

  const conf = confidence == null ? 1 : confidence;
  return {
    visualStateId: idFor(visualName, timestampSeconds),
    timestampSeconds,
    visualName,
    value,
    evidenceClass,
    confidence: conf,
    sourceFieldPaths: provenance.sourceFieldPaths,
    modelVersion,
    mappingVersion: VISUAL_MAPPING_VERSION,
    observedAtSeconds: observed,
    expiresAtSeconds: expires,
    qualityFlags,
    unknownBehavior: contract.unknownBehavior,
    // Confidence affects assertiveness, not truth status (REQ-087B).
    assertiveness: contract.evidenceClass === 'inferred' || evidenceClass === 'inferred'
      ? conf
      : 1,
  };
}

export function replayVisualStates(records) {
  return records.map((r) => resolveVisualState(r));
}

export function prohibitedShortcuts() {
  return [...PROHIBITED_VISUAL_SHORTCUTS];
}

export function inspectVisual(state) {
  const contract = VISUAL_CONTRACTS[state.visualName];
  return {
    visualName: state.visualName,
    currentValue: state.value,
    evidenceClass: state.evidenceClass,
    confidence: state.confidence,
    sourceFieldPaths: state.sourceFieldPaths,
    modelVersion: state.modelVersion,
    ageHint: state.timestampSeconds - state.observedAtSeconds,
    measuredInferredOrSimulated: contract?.evidenceClass || state.evidenceClass,
    unknownBehavior: state.unknownBehavior,
    mappingVersion: state.mappingVersion,
  };
}

export { unknownProvenance };
