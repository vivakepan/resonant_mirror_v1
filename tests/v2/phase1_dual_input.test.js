import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DualPipeline, assertIndependentBuffers, assertNotMixedBeforeAnalysis } from '../../src/v2/audio/dualPipeline.js';
import { leakageAssessment, crudeLeakageCorrelation, HEADPHONE_GUIDANCE } from '../../src/v2/audio/leakage.js';
import { latencyMetadata, captureSettingsRecord } from '../../src/v2/audio/captureSettings.js';
import { SharedClock } from '../../src/v2/contracts/clock.js';

function bufferOf(n, fill = 0.1) {
  return Float32Array.from({ length: n }, () => fill);
}

describe('Phase 1 — dual input independence', () => {
  it('tags microphone and reference packets as distinct sources', () => {
    const pipe = new DualPipeline({ clock: new SharedClock({ originSeconds: 0 }) });
    const user = pipe.ingestUser(bufferOf(64, 0.2), 0.00, 48000);
    const reference = pipe.ingestReference(bufferOf(64, 0.9), 0.02, 48000);
    const paired = pipe.pair(user, reference);
    assert.equal(paired.user.source, 'user');
    assert.equal(paired.reference.source, 'reference');
    assert.notEqual(paired.user.samples, paired.reference.samples);
    assert.doesNotThrow(() => assertNotMixedBeforeAnalysis(paired.user, paired.reference));
  });

  it('rejects shared ArrayBuffer mixing before analysis', () => {
    const shared = new Float32Array(32);
    assert.throws(() => assertIndependentBuffers(shared, shared));
  });

  it('aligns user and reference events within one timeline tick', () => {
    const pipe = new DualPipeline({ clock: new SharedClock({ originSeconds: 0, tickSeconds: 0.02 }) });
    const user = pipe.ingestUser(bufferOf(16), 0.021, 48000);
    const reference = pipe.ingestReference(bufferOf(16, 0.3), 0.019, 48000);
    const paired = pipe.pair(user, reference);
    assert.equal(paired.alignment.withinOneTick, true);
  });

  it('records latency metadata and capture-setting provenance', () => {
    const latency = latencyMetadata({ sampleRate: 48000, analysisHopSeconds: 0.02 });
    assert.ok(latency.qualityFlags.includes('latency_uncertainty'));
    const known = latencyMetadata({
      sampleRate: 48000,
      baseLatencySeconds: 0.005,
      outputLatencySeconds: 0.02,
    });
    assert.deepEqual(known.qualityFlags, []);
    const capture = captureSettingsRecord();
    assert.equal(capture.assumedScientificallyOptimal, false);
    assert.equal(capture.echoCancellation, false);
  });
});

describe('Phase 1 — leakage handling', () => {
  it('warns for simultaneous playback and mic without claiming a detector', () => {
    const result = leakageAssessment({ referencePlaying: true, microphoneActive: true });
    assert.equal(result.automaticDetectionClaimed, false);
    assert.equal(result.microphoneFeaturesAreCleanSingerOnly, false);
    assert.ok(result.qualityFlags.includes('headphones_recommended'));
    assert.equal(result.warning, HEADPHONE_GUIDANCE);
  });

  it('flags reference leakage as a confidence warning, not clean-vocal evidence', () => {
    const result = leakageAssessment({
      referencePlaying: true,
      microphoneActive: true,
      estimatedLeakage: 0.8,
    });
    assert.ok(result.qualityFlags.includes('reference_leakage'));
    assert.equal(result.disableHighLevelComparisons, true);
    assert.equal(result.automaticDetectionClaimed, false);
  });

  it('treats crude correlation as an unvalidated research quantity', () => {
    const a = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const b = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const corr = crudeLeakageCorrelation(a, b);
    assert.ok(corr > 0.99);
  });
});
