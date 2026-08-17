import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RespirationEstimator, TemporalSmoother, simulatedAirflow, RESPIRATION_CLASSES } from '../../src/v2/respiration/estimator.js';
import { createVocalFrame, emptyFeatures } from '../../src/v2/contracts/schemas.js';
import { defaultFeatureFlags } from '../../src/v2/contracts/featureFlags.js';
import { composeVisualStates } from '../../src/v2/visualization/composeVisuals.js';

function frameWith(features) {
  return createVocalFrame({
    timestampSeconds: 0,
    source: 'user',
    features: { ...emptyFeatures(), ...features },
    provenanceByField: {},
  });
}

describe('Phase 4 — respiration', () => {
  it('includes unknown and does not claim measured airflow', () => {
    assert.ok(RESPIRATION_CLASSES.includes('unknown'));
    const est = new RespirationEstimator({ source: 'user' });
    const state = est.infer(frameWith({ relativeLevelDecibelsFullScale: -12, periodicity: 0.8, rmsAmplitude: 0.2 }));
    assert.equal(state.evidenceClass, 'inferred');
    assert.equal(state.class, 'phonated_exhale');
    const air = simulatedAirflow(state);
    assert.equal(air.evidenceClass, 'simulated');
    assert.match(air.label, /not measured/);
  });

  it('smooths single-frame flicker', () => {
    const s = new TemporalSmoother({ window: 5, minHold: 3 });
    const out = [];
    for (const c of ['phonated_exhale', 'phonated_exhale', 'inhale', 'phonated_exhale', 'phonated_exhale', 'phonated_exhale']) {
      out.push(s.push(c));
    }
    assert.ok(out.filter((c) => c === 'inhale').length <= 1);
  });

  it('stores event records with provenance fields', () => {
    const est = new RespirationEstimator({ source: 'reference' });
    est.infer(Object.assign(frameWith({ relativeLevelDecibelsFullScale: -70, rmsAmplitude: 0.001 }), { timestampSeconds: 0.0 }));
    est.infer(Object.assign(frameWith({ relativeLevelDecibelsFullScale: -70, rmsAmplitude: 0.001 }), { timestampSeconds: 0.2 }));
    const events = est.close(0.4);
    assert.ok(events.length >= 1);
    const e = events[0];
    assert.equal(e.sourceStream, 'reference');
    assert.ok('confidence' in e);
    assert.equal(e.evidenceClass, 'inferred');
    assert.ok(e.modelVersion);
    assert.ok(e.startSeconds != null);
  });

  it('keeps breath visuals unknown until assertive visuals are gated on', () => {
    const flags = defaultFeatureFlags();
    assert.equal(flags.respiration.assertiveVisuals, false);
    const frame = frameWith({ relativeLevelDecibelsFullScale: -12, periodicity: 0.8, rmsAmplitude: 0.2 });
    frame.inferences.respiration = { class: 'phonated_exhale', confidence: 0.7, modelVersion: 'x' };
    const visuals = composeVisualStates(frame, { flags });
    const breath = visuals.find((v) => v.visualName === 'breathLaneUser');
    assert.equal(breath.evidenceClass, 'unknown');
    const air = visuals.find((v) => v.visualName === 'airflowParticles');
    assert.equal(air.evidenceClass, 'unknown');
  });
});
