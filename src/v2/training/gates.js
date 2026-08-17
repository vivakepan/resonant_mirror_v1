/**
 * Optional personal weight training gates (Phase 12 / REQ-065–067).
 * Live sessions MUST NOT update weights.
 */

export const TRAINING_POLICY = Object.freeze({
  liveSessionWeightUpdates: false,
  requiresExplicitOptIn: true,
  betweenSessionsOnly: true,
  validatedExamplesOnly: true,
  evaluationGateRequired: true,
  rollbackSupported: true,
});

export function canStartPersonalTraining({
  inLiveSession = false,
  optIn = false,
  validatedExampleCount = 0,
  minValidatedExamples = 20,
} = {}) {
  const reasons = [];
  if (inLiveSession) reasons.push('training must occur between sessions');
  if (!optIn) reasons.push('explicit opt-in required');
  if (validatedExampleCount < minValidatedExamples) {
    reasons.push(`need ${minValidatedExamples} validated examples`);
  }
  return { allowed: reasons.length === 0, reasons, policy: TRAINING_POLICY };
}

export function evaluateCandidate({ metrics, baseline, maxRegression = 0.03 } = {}) {
  const pass = (metrics.heldOutAccuracy ?? 0) >= (baseline.heldOutAccuracy ?? 0) - maxRegression
    && (metrics.shortcutLoudness ?? 1) <= (baseline.shortcutLoudness ?? 1) + 0.1;
  return {
    pass,
    action: pass ? 'activate' : 'reject',
    metrics,
    baseline,
  };
}

export function activateCheckpoint(store, candidate, evaluation) {
  if (!evaluation.pass) {
    store.rejected = store.rejected || [];
    store.rejected.push({ ...candidate, rejectedAt: Date.now() });
    return store;
  }
  store.previous = store.active || null;
  store.active = { ...candidate, activatedAt: Date.now() };
  return store;
}

export function rollback(store) {
  if (!store.previous) throw new Error('no previous checkpoint');
  const current = store.active;
  store.active = store.previous;
  store.previous = current;
  store.rolledBackAt = Date.now();
  return store;
}

export function appendExperimentLog(log, entry) {
  // Append-only: never rewrite prior records (REQ-077A).
  log.push({ ...entry, recordedAt: entry.recordedAt || Date.now() });
  return log;
}
