import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RegistrationEstimator,
  REGISTRATION_CLASSES,
  REGISTRATION_MODEL_VERSION,
  classifyRegistration,
  registerGlowFromInference,
} from '../../src/v2/registration/estimator.js';
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
    assert.equal(REGISTRATION_MODEL_VERSION, 'registration-heuristic-2');
    const est = new RegistrationEstimator();
    const unknown = est.infer(frame({ fundamentalFrequencyHertz: null, pitchConfidence: 0 }));
    assert.equal(unknown.class, 'unknown');
    const chest = est.infer(frame({
      fundamentalFrequencyHertz: 140,
      pitchConfidence: 0.8,
      spectralCentroidHertz: 900,
      spectralTilt: -1.5,
      periodicity: 0.8,
    }, 0.2));
    assert.ok(['chest_dominant', 'mixed', 'transition', 'unknown'].includes(chest.class));
    assert.ok(chest.confidence <= 0.7);
    assert.match(chest.notes, /not a correct-register/i);
  });

  it('does not light skull or chest from pitch alone (prohibited shortcut)', () => {
    const f = frame({ fundamentalFrequencyHertz: 90, pitchConfidence: 0.9 });
    const visuals = composeVisualStates(f, { flags: defaultFeatureFlags() });
    assert.equal(visuals.find((v) => v.visualName === 'chestRegionGlow').evidenceClass, 'unknown');
    assert.equal(visuals.find((v) => v.visualName === 'skullRimUpperProduction').evidenceClass, 'unknown');

    const lowOnly = classifyRegistration({
      fundamentalFrequencyHertz: 120,
      pitchConfidence: 0.95,
    });
    assert.equal(lowOnly.class, 'unknown', 'low F0 alone must not invent chest');

    const highOnly = classifyRegistration({
      fundamentalFrequencyHertz: 480,
      pitchConfidence: 0.95,
    });
    assert.equal(highOnly.class, 'unknown', 'high F0 alone must not invent head');

    const pitchOnlyFrame = frame({
      fundamentalFrequencyHertz: 120,
      pitchConfidence: 0.95,
      periodicity: 0.85,
    });
    const est = new RegistrationEstimator();
    est.infer(pitchOnlyFrame);
    assert.equal(pitchOnlyFrame.inferences.registration.class, 'unknown');
    const lit = composeVisualStates(pitchOnlyFrame, { flags: defaultFeatureFlags() });
    assert.equal(lit.find((v) => v.visualName === 'chestRegionGlow').evidenceClass, 'unknown');
    assert.equal(lit.find((v) => v.visualName === 'skullRimUpperProduction').evidenceClass, 'unknown');

    const withTimbre = classifyRegistration({
      fundamentalFrequencyHertz: 220,
      pitchConfidence: 0.9,
      spectralCentroidHertz: 780,
      spectralTilt: -1.6,
      periodicity: 0.85,
    });
    assert.ok(['chest_dominant', 'mixed', 'unknown'].includes(withTimbre.class));
    assert.ok(withTimbre.class !== 'head_dominant');

    const bright = classifyRegistration({
      fundamentalFrequencyHertz: 220,
      pitchConfidence: 0.9,
      spectralCentroidHertz: 3200,
      spectralTilt: -0.1,
      periodicity: 0.85,
    });
    assert.ok(['head_dominant', 'mixed', 'unknown'].includes(bright.class));
    assert.ok(bright.class !== 'chest_dominant');
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
    assert.equal(mixed.evidenceClass, 'unknown');
    assert.equal(visuals.find((v) => v.visualName === 'skullRimUpperProduction').evidenceClass, 'unknown');
  });

  it('emits a hummingCandidate visual from composeVisuals, not from the renderer', () => {
    const f = frame({
      fundamentalFrequencyHertz: 180,
      pitchConfidence: 0.72,
      periodicity: 0.82,
      rmsAmplitude: 0.08,
      spectralCentroidHertz: 1200,
      harmonicity: 0.7,
      formantsHertz: [280, 1100, 2400],
    });
    const visuals = composeVisualStates(f, { flags: defaultFeatureFlags() });
    const hum = visuals.find((v) => v.visualName === 'hummingCandidate');
    assert.ok(hum);
    assert.equal(hum.evidenceClass, 'inferred');
    assert.ok(hum.value > 0.42);
    assert.equal(f.inferences.humming.evidenceClass, 'inferred');
  });

  it('does not light all three registers from leftover probability mass', () => {
    const chest = registerGlowFromInference({
      class: 'chest_dominant',
      confidence: 0.62,
      probabilities: { chest_dominant: 0.62, mixed: 0.22, head_dominant: 0.16 },
    });
    assert.ok(chest.chest > 0.5);
    assert.equal(chest.mixed, 0);
    assert.equal(chest.head, 0);

    const mixed = registerGlowFromInference({
      class: 'mixed',
      confidence: 0.5,
      probabilities: { chest_dominant: 0.32, mixed: 0.4, head_dominant: 0.28 },
    });
    assert.ok(mixed.mixed > 0.35);
    assert.equal(mixed.chest, 0);
    assert.equal(mixed.head, 0);

    const hop = registerGlowFromInference({
      class: 'transition',
      confidence: 0.4,
      transition: { from: 'chest_dominant', to: 'head_dominant' },
      probabilities: { chest_dominant: 0.4, mixed: 0.2, head_dominant: 0.4 },
    });
    assert.ok(hop.chest > 0.3);
    assert.ok(hop.head > 0.3);
    assert.equal(hop.mixed, 0);
  });
});
