/**
 * Canonical evidence classes for Resonant Mirror v2 (spec §3).
 *
 * A learned or simulated result MUST NOT masquerade as a measurement.
 */

export const EVIDENCE_CLASSES = Object.freeze([
  'measured',
  'derived',
  'inferred',
  'personal_inference',
  'human_labeled',
  'simulated',
  'legacy_hypothesis',
  'unknown',
]);

export const EVIDENCE_CLASS_SET = new Set(EVIDENCE_CLASSES);

/** Ordinary-language labels for user-facing copy. */
export const EVIDENCE_LABELS = Object.freeze({
  measured: 'measured',
  derived: 'calculated from the recording',
  inferred: 'estimated',
  personal_inference: 'compared with your previous examples',
  human_labeled: 'labeled by a person',
  simulated: 'simulated visualization',
  legacy_hypothesis: 'legacy prototype rule (not validated)',
  unknown: 'not enough evidence',
});

export function isEvidenceClass(value) {
  return EVIDENCE_CLASS_SET.has(value);
}

export function assertEvidenceClass(value, context = 'evidenceClass') {
  if (!isEvidenceClass(value)) {
    throw new Error(`${context} must be one of: ${EVIDENCE_CLASSES.join(', ')}`);
  }
  return value;
}

/**
 * Capability status for learned / heuristic features (spec §38A).
 * Existence of a number is not evidence that the capability works.
 */
export const CAPABILITY_STATUSES = Object.freeze([
  'implemented_unvalidated',
  'research_target',
  'validated_for_defined_conditions',
  'disabled',
]);

export const RESEARCH_GATES = Object.freeze([
  'disabled',
  'experimental',
  'validation-pending',
  'validated-for-limited-use',
]);

export function userFacingAllowed(gate) {
  return gate === 'validated-for-limited-use';
}
