/**
 * Headphone / playback-leakage handling (REQ-009).
 *
 * Leakage estimation is a RESEARCH TARGET. Until validated, the product
 * relies on explicit headphone guidance and confidence warnings rather
 * than claiming reliable automatic leakage detection.
 */

export const HEADPHONE_GUIDANCE =
  'Use headphones for uploaded-song comparison so playback is less likely to leak into the microphone. This is a signal-quality requirement, not vocal coaching.';

export function leakageAssessment({
  referencePlaying = false,
  microphoneActive = false,
  estimatedLeakage = null,
  threshold = 0.35,
} = {}) {
  const simultaneous = referencePlaying && microphoneActive;
  const qualityFlags = [];
  if (simultaneous) qualityFlags.push('headphones_recommended');

  let leakageSuspect = false;
  let automaticDetectionClaimed = false;
  if (estimatedLeakage != null && Number.isFinite(estimatedLeakage) && estimatedLeakage >= threshold) {
    leakageSuspect = true;
    qualityFlags.push('reference_leakage');
  } else if (simultaneous) {
    // Conservative: warn whenever both streams run. Do not claim a detector.
    leakageSuspect = false;
  }

  return {
    simultaneous,
    leakageSuspect,
    automaticDetectionClaimed,
    estimatedLeakage,
    estimatedLeakageProvisional: estimatedLeakage != null,
    thresholdProvisional: true,
    qualityFlags,
    warning: simultaneous
      ? HEADPHONE_GUIDANCE
      : null,
    disableHighLevelComparisons: qualityFlags.includes('reference_leakage'),
    microphoneFeaturesAreCleanSingerOnly: simultaneous ? false : true,
  };
}

/**
 * Unvalidated crude correlation between mic RMS and reference RMS.
 * Returned as a research quantity only — never as a trusted detector.
 */
export function crudeLeakageCorrelation(userRmsSeries, referenceRmsSeries) {
  const n = Math.min(userRmsSeries.length, referenceRmsSeries.length);
  if (n < 8) return null;
  let su = 0, sr = 0, suu = 0, srr = 0, sur = 0;
  for (let i = 0; i < n; i++) {
    const u = userRmsSeries[i];
    const r = referenceRmsSeries[i];
    su += u; sr += r; suu += u * u; srr += r * r; sur += u * r;
  }
  const num = n * sur - su * sr;
  const den = Math.sqrt((n * suu - su * su) * (n * srr - sr * sr));
  if (!(den > 0)) return null;
  return num / den;
}
