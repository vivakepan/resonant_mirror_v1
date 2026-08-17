import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateSine, centsError, freqToNote, formatPitchDisplay, A4_HZ } from '../../src/v2/acoustic/signal.js';
import { estimatePitch, estimatePitchYin, estimatePitchMpm } from '../../src/v2/acoustic/pitch.js';
import { relativeLevel, dbFullScale, rmsAmplitude, LEVEL_UNIT, levelTrajectory } from '../../src/v2/acoustic/level.js';
import { spectralFeatures } from '../../src/v2/acoustic/spectral.js';
import { AcousticAnalyzer } from '../../src/v2/acoustic/analyzer.js';
import { validateVocalFrame } from '../../src/v2/contracts/schemas.js';
import { pianoTone, metronomeTimes, frequencyToColor } from '../../src/v2/audio/piano.js';

const SR = 48000;

describe('Phase 2 — pitch', () => {
  it('recovers a 440 Hz test tone as A4 with YIN', () => {
    const tone = generateSine(A4_HZ, SR, 0.08, 0.5);
    const yin = estimatePitchYin(tone, SR);
    assert.ok(Math.abs(yin.frequencyHertz - 440) < 3, `yin=${yin.frequencyHertz}`);
    const note = freqToNote(yin.frequencyHertz);
    assert.equal(note.noteName, 'A4');
    const mpm = estimatePitchMpm(tone, SR);
    assert.ok(Math.abs(mpm.frequencyHertz - 440) < 8, `mpm=${mpm.frequencyHertz}`);
  });

  it('computes cents error with the specified formula', () => {
    const sharp = A4_HZ * 2 ** (4 / 1200);
    assert.ok(Math.abs(centsError(sharp, A4_HZ) - 4) < 1e-6);
    const display = formatPitchDisplay(438.9, 440);
    assert.match(display, /A4/);
    assert.match(display, /hertz/);
    assert.match(display, /flat/);
  });

  it('does not require a learned model', () => {
    const pitch = estimatePitch(generateSine(220, SR, 0.08), SR);
    assert.equal(pitch.algorithm, 'yin');
    assert.equal(pitch.modelVersion, undefined);
  });
});

describe('Phase 2 — level units', () => {
  it('labels uncalibrated level as dBFS, not sound-pressure level', () => {
    const sine = generateSine(440, SR, 0.02, 1);
    const level = relativeLevel(sine);
    assert.equal(level.unit, LEVEL_UNIT);
    assert.equal(level.isSoundPressureLevel, false);
    const expectedRms = Math.SQRT1_2;
    assert.ok(Math.abs(rmsAmplitude(sine) - expectedRms) < 0.02);
    assert.ok(Math.abs(dbFullScale(expectedRms) - (-3.0103)) < 0.2);
  });

  it('preserves trajectory shape beyond the mean', () => {
    const a = [-30, -20, -10, -8, -20, -40];
    const b = [-21, -21, -21, -21, -21, -21];
    const ta = levelTrajectory(a, 0.02);
    const tb = levelTrajectory(b, 0.02);
    assert.ok(Math.abs(ta.mean - tb.mean) < 3);
    assert.ok(ta.dynamicRange > tb.dynamicRange);
  });
});

describe('Phase 2 — spectral features and analyzer frames', () => {
  it('places a high-frequency tone centroid above a low-frequency tone', () => {
    const low = spectralFeatures(generateSine(150, SR, 0.05), SR);
    const high = spectralFeatures(generateSine(2000, SR, 0.05), SR);
    assert.ok(high.spectralCentroidHertz > low.spectralCentroidHertz);
    assert.ok(Number.isFinite(low.spectralRolloffHertz));
  });

  it('emits a provenance-tagged vocal frame with units', () => {
    const analyzer = new AcousticAnalyzer({ targetFrequencyHertz: 440 });
    const { frame, display } = analyzer.analyze(generateSine(440, SR, 0.08), {
      timestampSeconds: 0.2,
      source: 'user',
      sampleRate: SR,
    });
    const result = validateVocalFrame(frame);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(frame.features.levelUnit, 'dBFS');
    assert.equal(frame.features.isSoundPressureLevel, false);
    assert.equal(frame.provenanceByField['features.fundamentalFrequencyHertz'].evidenceClass, 'derived');
    assert.match(display.level, /dBFS/);
    assert.match(display.pitch, /A4/);
  });
});

describe('Phase 2 — piano, metronome, color mapping', () => {
  it('keeps piano, metronome, and frequency-to-color deterministic', () => {
    const a = pianoTone(440, SR, 0.05, 0.4);
    const b = pianoTone(440, SR, 0.05, 0.4);
    assert.deepEqual([...a], [...b]);
    assert.deepEqual(metronomeTimes(120, 2), [0, 0.5, 1, 1.5]);
    assert.equal(frequencyToColor(440), frequencyToColor(440));
    assert.notEqual(frequencyToColor(100), frequencyToColor(800));
  });
});
