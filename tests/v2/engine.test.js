import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObservationEngine } from '../../src/v2/session/engine.js';
import { generateSine } from '../../src/v2/acoustic/signal.js';
import { TRAINING_POLICY } from '../../src/v2/training/gates.js';

describe('Observation engine', () => {
  it('analyzes a user window without touching model weights', () => {
    const engine = new ObservationEngine();
    const samples = generateSine(440, 48000, 0.08);
    const result = engine.processPacket({
      source: 'user',
      samples,
      timestampSeconds: 0.2,
      sampleRate: 48000,
    });
    assert.equal(result.frame.source, 'user');
    assert.equal(result.frame.features.levelUnit, 'dBFS');
    assert.ok(result.visuals.length > 0);
    assert.equal(TRAINING_POLICY.liveSessionWeightUpdates, false);
  });
});
