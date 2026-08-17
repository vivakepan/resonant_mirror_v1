/**
 * Canonical quality flags (spec REQ-098).
 * When quality is insufficient, higher-level inferences MUST degrade
 * to deterministic measurements that remain valid.
 */

export const QUALITY_FLAGS = Object.freeze([
  'low_microphone_level',
  'clipping',
  'reference_leakage',
  'low_pitch_confidence',
  'polyphonic_contamination',
  'unreliable_formant_estimate',
  'insufficient_voiced_content',
  'unsupported_sample_rate',
  'latency_uncertainty',
  'model_unavailable',
  'embedding_version_mismatch',
  'camera_disabled',
  'camera_confidence_low',
  'stale_evidence',
  'missing_evidence',
  'headphones_recommended',
]);

export const QUALITY_FLAG_SET = new Set(QUALITY_FLAGS);

export function normalizeQualityFlags(flags = []) {
  const out = [];
  for (const flag of flags) {
    if (!QUALITY_FLAG_SET.has(flag)) {
      throw new Error(`Unknown quality flag: ${flag}`);
    }
    if (!out.includes(flag)) out.push(flag);
  }
  return out;
}
