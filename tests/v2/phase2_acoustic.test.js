import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateSine, centsError, freqToNote, formatPitchDisplay, A4_HZ } from '../../src/v2/acoustic/signal.js';
import { estimatePitch, estimatePitchYin, estimatePitchMpm } from '../../src/v2/acoustic/pitch.js';
import { relativeLevel, dbFullScale, rmsAmplitude, LEVEL_UNIT, levelTrajectory } from '../../src/v2/acoustic/level.js';
import { spectralFeatures } from '../../src/v2/acoustic/spectral.js';
import { AcousticAnalyzer } from '../../src/v2/acoustic/analyzer.js';
import { comparePitchToReference, PitchAccuracyTracker } from '../../src/v2/acoustic/pitchAccuracy.js';
import { validateVocalFrame } from '../../src/v2/contracts/schemas.js';
import { pianoTone, metronomeTimes, frequencyToColor, pianoKeyLayout, computerKeyToMidi, tapTempoBpm, metronomeSchedule, midiNoteName } from '../../src/v2/audio/piano.js';
import { BeatPulseDetector, neonParameters } from '../../src/v2/visualization/neonVisualizer.js';

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

  it('compares singer pitch with a reliable reference and tracks in-tune frames', () => {
    const frame = (frequencyHertz, timestampSeconds, harmonicity = 0.8) => ({
      timestampSeconds,
      features: {
        fundamentalFrequencyHertz: frequencyHertz,
        pitchConfidence: 0.9,
        harmonicity,
      },
    });
    const exact = comparePitchToReference(frame(440, 0), frame(440, 0));
    assert.equal(exact.available, true);
    assert.equal(exact.inTune, true);
    assert.equal(exact.evidenceClass, 'derived');

    const octave = comparePitchToReference(frame(880, 0.02), frame(440, 0.02));
    assert.equal(octave.inTune, true);
    assert.equal(octave.octaveDifference, 1);

    const off = comparePitchToReference(frame(466.16, 0.04), frame(440, 0.04));
    assert.equal(off.classification, 'off_pitch');
    assert.match(off.display, /sharp/);

    const tracker = new PitchAccuracyTracker();
    tracker.add(exact);
    tracker.add(exact);
    const summary = tracker.add(off);
    assert.equal(summary.sampleCount, 2, 'does not count the same analysis tick twice');
    assert.equal(summary.inTunePercent, 50);
  });

  it('withholds pitch scoring when a reference target is unreliable', () => {
    const result = comparePitchToReference({
      timestampSeconds: 0,
      features: { fundamentalFrequencyHertz: 440, pitchConfidence: 0.9, harmonicity: 0.8 },
    }, {
      timestampSeconds: 0,
      features: { fundamentalFrequencyHertz: 440, pitchConfidence: 0.9, harmonicity: 0.1 },
    });
    assert.equal(result.available, false);
    assert.match(result.reason, /polyphonic/i);
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

  it('builds a playable keyboard layout and computer-key map', () => {
    const keys = pianoKeyLayout({ startMidi: 48, whiteKeys: 15 });
    assert.equal(keys.filter((k) => k.color === 'white').length, 15);
    assert.equal(keys[0].midi, 48);
    assert.equal(midiNoteName(48), 'C3');
    assert.equal(midiNoteName(60), 'C4');
    assert.ok(keys.some((k) => k.color === 'black' && k.midi === 49));
    assert.equal(computerKeyToMidi('KeyZ', 48), 48);
    assert.equal(computerKeyToMidi('KeyQ', 48), 60);
    assert.equal(computerKeyToMidi('Digit2', 48), 61);
    assert.equal(computerKeyToMidi('Escape', 48), null);
  });

  it('schedules metronome accents and tap tempo deterministically', () => {
    const sched = metronomeSchedule({
      bpm: 120,
      fromTime: 0,
      untilTime: 2,
      beatIndex: 0,
      beatsPerMeasure: 4,
    });
    assert.equal(sched.events.length, 4);
    assert.equal(sched.events[0].accent, true);
    assert.equal(sched.events[1].accent, false);
    assert.equal(sched.events[0].time, 0);
    assert.equal(sched.events[1].time, 0.5);
    assert.equal(tapTempoBpm([0, 500, 1000, 1500]), 120);
    assert.equal(tapTempoBpm([0]), null);
  });
});

describe('Audio-reactive neon mode', () => {
  it('detects bounded energy onsets without retriggering inside the refractory window', () => {
    const detector = new BeatPulseDetector();
    assert.equal(detector.update(0.01, 0).onset, false);
    const beat = detector.update(0.25, 220);
    assert.equal(beat.onset, true);
    assert.equal(beat.pulse, 1);
    assert.equal(detector.update(0.25, 260).onset, false);
  });

  it('maps acoustic features to bounded neon parameters', () => {
    const params = neonParameters({
      fundamentalFrequencyHertz: 440,
      spectralCentroidHertz: 1800,
      rmsAmplitude: 0.12,
      periodicity: 0.86,
    }, 0.7, 500);
    assert.ok(params.hue >= 0 && params.hue < 360);
    assert.ok(params.energy >= 0 && params.energy <= 1);
    assert.equal(params.periodicity, 0.86);
    assert.equal(params.pulse, 0.7);
  });
});
