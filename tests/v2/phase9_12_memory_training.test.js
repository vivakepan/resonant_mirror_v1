import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PersonalMemory } from '../../src/v2/memory/personalMemory.js';
import { SupportEstimator, phraseEndDegradation } from '../../src/v2/support/estimator.js';
import { segmentPhrases, phraseRepresentation, trajectorySimilarity } from '../../src/v2/phrase/model.js';
import { canStartPersonalTraining, evaluateCandidate, activateCheckpoint, rollback, appendExperimentLog, TRAINING_POLICY } from '../../src/v2/training/gates.js';
import { createVocalFrame, emptyFeatures } from '../../src/v2/contracts/schemas.js';

const V = 'vocal-encoder-0';
const e1 = Array.from({ length: 4 }, (_, i) => (i === 0 ? 1 : 0));
const e2 = Array.from({ length: 4 }, (_, i) => (i === 0 ? 0.95 : 0.05));
const e3 = Array.from({ length: 4 }, (_, i) => (i === 3 ? 1 : 0));

describe('Phase 9 — personal memory', () => {
  it('updates a prototype without changing weights and enforces embedding versions', () => {
    const mem = new PersonalMemory({ embeddingVersion: V });
    assert.equal(mem.weightsFrozen, true);
    const a = mem.storeExample({ embedding: e1, embeddingVersion: V, sessionId: 's1', labels: ['comfortable'] });
    const proto = mem.createPrototype({ name: 'comfortable head voice', exampleIds: [a.exampleId] });
    mem.storeExample({ exampleId: 'b', embedding: e2, embeddingVersion: V, sessionId: 's1' });
    mem.addExampleToPrototype(proto.prototypeId, 'b');
    assert.equal(mem.prototypes.get(proto.prototypeId).exampleIds.length, 2);
    mem.renamePrototype(proto.prototypeId, 'easy head');
    assert.equal(mem.prototypes.get(proto.prototypeId).name, 'easy head');
    assert.throws(() => mem.storeExample({ embedding: e1, embeddingVersion: 'other', sessionId: 's1' }), /mismatch/);
    mem.deletePrototype(proto.prototypeId);
    assert.equal(mem.prototypes.has(proto.prototypeId), false);
  });
});

describe('Phase 10 — support-related evidence', () => {
  it('cites prior examples and never claims diaphragm certainty', () => {
    const mem = new PersonalMemory({ embeddingVersion: V });
    mem.storeExample({ embedding: e1, embeddingVersion: V, sessionId: 's1', labels: ['running out of breath'] });
    const est = new SupportEstimator();
    const frame = createVocalFrame({ timestampSeconds: 1, source: 'user', features: emptyFeatures(), provenanceByField: {} });
    const state = est.infer(frame, { memory: mem, embedding: e1, embeddingVersion: V });
    assert.equal(state.evidenceClass, 'personal_inference');
    assert.equal(state.diaphragmClaim, false);
    assert.match(state.wording, /support-related/);
    assert.ok(state.citedExamples[0].exampleId);
    const deg = phraseEndDegradation([-10, -10, -12, -18, -24], [0.8, 0.8, 0.7, 0.4, 0.2]);
    assert.ok(deg.degradation > 0);
  });
});

describe('Phase 11 — phrase trajectories', () => {
  it('distinguishes similar peaks with different paths', () => {
    const a = phraseRepresentation([e1, e2], [-40, -38, -10, -39, -40]);
    const b = phraseRepresentation([e1, e2], [-10, -10, -10, -10, -11]);
    const sim = trajectorySimilarity(a.trajectory, b.trajectory);
    assert.equal(sim.similarPeakDifferentPath, true);
    const frames = [];
    for (let i = 0; i < 30; i++) {
      frames.push(createVocalFrame({
        timestampSeconds: i * 0.05,
        source: 'user',
        features: {
          ...emptyFeatures(),
          relativeLevelDecibelsFullScale: i > 5 && i < 22 ? -20 : -60,
          periodicity: i > 5 && i < 22 ? 0.6 : 0.05,
        },
        provenanceByField: {},
      }));
    }
    const phrases = segmentPhrases(frames);
    assert.ok(phrases.length >= 1);
  });
});

describe('Phase 12 — personal training gates', () => {
  it('blocks live-session weight updates and requires evaluation', () => {
    assert.equal(TRAINING_POLICY.liveSessionWeightUpdates, false);
    const blocked = canStartPersonalTraining({ inLiveSession: true, optIn: true, validatedExampleCount: 100 });
    assert.equal(blocked.allowed, false);
    const ok = canStartPersonalTraining({ inLiveSession: false, optIn: true, validatedExampleCount: 40 });
    assert.equal(ok.allowed, true);
    const store = { active: { id: 'v0' } };
    const rejected = evaluateCandidate({ metrics: { heldOutAccuracy: 0.4 }, baseline: { heldOutAccuracy: 0.7 } });
    activateCheckpoint(store, { id: 'v1' }, rejected);
    assert.equal(store.active.id, 'v0');
    const passed = evaluateCandidate({ metrics: { heldOutAccuracy: 0.8, shortcutLoudness: 0.2 }, baseline: { heldOutAccuracy: 0.7, shortcutLoudness: 0.4 } });
    activateCheckpoint(store, { id: 'v1' }, passed);
    assert.equal(store.active.id, 'v1');
    rollback(store);
    assert.equal(store.active.id, 'v0');
    const log = [];
    appendExperimentLog(log, { checkpoint: 'v1', includedSessions: ['s1'] });
    appendExperimentLog(log, { checkpoint: 'v2', includedSessions: ['s1', 's2'] });
    assert.equal(log.length, 2);
    assert.equal(log[0].checkpoint, 'v1');
  });
});
