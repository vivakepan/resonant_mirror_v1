import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EVIDENCE_CLASSES, isEvidenceClass, userFacingAllowed } from '../../src/v2/contracts/evidence.js';
import { QUALITY_FLAGS } from '../../src/v2/contracts/qualityFlags.js';
import { OPEN_ASSUMPTIONS, listOpenAssumptions } from '../../src/v2/contracts/openAssumptions.js';
import { SharedClock, DEFAULT_TICK_SECONDS } from '../../src/v2/contracts/clock.js';
import { defaultFeatureFlags, assertNoLiveWeightUpdates } from '../../src/v2/contracts/featureFlags.js';
import {
  validateSession,
  validateVocalFrame,
  validatePhrase,
  validatePersonalPrototype,
  validateVisualState,
  createSession,
  createVocalFrame,
  emptyFeatures,
  emptyInferences,
} from '../../src/v2/contracts/schemas.js';
import {
  VISUAL_CONTRACTS,
  PROHIBITED_VISUAL_SHORTCUTS,
  listVisualContracts,
} from '../../src/v2/contracts/visualContracts.js';
import { DELETABLE_OBJECTS, DEFAULT_CONSENT } from '../../src/v2/contracts/retention.js';
import {
  resolveVisualState,
  createUnknownVisualState,
  inspectVisual,
  prohibitedShortcuts,
} from '../../src/v2/visualization/mirrorState.js';

describe('Phase 0 — evidence classes', () => {
  it('defines the eight canonical classes', () => {
    assert.deepEqual([...EVIDENCE_CLASSES].sort(), [
      'derived',
      'human_labeled',
      'inferred',
      'legacy_hypothesis',
      'measured',
      'personal_inference',
      'simulated',
      'unknown',
    ]);
  });

  it('rejects unknown class names', () => {
    assert.equal(isEvidenceClass('phenomenological'), false);
    assert.equal(isEvidenceClass('derived'), true);
  });
});

