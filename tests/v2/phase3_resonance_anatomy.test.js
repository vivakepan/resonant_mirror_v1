import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateSine } from '../../src/v2/acoustic/signal.js';
import { estimateFormants } from '../../src/v2/resonance/formants.js';
import { ResonanceAnalyzer } from '../../src/v2/resonance/analyzer.js';
import { AcousticAnalyzer } from '../../src/v2/acoustic/analyzer.js';
import { REQUIRED_STRUCTURE_IDS, ANATOMY_LAYERS } from '../../src/v2/anatomy/structures.js';
import { anatomyDrawPlan } from '../../src/v2/anatomy/anatomyRenderer.js';
import { resolveVisualState, createUnknownVisualState } from '../../src/v2/visualization/mirrorState.js';

const SR = 48000;

function vowelLike({ f0 = 120, f1 = 700, f2 = 1200, f3 = 2500, seconds = 0.12 } = {}) {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  const nHarms = Math.floor(4500 / f0);
  for (let h = 1; h <= nHarms; h++) {
    const f = h * f0;
    const a =
      Math.exp(-0.5 * ((f - f1) / 90) ** 2)
      + Math.exp(-0.5 * ((f - f2) / 120) ** 2)
      + Math.exp(-0.5 * ((f - f3) / 160) ** 2);
    const w = 2 * Math.PI * f / SR;
    for (let i = 0; i < n; i++) out[i] += a * Math.sin(w * i);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak * 1.2;
  return out;
}

describe('Phase 3 — formants', () => {
  it('returns confidence and can be unknown at high fundamentals', () => {
    const voiced = estimateFormants(vowelLike(), SR, { f0: 120 });
    assert.equal(voiced.formantConfidence.length, voiced.formantsHertz.length);
    if (!voiced.unknown) {
      assert.ok(voiced.formantConfidence.some((c) => c > 0));
    }

    const high = estimateFormants(vowelLike({ f0: 500 }), SR, { f0: 500 });
    assert.equal(high.unknown, true);
    assert.ok(high.qualityFlags.includes('unreliable_formant_estimate'));
    assert.deepEqual(high.formantsHertz, [null, null, null]);
  });

  it('keeps pitch and resonance as distinct fields on the frame', () => {
    const samples = vowelLike();
    const acoustic = new AcousticAnalyzer();
    const { frame } = acoustic.analyze(samples, { timestampSeconds: 0, source: 'user', sampleRate: SR });
    new ResonanceAnalyzer().analyzeFrame(frame, samples, SR);
    assert.ok('fundamentalFrequencyHertz' in frame.features);
    assert.ok('formantsHertz' in frame.features);
    assert.ok(frame.provenanceByField['features.formantsHertz']);
  });
});

describe('Phase 3 — anatomy contracts', () => {
  it('includes the required anatomical structures', () => {
    for (const id of [
      'skull', 'jaw', 'oralCavity', 'nasalCavity', 'pharyngealRegion',
      'laryngealRegion', 'neck', 'ribCage', 'lungs', 'diaphragm',
      'sternum', 'xiphoidProcess', 'upperTorso',
    ]) {
      assert.ok(REQUIRED_STRUCTURE_IDS.includes(id), id);
    }
    assert.equal(ANATOMY_LAYERS.transparentAnatomy, true);
    assert.equal(ANATOMY_LAYERS.actualPitch, true);
  });

  it('marks diaphragm/rib motion simulated and will not light regions from pitch alone', () => {
    const pitchOnly = [
      resolveVisualState({
        visualName: 'actualPitchLayer',
        timestampSeconds: 1,
        value: 90,
        evidenceClass: 'derived',
        observedAtSeconds: 1,
      }),
      createUnknownVisualState('chestRegionGlow', 1),
      createUnknownVisualState('skullRimUpperProduction', 1),
      createUnknownVisualState('diaphragmMotion', 1),
    ];
    const plan = anatomyDrawPlan(pitchOnly);
    assert.equal(plan.inferredRegistration.chestGlow, 0);
    assert.equal(plan.inferredRegistration.skullRim, 0);
    assert.equal(plan.simulatedBreath.evidenceClass, 'simulated');
    assert.equal(plan.actualPitch.evidenceClass, 'derived');

    const withSim = anatomyDrawPlan([
      resolveVisualState({
        visualName: 'diaphragmMotion',
        timestampSeconds: 1,
        value: 0.4,
        evidenceClass: 'simulated',
        observedAtSeconds: 1,
      }),
    ]);
    assert.equal(withSim.simulatedBreath.evidenceClass, 'simulated');
    assert.ok(withSim.simulatedBreath.label.includes('simulated'));
  });
});
