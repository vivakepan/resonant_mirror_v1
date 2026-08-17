import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BreathKinematics, defaultBreathDemo, VoiceSyncedBreath, voiceActivity } from '../../src/v2/anatomy/breathKinematics.js';
import { RespirationEstimator, TemporalSmoother, simulatedAirflow, RESPIRATION_CLASSES, classifyRespirationFrame } from '../../src/v2/respiration/estimator.js';
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

  it('shows simulated airflow from inferred respiratory state without claiming measurement', () => {
    const flags = defaultFeatureFlags();
    assert.equal(flags.respiration.assertiveVisuals, false);
    assert.equal(flags.respiration.simulatedAnatomy, true);
    const frame = frameWith({ relativeLevelDecibelsFullScale: -12, periodicity: 0.8, rmsAmplitude: 0.2 });
    frame.inferences.respiration = { class: 'phonated_exhale', confidence: 0.7, modelVersion: 'x' };
    const visuals = composeVisualStates(frame, { flags });
    const breath = visuals.find((v) => v.visualName === 'breathLaneUser');
    assert.equal(breath.evidenceClass, 'inferred');
    assert.equal(breath.value, 'phonated_exhale');
    const air = visuals.find((v) => v.visualName === 'airflowParticles');
    assert.equal(air.evidenceClass, 'simulated');
    assert.equal(air.value, 1);
    const diaphragm = visuals.find((v) => v.visualName === 'diaphragmMotion');
    assert.equal(diaphragm.evidenceClass, 'simulated');
  });

  it('animates a continuous simulated breath cycle without claiming measurement', () => {
    const k = new BreathKinematics();
    let t = 0;
    for (let i = 0; i < 40; i++) {
      t += 16;
      k.step('inhale', t);
    }
    const filled = k.pose.lungVolume;
    assert.ok(filled > 0.7);
    assert.ok(k.pose.diaphragmDescent > 0.6);
    assert.ok(k.pose.ribExpansion > 0.6);
    assert.ok(k.pose.flowDirection < 0);
    for (let i = 0; i < 80; i++) {
      t += 16;
      k.step('phonated_exhale', t);
    }
    assert.ok(k.pose.lungVolume < filled, 'phonated exhale empties the lungs slowly');
    assert.ok(k.pose.flowDirection > 0);
    assert.ok(k.pose.glottisOpen < 0.3);
    assert.equal(k.pose.lungVolume === filled, false);
  });

  it('provides a rhythmic simulated idle breath without inventing microphone evidence', () => {
    const start = defaultBreathDemo(0);
    const inhaling = defaultBreathDemo(3000);
    const fullPause = defaultBreathDemo(4500);
    const exhaling = defaultBreathDemo(8000);
    const lowPause = defaultBreathDemo(11500);
    assert.equal(start.evidenceClass, 'simulated');
    assert.equal(inhaling.className, 'inhale');
    assert.equal(fullPause.className, 'pause');
    assert.equal(exhaling.className, 'unphonated_exhale');
    assert.equal(lowPause.className, 'pause');
    assert.ok(fullPause.pose.flowRate > 0.1, 'hold keeps a tidal air exchange');
    assert.ok(lowPause.pose.flowRate > 0.1);
    assert.ok(inhaling.pose.lungVolume > start.pose.lungVolume);
    assert.ok(exhaling.pose.flowDirection > 0);
    assert.match(start.label, /demo.*simulated/);
    const beforeHold = defaultBreathDemo(3999).pose.glottisOpen;
    const holdStart = defaultBreathDemo(4000).pose.glottisOpen;
    const beforeExhale = defaultBreathDemo(4999).pose.glottisOpen;
    const exhaleStart = defaultBreathDemo(5000).pose.glottisOpen;
    assert.ok(Math.abs(beforeHold - holdStart) < 0.01, 'opening is continuous into the pause');
    assert.ok(Math.abs(beforeExhale - exhaleStart) < 0.01, 'opening is continuous into exhale');
  });

  it('opens the mouth and exhales with the vocalist envelope, then inhales in the gap', () => {
    const sync = new VoiceSyncedBreath();
    let sung;
    for (let t = 0; t <= 400; t += 16) {
      sung = sync.step({
        rmsAmplitude: 0.22,
        periodicity: 0.82,
        fundamentalFrequencyHertz: 220,
        formantsHertz: [750, 1400, 2500],
      }, t);
    }
    assert.ok(sung.mouthOpen > 0.35);
    assert.ok(sung.jawDrop > 0.25);
    assert.equal(sync.className, 'phonated_exhale');
    assert.ok(sung.flowDirection > 0.5);

    const closeFront = new VoiceSyncedBreath();
    let hee;
    for (let t = 0; t <= 400; t += 16) {
      hee = closeFront.step({
        rmsAmplitude: 0.22,
        periodicity: 0.82,
        fundamentalFrequencyHertz: 220,
        formantsHertz: [280, 2260, 3000],
        spectralCentroidHertz: 2800,
      }, t);
    }
    assert.ok(hee.mouthOpen < sung.mouthOpen, 'hee stays closer than haah');
    assert.ok(hee.jawDrop < sung.jawDrop);

    const quiet = new VoiceSyncedBreath();
    quiet.pose.lungVolume = 0.3;
    let rest;
    for (let t = 0; t <= 400; t += 16) {
      rest = quiet.step({
        rmsAmplitude: 0.001,
        periodicity: 0.05,
        fundamentalFrequencyHertz: 0,
        formantsHertz: [],
      }, t);
    }
    assert.ok(rest.mouthOpen < sung.mouthOpen);
    assert.ok(rest.mouthOpen < 0.25);

    const afterPhrase = new VoiceSyncedBreath();
    afterPhrase.pose.lungVolume = 0.25;
    afterPhrase.envelope = 0;
    const classes = [];
    let inhale;
    for (let t = 0; t <= 800; t += 16) {
      inhale = afterPhrase.step({ rmsAmplitude: 0, periodicity: 0 }, t);
      classes.push(afterPhrase.className);
    }
    assert.ok(classes.includes('inhale'));
    assert.ok(inhale.lungVolume > 0.25);

    const held = new VoiceSyncedBreath();
    held.pose.lungVolume = 0.55;
    held.envelope = 0;
    const holdClasses = [];
    let holdPose;
    for (let t = 0; t <= 360; t += 16) {
      holdPose = held.step({ rmsAmplitude: 0, periodicity: 0 }, t, { respirationClass: 'pause' });
      holdClasses.push(held.className);
    }
    assert.ok(holdClasses.every((name) => name === 'pause'));
    assert.ok(holdPose.flowRate > 0.1);
    assert.ok(Math.abs(holdPose.flowDirection) < 0.5);
  });

  it('does not open the mouth for drum-like mix energy without a vocalist', () => {
    const drums = new VoiceSyncedBreath();
    let pose;
    for (let t = 0; t <= 400; t += 16) {
      pose = drums.step({
        rmsAmplitude: 0.3,
        periodicity: 0.05,
        fundamentalFrequencyHertz: 0,
        formantsHertz: [],
        pitchConfidence: 0.04,
      }, t);
    }
    assert.ok(pose.mouthOpen < 0.2);
    assert.ok(pose.jawDrop < 0.22);
    assert.notEqual(drums.className, 'phonated_exhale');
  });

  it('does not treat a pitched instrument as a vocalist breath, and inhales on quiet rising breath noise', () => {
    const piano = voiceActivity({
      rmsAmplitude: 0.18,
      periodicity: 0.9,
      fundamentalFrequencyHertz: 440,
      pitchConfidence: 0.88,
      harmonicity: 0.82,
      formantsHertz: [],
    });
    assert.equal(piano.pitchedInstrument, true);
    assert.equal(piano.sung, false);
    assert.equal(classifyRespirationFrame({
      rmsAmplitude: 0.18,
      periodicity: 0.9,
      fundamentalFrequencyHertz: 440,
      pitchConfidence: 0.88,
      harmonicity: 0.82,
      formantsHertz: [],
      relativeLevelDecibelsFullScale: -16,
    }).class, 'pause');

    const sung = voiceActivity({
      rmsAmplitude: 0.16,
      periodicity: 0.8,
      fundamentalFrequencyHertz: 220,
      pitchConfidence: 0.7,
      formantsHertz: [700, 1400, 2500],
    });
    assert.equal(sung.sung, true);
    assert.equal(sung.pitchedInstrument, false);

    const inst = new VoiceSyncedBreath();
    let pose;
    for (let t = 0; t <= 400; t += 16) {
      pose = inst.step({
        rmsAmplitude: 0.18,
        periodicity: 0.9,
        fundamentalFrequencyHertz: 440,
        pitchConfidence: 0.88,
        harmonicity: 0.82,
        formantsHertz: [],
      }, t);
    }
    assert.equal(inst.className, 'pause');
    assert.ok(pose.mouthOpen < 0.18);

    const quiet = new VoiceSyncedBreath();
    quiet.pose.lungVolume = 0.4;
    let last;
    for (let t = 0; t <= 240; t += 16) {
      const rms = 0.002 + t * 0.00008;
      last = quiet.step({
        rmsAmplitude: rms,
        periodicity: 0.08,
        fundamentalFrequencyHertz: 0,
        formantsHertz: [],
        spectralCentroidHertz: 1200,
      }, t);
    }
    assert.equal(quiet.className, 'inhale');
    assert.ok(last.flowDirection < 0);

    const rising = classifyRespirationFrame({
      rmsAmplitude: 0.01,
      periodicity: 0.1,
      relativeLevelDecibelsFullScale: -38,
      spectralCentroidHertz: 1100,
      formantsHertz: [],
    }, { dRms: 0.004 });
    assert.equal(rising.class, 'inhale');
  });

  it('opens the mouth wide for a held scream and does not confuse that with hee', () => {
    const scream = new VoiceSyncedBreath();
    let pose;
    for (let t = 0; t <= 400; t += 16) {
      pose = scream.step({
        rmsAmplitude: 0.2,
        periodicity: 0.22,
        relativeLevelDecibelsFullScale: -14,
        spectralCentroidHertz: 2700,
        formantsHertz: [],
      }, t);
    }
    assert.ok(pose.mouthOpen > 0.65, 'scream opens the jaw from loud bright noise, not a vowel preset');
    assert.ok(pose.jawDrop > 0.55);
    const open = pose.mouthOpen;
    for (let t = 416; t <= 720; t += 16) {
      pose = scream.step({
        rmsAmplitude: 0.11,
        periodicity: 0.28,
        relativeLevelDecibelsFullScale: -18,
        spectralCentroidHertz: 2400,
        formantsHertz: [],
      }, t);
    }
    assert.ok(pose.mouthOpen > 0.55, 'held scream keeps the mouth open through level dips');
    assert.ok(pose.mouthOpen > open * 0.72);

    const hee = new VoiceSyncedBreath();
    let close;
    for (let t = 0; t <= 400; t += 16) {
      close = hee.step({
        rmsAmplitude: 0.2,
        periodicity: 0.84,
        fundamentalFrequencyHertz: 220,
        formantsHertz: [280, 2260, 3000],
        spectralCentroidHertz: 2800,
      }, t);
    }
    assert.ok(close.mouthOpen < pose.mouthOpen, 'loud hee stays closer than a scream');
    assert.ok(close.mouthOpen < 0.32);
  });
});