describe('Phase 0 — schemas', () => {
  it('validates a microphone session with capture settings and local-only consent', () => {
    const session = createSession({
      sessionId: 's1',
      startedAt: '2026-08-17T00:00:00.000Z',
      inputMode: 'microphone',
      captureSettings: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
      },
    });
    const result = validateSession(session);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(session.userConsent.remoteUpload, false);
    assert.equal(session.calibration.units, 'dBFS');
  });

  it('validates a vocal frame with per-field provenance', () => {
    const frame = createVocalFrame({
      timestampSeconds: 1.2,
      source: 'user',
      features: emptyFeatures(),
      inferences: emptyInferences(),
      qualityFlags: ['low_pitch_confidence'],
      provenanceByField: {
        'features.fundamentalFrequencyHertz': {
          evidenceClass: 'derived',
          sourceIds: ['mic:user'],
          algorithmVersion: 'yin-1',
          modelVersion: null,
          confidence: 0.4,
          observedAtSeconds: 1.2,
          expiresAtSeconds: 1.32,
          qualityFlags: ['low_pitch_confidence'],
        },
      },
    });
    const result = validateVocalFrame(frame);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  it('rejects a frame that mixes user and reference in source', () => {
    const frame = createVocalFrame({
      timestampSeconds: 0,
      source: 'both',
      provenanceByField: {},
    });
    assert.equal(validateVocalFrame(frame).ok, false);
  });

  it('validates phrase, prototype, and visual-state records', () => {
    assert.equal(validatePhrase({
      phraseId: 'p1',
      sessionId: 's1',
      source: 'user',
      startSeconds: 0,
      endSeconds: 2,
      frameRange: [],
      embeddingVersion: null,
      phraseEmbedding: [],
      trajectoryFeatures: {},
      humanLabels: [],
    }).ok, true);

    assert.equal(validatePersonalPrototype({
      prototypeId: 'pr1',
      name: 'comfortable head voice',
      exampleIds: [],
      embeddingVersion: 'vocal-encoder-0',
      centroid: [],
      dispersion: {},
      userConfidence: null,
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    }).ok, true);

    const visual = {
      visualStateId: 'v1',
      timestampSeconds: 1,
      visualName: 'jawTensionGlow',
      value: 0.2,
      evidenceClass: 'inferred',
      confidence: 0.4,
      sourceFieldPaths: ['inferences.tensionEvidence'],
      modelVersion: null,
      mappingVersion: 'v2-visual-map-1',
      observedAtSeconds: 1,
      expiresAtSeconds: 1.4,
      qualityFlags: [],
    };
    assert.equal(validateVisualState(visual).ok, true);
  });
});

describe('Phase 0 — shared clock', () => {
  it('uses a provisional 20 ms tick and aligns streams within one tick', () => {
    const clock = new SharedClock({ originSeconds: 0 });
    assert.equal(clock.tickSeconds, DEFAULT_TICK_SECONDS);
    const aligned = clock.align(0.021, 0.019);
    assert.equal(aligned.withinOneTick, true);
    assert.equal(clock.metadata().tickSecondsProvisional, true);
  });
});

describe('Phase 0 — feature flags and research gates', () => {
  it('keeps learned outputs gated and forbids live weight updates', () => {
    const flags = defaultFeatureFlags();
    assert.equal(flags.expressiveIntensity.status, 'disabled');
    assert.equal(flags.personalWeightTraining.liveSessionWeightUpdates, false);
    assert.equal(userFacingAllowed(flags.respiration.status), false);
    assert.equal(flags.legacyPhysicsLayer.isolated, true);
    assert.equal(flags.wholeSystemCoordination.status, 'disabled');
    assert.doesNotThrow(() => assertNoLiveWeightUpdates(flags));
  });
});

describe('Phase 0 — visual provenance and unknown behavior', () => {
  it('gives every planned dynamic visual an upstream evidence path', () => {
    for (const contract of listVisualContracts()) {
      assert.ok(contract.sourceFieldPaths.length > 0, contract.visualName);
      assert.ok(contract.unknownBehavior, contract.visualName);
      assert.ok(isEvidenceClass(contract.evidenceClass), contract.visualName);
    }
  });

  it('turns missing or stale evidence into unknown rather than persisting a guess', () => {
    const missing = resolveVisualState({
      visualName: 'jawTensionGlow',
      timestampSeconds: 1,
      value: null,
      evidenceClass: 'inferred',
      observedAtSeconds: 1,
    });
    assert.equal(missing.evidenceClass, 'unknown');
    assert.equal(missing.value, null);
    assert.equal(missing.unknownBehavior, 'fade_to_neutral');

    const stale = resolveVisualState({
      visualName: 'diaphragmMotion',
      timestampSeconds: 10,
      value: 'inhale',
      evidenceClass: 'simulated',
      observedAtSeconds: 1,
      expiresAtSeconds: 1.6,
    });
    assert.equal(stale.evidenceClass, 'unknown');
    assert.ok(stale.qualityFlags.includes('stale_evidence'));
  });

  it('does not treat the legacy whole-system badge as v2 physiology', () => {
    const contract = VISUAL_CONTRACTS.wholeSystemLegacyBadge;
    assert.equal(contract.evidenceClass, 'legacy_hypothesis');
    assert.equal(contract.isolated, true);
    const unknown = createUnknownVisualState('wholeSystemLegacyBadge', 0);
    assert.equal(unknown.unknownBehavior, 'show_as_legacy_only');
  });

  it('locks out prohibited visual shortcuts', () => {
    assert.ok(PROHIBITED_VISUAL_SHORTCUTS.includes('low_pitch_automatically_lights_chest'));
    assert.ok(prohibitedShortcuts().includes('missing_evidence_continues_last_physiological_visual'));
  });

  it('exposes a developer inspector record', () => {
    const state = resolveVisualState({
      visualName: 'actualPitchLayer',
      timestampSeconds: 0.2,
      value: 440,
      evidenceClass: 'derived',
      observedAtSeconds: 0.2,
      confidence: 0.9,
    });
    const info = inspectVisual(state);
    assert.equal(info.visualName, 'actualPitchLayer');
    assert.equal(info.evidenceClass, 'derived');
    assert.equal(info.currentValue, 440);
  });
});

describe('Phase 0 — privacy, deletion, assumptions', () => {
  it('defaults to no remote upload and lists deletable objects', () => {
    assert.equal(DEFAULT_CONSENT.remoteUpload, false);
    assert.ok(DELETABLE_OBJECTS.includes('session'));
    assert.ok(DELETABLE_OBJECTS.includes('personal_prototypes'));
  });

  it('registers all eighteen open assumptions', () => {
    assert.equal(OPEN_ASSUMPTIONS.length, 18);
    assert.equal(listOpenAssumptions().length, 18);
    assert.ok(QUALITY_FLAGS.includes('reference_leakage'));
  });
});
