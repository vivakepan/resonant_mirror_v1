/**
 * Capture settings are provenance, not assumed-optimal science (REQ-097).
 */

export const ANALYSIS_CAPTURE_DEFAULTS = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
});

export function microphoneConstraints(overrides = {}) {
  return {
    audio: {
      ...ANALYSIS_CAPTURE_DEFAULTS,
      ...overrides,
    },
  };
}

export function captureSettingsRecord(settings = {}, extras = {}) {
  return {
    echoCancellation: settings.echoCancellation ?? ANALYSIS_CAPTURE_DEFAULTS.echoCancellation,
    noiseSuppression: settings.noiseSuppression ?? ANALYSIS_CAPTURE_DEFAULTS.noiseSuppression,
    autoGainControl: settings.autoGainControl ?? ANALYSIS_CAPTURE_DEFAULTS.autoGainControl,
    channelCount: settings.channelCount ?? ANALYSIS_CAPTURE_DEFAULTS.channelCount,
    sampleRate: extras.sampleRate ?? null,
    deviceId: extras.deviceId ?? null,
    assumedScientificallyOptimal: false,
    notes: 'Analysis constraints disable typical voice-call processing. They are recorded and configurable, not claimed optimal.',
  };
}

export function latencyMetadata({
  sampleRate,
  baseLatencySeconds = null,
  outputLatencySeconds = null,
  analysisHopSeconds = 0.02,
  inputDelaySeconds = null,
} = {}) {
  const known = Number.isFinite(baseLatencySeconds) || Number.isFinite(outputLatencySeconds);
  return {
    sampleRate: sampleRate ?? null,
    baseLatencySeconds,
    outputLatencySeconds,
    analysisHopSeconds,
    inputDelaySeconds,
    qualityFlags: known ? [] : ['latency_uncertainty'],
  };
}
