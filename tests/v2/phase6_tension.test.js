import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TensionEstimator, orangeRedColor, densityCue, SELF_TENSION_LABELS } from '../../src/v2/tension/estimator.js';
import { createVocalFrame, emptyFeatures } from '../../src/v2/contracts/schemas.js';
import { composeVisualStates } from '../../src/v2/visualization/composeVisuals.js';
import { inspectActiveVisuals, whyActive } from '../../src/v2/visualization/inspector.js';
import { resolveVisualState, createUnknownVisualState } from '../../src/v2/visualization/mirrorState.js';
import { defaultFeatureFlags } from '../../src/v2/contracts/featureFlags.js';
import { auraSemantics } from '../../src/v2/visualization/composeVisuals.js';

function frame(features) {
  return createVocalFrame({
    timestampSeconds: 1,
    source: 'user',
    features: { ...emptyFeatures(), ...features },
    provenanceByField: {},
  });
}

describe('Phase 6 — tension evidence', () => {
  it('uses graded evidence wording and a non-color cue', () => {
    const est = new TensionEstimator();
    const state = est.infer(frame({
      periodicity: 0.2,
      relativeLevelDecibelsFullScale: -10,
      spectralTilt: 0.1,
      pitchConfidence: 0.2,
    }), { selfLabels: ['jaw tight'] });
    assert.equal(state.wording, 'tension evidence');
    assert.equal(state.notDiagnosis, true);
    assert.ok(state.global > 0 && state.global <= 1);
    assert.ok(state.regions.jaw >= state.regions.face);
    assert.match(state.accessibilityCue, /tension evidence/);
    assert.ok(SELF_TENSION_LABELS.includes('jaw tight'));
    const color = orangeRedColor(0.9);
    assert.match(color.css, /rgba\(255,/);
    assert.equal(densityCue(0.9), 'tension evidence: dense');
  });

  it('exposes a provenance inspector and fades stale/unknown tension', () => {
    const flags = defaultFeatureFlags();
    const f = frame({ periodicity: 0.2, relativeLevelDecibelsFullScale: -8, spectralTilt: 0, pitchConfidence: 0.2 });
    new TensionEstimator().infer(f);
    const visuals = composeVisualStates(f, { flags });
    const jaw = visuals.find((v) => v.visualName === 'jawTensionGlow');
    assert.equal(jaw.evidenceClass, 'inferred');
    const inspected = inspectActiveVisuals(visuals);
    assert.ok(inspected.some((row) => row.visualName === 'jawTensionGlow' && row.whyActive));
    const unknown = createUnknownVisualState('jawTensionGlow', 2);
    assert.match(whyActive(unknown), /inactive/);
    const stale = resolveVisualState({
      visualName: 'jawTensionGlow',
      timestampSeconds: 10,
      value: 0.8,
      evidenceClass: 'inferred',
      observedAtSeconds: 1,
      expiresAtSeconds: 1.4,
    });
    assert.equal(stale.evidenceClass, 'unknown');
  });

  it('keeps aura coherence independent from expressive energy', () => {
    const f = frame({ periodicity: 0.9, pitchConfidence: 0.8, fundamentalFrequencyHertz: 220, relativeLevelDecibelsFullScale: -20 });
    const visuals = composeVisualStates(f, { flags: defaultFeatureFlags() });
    const aura = auraSemantics(visuals);
    assert.equal(aura.independent, true);
    assert.equal(aura.judgment, null);
    assert.ok(aura.coherence > 0);
    assert.equal(aura.energy, 0);
  });
});
