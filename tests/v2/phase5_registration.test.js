import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RegistrationEstimator, REGISTRATION_CLASSES } from '../../src/v2/registration/estimator.js';
import { createVocalFrame, emptyFeatures } from '../../src/v2/contracts/schemas.js';
import { composeVisualStates } from '../../src/v2/visualization/composeVisuals.js';
import { defaultFeatureFlags } from '../../src/v2/contracts/featureFlags.js';

function frame(features, t = 0) {
  return createVocalFrame({
    timestampSeconds: t,
    source: 'user',
    features: { ...emptyFeatures(), ...features },
    provenanceByField: {},
  });
}

describe('Phase 5 — registration', () => {
  it('allows unknown and remains probabilistic', () => {
    assert.ok(REGISTRATION_CLASSES.includes('unknown'));
    const est = new RegistrationEstimator();
    const unknown = est.infer(frame({ fundamentalFrequencyHertz: null, pitchConfidence: 0 }));
    assert.equal(unknown.class, 'unknown');
    const chest = est.infer(frame({
      fundamentalFrequencyHertz: 140,
      pitchConfidence: 0.8,
      spectralCentroidHertz: 900,
      spectralTilt: -1.5,
    }, 0.2));
    assert.ok(['chest_dominant', 'mixed', 'transition', 'unknown'].includes(chest.class));
    assert.ok(chest.confidence <= 0.7);
    assert.match(chest.notes, /not a correct-register/i);
  });

  it('does not light skull or chest from pitch without a registration inference', () => {
    const f = frame({ fundamentalFrequencyHertz: 90, pitchConfidence: 0.9 });
    const visuals = composeVisualStates(f, { flags: defaultFeatureFlags() });
    assert.equal(visuals.find((v) => v.visualName === 'chestRegionGlow').evidenceClass, 'unknown');
    assert.equal(visuals.find((v) => v.visualName === 'skullRimUpperProduction').evidenceClass, 'unknown');
  });

  it('does not treat vowel formants as chest or head register evidence', () => {
    const f = frame({
      fundamentalFrequencyHertz: 220,
      pitchConfidence: 0.8,
      formantsHertz: [280, 2260, 3000],
      formantConfidence: [0.8, 0.8, 0.6],
    });
    const visuals = composeVisualStates(f, { flags: defaultFeatureFlags() });
    assert.equal(visuals.find((v) => v.visualName === 'chestRegionGlow').evidenceClass, 'unknown');
    assert.equal(visuals.find((v) => v.visualName === 'skullRimUpperProduction').evidenceClass, 'unknown');
    const formants = visuals.find((v) => v.visualName === 'formantTrajectories');
    assert.equal(formants.evidenceClass, 'derived');
  });

  it('maps mixed/chest/head from registration probabilities, not from pitch alone', () => {
    const f = frame({
      fundamentalFrequencyHertz: 140,
      pitchConfidence: 0.8,
      spectralCentroidHertz: 900,
      spectralTilt: -1.5,
    });
    f.inferences.registration = {
      class: 'chest_dominant',
      confidence: 0.55,
      probabilities: { chest_dominant: 0.62, mixed: 0.22, head_dominant: 0.1, transition: 0.05, unknown: 0.01 },
      modelVersion: 'registration-heuristic-0',
    };
    const visuals = composeVisualStates(f, { flags: defaultFeatureFlags() });
    assert.equal(visuals.find((v) => v.visualName === 'chestRegionGlow').evidenceClass, 'inferred');
    assert.ok(visuals.find((v) => v.visualName === 'chestRegionGlow').value > 0.18);
    const mixed = visuals.find((v) => v.visualName === 'mixedCoordinationField');
    assert.equal(mixed.evidenceClass, 'inferred');
  });
});
