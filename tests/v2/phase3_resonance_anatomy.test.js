import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateSine } from '../../src/v2/acoustic/signal.js';
import { estimateFormants } from '../../src/v2/resonance/formants.js';
import { ResonanceAnalyzer } from '../../src/v2/resonance/analyzer.js';
import { AcousticAnalyzer } from '../../src/v2/acoustic/analyzer.js';
import { REQUIRED_STRUCTURE_IDS, OPTIONAL_STRUCTURE_IDS, ANATOMY_LAYERS } from '../../src/v2/anatomy/structures.js';
import {
  anatomyDrawPlan,
  drawAnatomyV2,
  anatomyLayout,
  airflowWaypoints,
  backgroundCurrentParticles,
  airflowParticles,
  circulationParticles,
  circulationWaypoints,
  exteriorBreathJetParticles,
  larynxHitRegion,
  nextAnatomyYaw,
  nextFigureZoom,
  pointHitsLarynx,
  pointHitsSkull,
  skullHitRegion,
  soundFieldAttenuation,
  breathPlumeScale,
  vagusAnatomyPaths,
  VAGUS_STRUCTURE_IDS,
} from '../../src/v2/anatomy/anatomyRenderer.js';
import { chamberResonanceFromFormants } from '../../src/v2/resonance/chamberResonance.js';
import { tractConfigurationFromFormants } from '../../src/v2/resonance/tractShape.js';
import {
  cavityStandingWave,
  closeupAirflowParticles,
  drawSkullCloseup,
  exteriorCloseupParticles,
  jawRotatedPoint,
  mouthEmissionParticles,
  nasalCavityWaypoints,
  nextSkullYaw,
  nextSkullZoom as nextCloseupZoom,
  oralCavityWaypoints,
  rigidCloseupProject,
  sagittalCameraForFigure,
  SAGITTAL_LOCAL,
  skullCloseupState,
  tongueArticulation,
} from '../../src/v2/anatomy/skullCloseup.js';
import { nextSkullZoom, tubeTractDimensions } from '../../src/v2/anatomy/anatomy3dRenderer.js';
import { snapshotPoseForClass } from '../../src/v2/anatomy/breathKinematics.js';
import {
  AIRFLOW_RGB,
  BONE_RGB,
  CHEST_VOICE_RGB,
  HEAD_VOICE_RGB,
  LUNG_RGB,
  MUSCLE_RGB,
  OUTLINE_RGB,
  SKULL_CHAMBER_RGB,
  TRACT_RGB,
  mixedSystemVibration,
  mixedVoiceRgb,
  registerVoiceAmounts,
} from '../../src/v2/anatomy/registerColors.js';
import {
  estimateVocalFoldState,
  glottalJetParticles,
  idleVocalFoldState,
  inferTechniqueCandidate,
  overlayTechniqueOnLive,
  registrationCoordination,
  techniqueProfileState,
  foldHudSummary,
  VOCAL_TECHNIQUE_PROFILES,
  VOCAL_TECHNIQUE_EVIDENCE,
} from '../../src/v2/anatomy/vocalFoldState.js';
import {
  contactQuotientCandidate,
  createFoldDynamics,
  edgeDisplacement,
  visualFrequencyFromPitch,
} from '../../src/v2/anatomy/vocalFoldDynamics.js';
import { resolveVisualState, createUnknownVisualState } from '../../src/v2/visualization/mirrorState.js';
import { vowelMapFromFormants, formatVowelSensationLine } from '../../src/v2/resonance/vowelMap.js';

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
    assert.equal(ANATOMY_LAYERS.circulatory, true);
    for (const id of [
      'heart', 'aorta', 'venaeCavae', 'pulmonaryArteries',
      'pulmonaryVeins', 'carotidArteries', 'jugularVeins', 'coronaryVessels',
    ]) assert.ok(OPTIONAL_STRUCTURE_IDS.includes(id), id);
    assert.ok(OPTIONAL_STRUCTURE_IDS.includes('brain'));
  });

  it('renders detailed circulation only as a time-driven simulation', () => {
    const on = anatomyDrawPlan([], { showCirculatory: true, timeMs: 400 });
    const off = anatomyDrawPlan([], { showCirculatory: false, timeMs: 400 });
    assert.equal(on.circulatory.evidenceClass, 'simulated');
    assert.ok(on.circulatory.simulatedRateBeatsPerMinute >= 68);
    assert.ok(on.circulatory.simulatedRateBeatsPerMinute <= 112);
    assert.ok(on.circulatory.particles.length > 0);
    assert.equal(off.circulatory.particles.length, 0);

    const L = anatomyLayout(400, 720);
    assert.ok(circulationWaypoints(L, 'aorta').length >= 4);
    assert.ok(circulationParticles({ timeMs: 200 }).some((p) => p.kind === 'arterial'));
    assert.ok(circulationParticles({ timeMs: 200 }).some((p) => p.kind === 'venous'));

    drawAnatomyV2(stubCanvas(), 400, 720, on);
    for (const id of ['heart', 'aorta', 'pulmonaryArteries', 'coronaryVessels']) {
      assert.ok(on.drawnStructureIds.includes(id), id);
    }
  });

  it('fills the stage and couples simulated circulation to the respiratory pose', () => {
    const L = anatomyLayout(800, 720);
    assert.equal(L.regionScale, 1.58);
    const bodyTop = L.skull.y - L.skull.ry;
    assert.ok(bodyTop >= 24 - 1e-6, 'skull vault stays inside the canvas');
    assert.ok(L.abdomen.y1 - bodyTop > 720 * 0.82);
    assert.ok(L.skull.ry > 64 * Math.min(800 / 430, 720 / 700));
    assert.ok(L.ribs.rx > 96 * Math.min(800 / 430, 720 / 700));

    const inhalePose = snapshotPoseForClass('inhale');
    const exhalePose = snapshotPoseForClass('phonated_exhale');
    const inhale = anatomyDrawPlan([], {
      timeMs: 120,
      pose: inhalePose,
      demoBreath: { className: 'inhale', pose: inhalePose },
    });
    const exhale = anatomyDrawPlan([], {
      timeMs: 120,
      pose: exhalePose,
      demoBreath: { className: 'phonated_exhale', pose: exhalePose },
    });
    assert.equal(inhale.circulatory.respiratoryPhase, 'inhale');
    assert.equal(exhale.circulatory.respiratoryPhase, 'exhale');
    assert.notEqual(inhale.circulatory.pulseScale, exhale.circulatory.pulseScale);
    assert.match(inhale.circulatory.label, /simulated cardiorespiratory coupling/);
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

  it('maps vowel sensation without treating it as chest/head register', () => {
    const open = vowelMapFromFormants([750, 1180]);
    assert.equal(open.symbol, 'a');
    assert.ok(open.chest > open.head);
    assert.equal(open.significant, true);
    assert.match(open.caveat, /filter/i);

    const front = vowelMapFromFormants([280, 2260]);
    assert.equal(front.symbol, 'i');
    assert.ok(front.head > front.chest);
    assert.match(front.detail, /not prove/i);

    const back = vowelMapFromFormants([310, 870]);
    assert.equal(back.symbol, 'u');
    assert.ok(back.mixed > back.chest);
    assert.ok(back.mixed > back.head);

    const mid = vowelMapFromFormants([500, 1420]);
    assert.equal(mid.symbol, 'ə');
    assert.equal(mid.significant, false);

    const openMidFront = vowelMapFromFormants([530, 1650]);
    assert.equal(openMidFront.symbol, 'ɛ');
    assert.equal(openMidFront.significant, true);
    assert.ok(openMidFront.mixed > openMidFront.chest);
    assert.ok(openMidFront.mixed > openMidFront.head);

    const line = formatVowelSensationLine(open);
    assert.match(line.title, /chest/);
    assert.match(line.title, /head/);
    assert.match(line.detail, /not register/i);

    const plan = anatomyDrawPlan([
      resolveVisualState({
        visualName: 'formantTrajectories',
        timestampSeconds: 1,
        value: [280, 2260, 3000],
        evidenceClass: 'derived',
        observedAtSeconds: 1,
      }),
      createUnknownVisualState('chestRegionGlow', 1),
      createUnknownVisualState('skullRimUpperProduction', 1),
    ]);
    assert.equal(plan.inferredRegistration.chestGlow, 0);
    assert.equal(plan.inferredRegistration.skullRim, 0);
    assert.equal(plan.vowelMap.symbol, 'i');
    assert.ok(plan.vowelMap.head > 0.4);
    assert.match(plan.vowelMap.caveat, /filter/i);
  });

  it('draws every required structure and maps chest/head/mixed/airflow from visual state', () => {
    const visuals = [
      resolveVisualState({
        visualName: 'chestRegionGlow',
        timestampSeconds: 1,
        value: 0.6,
        evidenceClass: 'inferred',
        observedAtSeconds: 1,
      }),
      resolveVisualState({
        visualName: 'skullRimUpperProduction',
        timestampSeconds: 1,
        value: 0.5,
        evidenceClass: 'inferred',
        observedAtSeconds: 1,
      }),
      resolveVisualState({
        visualName: 'mixedCoordinationField',
        timestampSeconds: 1,
        value: 0.4,
        evidenceClass: 'inferred',
        observedAtSeconds: 1,
      }),
      resolveVisualState({
        visualName: 'airflowParticles',
        timestampSeconds: 1,
        value: -1,
        evidenceClass: 'simulated',
        observedAtSeconds: 1,
      }),
      resolveVisualState({
        visualName: 'diaphragmMotion',
        timestampSeconds: 1,
        value: 0.4,
        evidenceClass: 'simulated',
        observedAtSeconds: 1,
      }),
    ];
    const plan = anatomyDrawPlan(visuals, { timeMs: 400 });
    assert.ok(plan.inferredRegistration.chestGlow > 0);
    assert.ok(plan.inferredRegistration.skullRim > 0);
    assert.ok(plan.inferredRegistration.mixedField > 0);
    assert.equal(plan.airflow.direction, -1);
    assert.equal(plan.airflow.evidenceClass, 'simulated');
    assert.ok(plan.airflow.particles.length > 0);

    const ctx = stubCanvas();
    drawAnatomyV2(ctx, 400, 720, plan);
    for (const id of REQUIRED_STRUCTURE_IDS) {
      assert.ok(plan.drawnStructureIds.includes(id), id);
    }
    for (const id of ['trachea', 'hyoid', 'thyroidCartilage', 'clavicles', 'abdomen', 'spine']) {
      assert.ok(plan.drawnStructureIds.includes(id), id);
    }
  });

  it('mixes chest-orange and head-blue into a third mixed-voice color', () => {
    const mix = mixedVoiceRgb(0.5, 0.5);
    assert.notDeepEqual(mix, CHEST_VOICE_RGB);
    assert.notDeepEqual(mix, HEAD_VOICE_RGB);
    assert.ok(mix.b > CHEST_VOICE_RGB.b, 'mixed is bluer than chest');
    assert.ok(mix.r > HEAD_VOICE_RGB.r, 'mixed is more orange than head');
    const mixedOnly = registerVoiceAmounts({ chestGlow: 0, skullRim: 0, mixedField: 0.8 });
    assert.equal(mixedOnly.chest, 0);
    assert.equal(mixedOnly.head, 0);
    assert.ok(mixedOnly.mixed > 0.7);
    assert.notDeepEqual(mixedOnly.mixedRgb, CHEST_VOICE_RGB);
    assert.notDeepEqual(mixedOnly.mixedRgb, HEAD_VOICE_RGB);
    const chestPlan = anatomyDrawPlan([
      resolveVisualState({
        visualName: 'chestRegionGlow',
        timestampSeconds: 1,
        value: 0.7,
        evidenceClass: 'inferred',
        observedAtSeconds: 1,
      }),
    ]);
    const ctx = stubCanvas();
    drawAnatomyV2(ctx, 400, 720, chestPlan);
    const close = skullCloseupState({
      inferences: {
        registration: {
          class: 'mixed',
          confidence: 0.6,
          probabilities: { chest_dominant: 0.42, mixed: 0.48, head_dominant: 0.38 },
        },
      },
    }, chestPlan);
    assert.ok(close.registerAmounts.chest > 0.3);
    assert.ok(close.registerAmounts.head > 0.3);
    assert.ok(close.registerAmounts.mixedRgb.r !== CHEST_VOICE_RGB.r || close.registerAmounts.mixedRgb.b !== CHEST_VOICE_RGB.b);
    drawSkullCloseup(ctx, 720, 520, close, 80);
  });

  it('keeps anatomy layer hues distinct so systems do not share a color', () => {
    assert.ok(AIRFLOW_RGB.g > AIRFLOW_RGB.r && AIRFLOW_RGB.g > AIRFLOW_RGB.b, 'airflow is mint');
    assert.ok(TRACT_RGB.b > TRACT_RGB.g && TRACT_RGB.r > 180, 'tract is magenta, the bridge between registers');
    assert.ok(TRACT_RGB.g < CHEST_VOICE_RGB.g, 'tract is not chest-orange');
    assert.ok(TRACT_RGB.r > HEAD_VOICE_RGB.r, 'tract is not head-blue');
    assert.ok(SKULL_CHAMBER_RGB.b > SKULL_CHAMBER_RGB.r + 80, 'head space is ice cyan');
    assert.ok(SKULL_CHAMBER_RGB.g > HEAD_VOICE_RGB.g, 'head space is cyanner than head register');
    assert.ok(LUNG_RGB.b > LUNG_RGB.r, 'lungs stay cool teal');
    assert.ok(BONE_RGB.r + BONE_RGB.g + BONE_RGB.b > LUNG_RGB.r + LUNG_RGB.g + LUNG_RGB.b + 150, 'ribs stay brighter than lung fill');
    assert.ok(OUTLINE_RGB.b > OUTLINE_RGB.r, 'body contour is cool silver');
    assert.ok(MUSCLE_RGB.r > MUSCLE_RGB.b, 'muscle stays in the dusty-rose family');
    assert.notDeepEqual(AIRFLOW_RGB, HEAD_VOICE_RGB);
    assert.notDeepEqual(AIRFLOW_RGB, CHEST_VOICE_RGB);
  });

  it('moves diaphragm, ribs, and lungs with simulated respiratory pose, not pitch', () => {
    const rest = anatomyLayout(400, 720, { pose: snapshotPoseForClass('unknown') });
    const inhale = anatomyLayout(400, 720, { pose: snapshotPoseForClass('inhale') });
    const exhale = anatomyLayout(400, 720, { pose: snapshotPoseForClass('phonated_exhale') });
    assert.ok(inhale.diaphragm.y > rest.diaphragm.y, 'inhale lowers the diaphragm');
    assert.ok(inhale.diaphragm.dome < rest.diaphragm.dome, 'inhale flattens the dome');
    assert.ok(inhale.ribs.rx > rest.ribs.rx, 'inhale expands the rib cage');
    assert.ok(inhale.lungs.rx > rest.lungs.rx, 'inhale inflates the lungs');
    assert.ok(inhale.lungs.ry > exhale.lungs.ry);
    assert.ok(inhale.lungs.right.apexY < inhale.ribs.pairs[0].y, 'right apex sits above the first rib');
    assert.ok(inhale.lungs.left.notchX > inhale.cx, 'left lung keeps a cardiac notch');
    assert.ok(inhale.heart.x > inhale.cx, 'heart sits left of midline');
    assert.ok(inhale.heart.y < (inhale.ribs.y0 + inhale.ribs.y1) * 0.5, 'heart sits in the upper-mid thorax');
    assert.equal(inhale.ribs.count, 12);
    assert.equal(inhale.ribs.pairs.filter((rib) => rib.kind === 'true').length, 7);
    assert.equal(inhale.ribs.pairs.filter((rib) => rib.kind === 'floating').length, 2);
  });

  it('exposes a clickable skull target', () => {
    const front = anatomyDrawPlan([]);
    const hit = skullHitRegion(400, 720, front);
    assert.equal(pointHitsSkull(hit.x, hit.y, 400, 720, front), true);
    assert.equal(pointHitsSkull(hit.x + hit.radiusX * 2, hit.y, 400, 720, front), false);
  });

  it('blinks the same air particles in currents through the black field', () => {
    const L = anatomyLayout(400, 720, { pose: snapshotPoseForClass('inhale') });
    const particles = backgroundCurrentParticles(L, {
      timeMs: 240,
      direction: -1,
      flowRate: 0.7,
    });
    assert.ok(particles.length > 20);
    assert.ok(particles.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert.ok(particles.some((p) => p.x < L.cx - L.ribs.rx));
    assert.ok(particles.some((p) => p.x > L.cx + L.ribs.rx));
    assert.ok(particles.some((p) => p.blink < 0.5));
    assert.ok(particles.some((p) => p.blink > 0.5));

    const tract = airflowParticles({ direction: -1, timeMs: 240, flowRate: 0.7 });
    assert.ok(tract.every((p) => p.blink >= 0 && p.blink <= 1));
    assert.ok(tract.length > 80);

    const holdAir = airflowParticles({ direction: 0, timeMs: 240, flowRate: 0.22 });
    assert.ok(holdAir.length > 40);
    assert.ok(holdAir.some((p) => p.inbound));
    assert.ok(holdAir.some((p) => !p.inbound));
  });

  it('exposes a precise clickable larynx target', () => {
    const plan = anatomyDrawPlan([], { pose: snapshotPoseForClass('inhale') });
    const hit = larynxHitRegion(400, 720, plan);
    assert.equal(pointHitsLarynx(hit.x, hit.y, 400, 720, plan), true);
    assert.equal(pointHitsLarynx(0, 0, 400, 720, plan), false);
  });

  it('keeps remaining 3D anatomy as thin tube-like skull, tract, and fold structures', () => {
    const dims = tubeTractDimensions();
    assert.ok(dims.skullRing < dims.foldRadius);
    assert.ok(dims.foldRadius < dims.tractRadius);
    assert.ok(dims.tractRadius < 0.08);
    assert.ok(dims.maxRadius < 0.1);
    assert.ok(dims.noseLength > 0);
  });

  it('zooms the skull close-up from the mouse wheel and rotates from drag', () => {
    assert.ok(nextSkullZoom(1, -120) > 1);
    assert.ok(nextSkullZoom(1, 120) < 1);
    assert.equal(nextSkullZoom(4.2, -800), 4.2);
    assert.equal(nextSkullZoom(0.42, 800), 0.42);
    assert.ok(nextSkullZoom(0.7, 800) < 0.7);
    assert.ok(nextCloseupZoom(1, -120) > 1);
    assert.equal(nextCloseupZoom(2.6, -800), 2.6);
    assert.equal(nextCloseupZoom(0.22, 800), 0.22);
    assert.ok(nextCloseupZoom(0.85, 800) < 0.85);
    assert.ok(nextFigureZoom(1, 120) < 1);
    assert.ok(nextFigureZoom(1, -120) > 1);
    assert.equal(nextFigureZoom(0.48, 800), 0.48);
    const tight = anatomyLayout(800, 720);
    const far = anatomyLayout(800, 720, {}, { figureZoom: 0.55 });
    const close = anatomyLayout(800, 720, {}, { figureZoom: 1.45 });
    assert.ok(far.scale < tight.scale);
    assert.ok(far.skull.y - far.skull.ry >= 24);
    assert.ok(close.neck.y1 > close.neck.y0, 'neck keeps length when zoomed in');
    assert.ok(close.shoulders.y > close.skull.y + close.skull.ry * 0.25, 'shoulders stay below the skull');
    assert.ok(close.larynx.y > close.skull.y);
    assert.ok(close.larynx.y < close.shoulders.y);
    assert.ok(close.skull.y - close.skull.ry >= 24);
    for (const zoom of [0.48, 0.88, 1, 1.35, 1.55]) {
      const L = anatomyLayout(800, 720, {}, { figureZoom: zoom });
      assert.ok(L.neck.y1 > L.neck.y0, `neck length at zoom ${zoom}`);
      assert.ok(L.shoulders.y > L.jaw.y, `jaw stays above the shoulders at zoom ${zoom}`);
      const cam = sagittalCameraForFigure(L);
      assert.ok(Math.abs((cam.cy + SAGITTAL_LOCAL.vaultY * cam.S) - (L.skull.y - L.skull.ry)) < 1.5);
      assert.ok(Math.abs((cam.cx + SAGITTAL_LOCAL.spineX * cam.S) - L.cx) < 1.5);
      assert.ok(Math.abs((cam.cy + SAGITTAL_LOCAL.baseY * cam.S) - L.neck.y0) < 1.5);
      const headW = (SAGITTAL_LOCAL.faceX - SAGITTAL_LOCAL.occiputX) * cam.S;
      assert.ok(headW < L.skull.rx * 3.2, 'side-view silhouette stays near skull size, not a giant overlay');
    }
    assert.ok(soundFieldAttenuation(0) > 0.95);
    assert.ok(soundFieldAttenuation(0.85) < soundFieldAttenuation(0.2) * 0.45);
    assert.ok(soundFieldAttenuation(1) < 0.06);
    assert.ok(breathPlumeScale(0.9) > breathPlumeScale(0.12) * 2.4, 'the jet widens as it leaves the face');
    const farJets = exteriorBreathJetParticles(tight, {
      timeMs: 240,
      direction: 1,
      flowRate: 0.8,
      mouthOpen: 0.7,
      phonated: true,
    });
    const near = farJets.filter((p) => p.t < 0.15);
    const distant = farJets.filter((p) => p.t > 0.8);
    assert.ok(near.length && distant.length);
    const nearA = near.reduce((s, p) => s + p.alpha, 0) / near.length;
    const farA = distant.reduce((s, p) => s + p.alpha, 0) / distant.length;
    assert.ok(nearA > 0.25, 'exhale is intense at the lips');
    assert.ok(farA < nearA * 0.35, 'breath diffuses into the room instead of staying full-bright');
    const inhaleJets = exteriorBreathJetParticles(tight, {
      timeMs: 240,
      direction: -1,
      flowRate: 0.8,
      mouthOpen: 0.4,
    });
    const inNear = inhaleJets.filter((p) => p.t < 0.15);
    const inFar = inhaleJets.filter((p) => p.t > 0.8);
    const inNearA = inNear.reduce((s, p) => s + p.alpha, 0) / inNear.length;
    const inFarA = inFar.reduce((s, p) => s + p.alpha, 0) / inFar.length;
    assert.ok(inNearA > inFarA * 2, 'inhale concentrates as it enters and is diffuse in the room');
    assert.ok(nextSkullYaw(0, 40) > 0);
    assert.equal(nextSkullYaw(1.15, 400), 1.15);
    assert.equal(nextSkullYaw(-1.15, -400), -1.15);

    const mid0 = rigidCloseupProject(80, 24, 0, 0);
    const midYaw = rigidCloseupProject(80, 24, 0, 0.9);
    assert.equal(mid0.x, midYaw.x);
    assert.equal(mid0.y, midYaw.y);
    const a = rigidCloseupProject(0, 0, 0, 0.7);
    const b = rigidCloseupProject(120, 40, 0, 0.7);
    assert.equal(b.x - a.x, 120);
    assert.equal(b.y - a.y, 40);
    const side0 = rigidCloseupProject(80, 24, 16, 0);
    const sideYaw = rigidCloseupProject(80, 24, 16, 0.6);
    assert.equal(side0.y, sideYaw.y);
    assert.ok(Math.abs((sideYaw.x - side0.x) - 16 * Math.sin(0.6)) < 1e-9);
  });

  it('separates skull-surface inference from vocal-tract resonance evidence', () => {
    const state = skullCloseupState({
      features: { formantsHertz: [620, 1320, 2480] },
      inferences: {
        registration: {
          class: 'head_dominant',
          confidence: 0.8,
          probabilities: { head_dominant: 0.8 },
        },
      },
    });
    assert.equal(state.headEvidenceClass, 'inferred');
    assert.equal(state.chamberEvidenceClass, 'derived');
    assert.match(state.limitation, /not proven primary vocal resonators/i);
    assert.ok(state.vowelMap.symbol);
    assert.match(state.vowelMap.caveat, /filter/i);
  });

  it('maps mixed coordination to pitch-linked architecture vibration without claiming whole-body resonance', () => {
    const quiet = mixedSystemVibration({ mixedAmount: 0.8, energy: 0, frequencyHertz: 220 });
    const mixed = mixedSystemVibration({
      mixedAmount: 0.72,
      rmsAmplitude: 0.16,
      energy: 0.7,
      frequencyHertz: 220,
      formantsHertz: [700, 1400],
    });
    assert.equal(quiet.amount, 0);
    assert.ok(mixed.amount > 0.3);
    assert.equal(mixed.frequencyHertz, 220);
    assert.ok(mixed.visualHz > 1);
    assert.equal(mixed.evidenceClass, 'inferred');
    assert.match(mixed.label, /not whole-body/i);

    const state = skullCloseupState({
      features: {
        rmsAmplitude: 0.16,
        fundamentalFrequencyHertz: 220,
        periodicity: 0.8,
        formantsHertz: [700, 1400, 2500],
      },
      inferences: {
        registration: {
          class: 'mixed',
          confidence: 0.7,
          probabilities: { mixed: 0.72, chest_dominant: 0.18, head_dominant: 0.1 },
        },
      },
    });
    assert.ok(state.mixedVibration.amount > 0.2);
    assert.equal(state.mixedVibration.evidenceClass, 'inferred');

    const plan = anatomyDrawPlan([
      resolveVisualState({
        visualName: 'mixedCoordinationField',
        timestampSeconds: 1,
        value: 0.7,
        evidenceClass: 'inferred',
        observedAtSeconds: 1,
      }),
      resolveVisualState({
        visualName: 'actualPitchLayer',
        timestampSeconds: 1,
        value: 220,
        evidenceClass: 'derived',
        observedAtSeconds: 1,
      }),
      resolveVisualState({
        visualName: 'breathLaneUser',
        timestampSeconds: 1,
        value: 'phonated_exhale',
        evidenceClass: 'inferred',
        observedAtSeconds: 1,
      }),
    ], {
      pose: snapshotPoseForClass('phonated_exhale'),
      showRegistration: true,
      showRespiratory: true,
    });
    assert.ok(plan.mixedVibration.amount > 0.15);
    assert.match(plan.mixedVibration.label, /not whole-body/i);
  });

  it('drives close-up resonance and mouth air from acoustic energy, not a beat pulse', () => {
    const silent = skullCloseupState({ features: { rmsAmplitude: 0, formantsHertz: [] } });
    const sung = skullCloseupState({
      features: {
        rmsAmplitude: 0.18,
        fundamentalFrequencyHertz: 220,
        periodicity: 0.8,
        formantsHertz: [700, 1400, 2500],
      },
    });
    assert.equal(silent.energy, 0);
    assert.ok(sung.energy > silent.energy);
    assert.ok(sung.mouthOpen > silent.mouthOpen);
    assert.ok(sung.vowelMap.chest > sung.vowelMap.head);
    assert.ok(silent.mouthOpen < 0.1);
    assert.equal(sung.flowDirection, 1);
    assert.equal(cavityStandingWave({ s: 0.5, timeMs: 120, formantHertz: 700, energy: 0 }), 0);
    const waveA = cavityStandingWave({ s: 0.5, timeMs: 0, formantHertz: 700, energy: 0.8, harmonic: 1 });
    const waveB = cavityStandingWave({ s: 0.5, timeMs: 250, formantHertz: 700, energy: 0.8, harmonic: 1 });
    assert.notEqual(waveA, waveB);

    const idleAir = mouthEmissionParticles({ rmsAmplitude: 0, flowRate: 0, flowDirection: 0 });
    const songAir = mouthEmissionParticles({
      rmsAmplitude: 0.2,
      flowRate: 0.6,
      flowDirection: 1,
      timeMs: 400,
    });
    assert.equal(idleAir.length, 0);
    assert.ok(songAir.some((p) => p.path === 'oralJet'));
    assert.ok(songAir.some((p) => p.path === 'nasalJet'));
    assert.ok(songAir.every((p) => p.t >= 0 && p.t <= 1));

    const columns = closeupAirflowParticles({
      timeMs: 800,
      flowDirection: 1,
      flowRate: 0.7,
      nasalShare: 0.4,
      energy: 0.5,
    });
    assert.ok(columns.some((p) => p.path === 'oral'));
    assert.ok(columns.filter((p) => p.path === 'nasal').length >= 30);

    const inhale = skullCloseupState(null, {
      airflow: { direction: -1, flowRate: 0.8, nasalShare: 0.72 },
      simulatedBreath: { pose: { flowDirection: -1, flowRate: 0.8, nasalShare: 0.72, mouthOpen: 0.18 } },
    });
    assert.ok(inhale.flowDirection < 0);
    assert.ok(inhale.nasalFlow > 0.2);
    assert.ok(inhale.mouthOpen > silent.mouthOpen);
    assert.ok(columns.some((p) => p.path === 'nasal'));
    const nasalInhale = closeupAirflowParticles({
      timeMs: 80,
      flowDirection: -1,
      flowRate: 0.8,
      nasalShare: 0.75,
    }).filter((p) => p.path === 'nasal');
    assert.ok(nasalInhale.some((p) => p.t < 0.2), 'inhale particles reach the larynx end of the nasal path');
    assert.ok(nasalInhale.some((p) => p.t > 0.8), 'inhale particles still enter at the naris');
  });

  it('shapes a detailed tongue from formants and draws the oral close-up', () => {
    const highFront = tongueArticulation([320, 2200], 0.18);
    const lowBack = tongueArticulation([820, 900], 0.55);
    assert.ok(highFront.height > lowBack.height);
    assert.ok(highFront.front > lowBack.front);
    const ctx = stubCanvas();
    drawSkullCloseup(ctx, 900, 640, skullCloseupState({
      features: {
        rmsAmplitude: 0.16,
        fundamentalFrequencyHertz: 196,
        periodicity: 0.82,
        formantsHertz: [700, 1400, 2500],
      },
    }), 120, { yaw: 0.45, zoom: 1.1 });

    const nasal = nasalCavityWaypoints();
    const naris = nasal[nasal.length - 1];
    const larynx = nasal[0];
    assert.ok(naris[0] > 90 && naris[1] < 12, 'path still reaches the naris');
    assert.ok(larynx[1] > 100, 'nasal inhale continues down to the larynx');
    assert.ok(nasal.some((pt) => pt[1] > 40 && pt[1] < 100), 'nasal stream descends the pharynx');
    const oral = oralCavityWaypoints(0.4);
    assert.ok(oral[oral.length - 1][1] > 12);
    assert.ok(oral.slice(4, 7).every((pt) => pt[1] <= 20), 'oral airway follows the palate, not the tongue');
    const restChin = jawRotatedPoint(96, 86, 0);
    const openChin = jawRotatedPoint(96, 86, 0.7);
    const wideChin = jawRotatedPoint(96, 86, 0.95);
    const restTmj = jawRotatedPoint(-24, 10, 0.7);
    assert.ok(openChin.y > restChin.y);
    assert.ok(wideChin.y - restChin.y > 40, 'full jaw drop rotates the chin far enough for a wide scream');
    assert.ok(Math.abs(restTmj.x + 24) < 1e-9);
    const exterior = exteriorCloseupParticles({ timeMs: 200, flowDirection: 1, flowRate: 0.6, count: 132 });
    assert.ok(exterior.length >= 100);
  });

  it('distinguishes hee, him, and haah tract shapes and does not treat vowel as head voice', () => {
    const hee = tractConfigurationFromFormants([280, 2260, 3000], { spectralCentroidHertz: 2800 });
    const him = tractConfigurationFromFormants([400, 1920, 2200], { spectralCentroidHertz: 1400 });
    const haah = tractConfigurationFromFormants([750, 1180, 2500]);
    assert.equal(hee.token, 'hee');
    assert.equal(him.token, 'him');
    assert.equal(haah.token, 'haah');
    assert.ok(hee.height > haah.height);
    assert.ok(hee.front > haah.front);
    assert.ok(hee.lipSpread > haah.lipSpread);
    assert.ok(haah.mouthOpen > hee.mouthOpen);
    assert.ok(haah.jawDrop > hee.jawDrop);
    assert.ok(haah.pharynxWide > hee.pharynxWide, '/a/ opens the throat as well as the mouth');
    assert.ok(him.velumOpen > hee.velumOpen);
    assert.ok(him.jawRetract > hee.jawRetract);
    assert.ok(him.headTuck > hee.headTuck);
    assert.equal(him.directNasal, true);
    assert.equal(haah.directNasal, false);

    const heeState = skullCloseupState({
      features: {
        rmsAmplitude: 0.16,
        fundamentalFrequencyHertz: 220,
        periodicity: 0.8,
        formantsHertz: [280, 2260, 3000],
        spectralCentroidHertz: 2800,
      },
    });
    const himState = skullCloseupState({
      features: {
        rmsAmplitude: 0.16,
        fundamentalFrequencyHertz: 220,
        periodicity: 0.8,
        formantsHertz: [400, 1920, 2200],
        spectralCentroidHertz: 1400,
      },
    });
    const haahState = skullCloseupState({
      features: {
        rmsAmplitude: 0.16,
        fundamentalFrequencyHertz: 220,
        periodicity: 0.8,
        formantsHertz: [750, 1180, 2500],
      },
    });
    assert.equal(heeState.tract.token, 'hee');
    assert.equal(himState.tract.token, 'him');
    assert.equal(haahState.tract.token, 'haah');
    assert.ok(heeState.mouthOpen < haahState.mouthOpen);
    assert.ok(himState.nasalShare > heeState.nasalShare);
    assert.ok(heeState.headLoopAmount < 0.12, 'close-front vowel is not head register');

    const headState = skullCloseupState({
      features: {
        rmsAmplitude: 0.16,
        fundamentalFrequencyHertz: 380,
        periodicity: 0.8,
        formantsHertz: [280, 2260, 3000],
        spectralCentroidHertz: 2800,
      },
      inferences: {
        registration: {
          class: 'head_dominant',
          confidence: 0.82,
          probabilities: { head_dominant: 0.82 },
        },
      },
    });
    assert.ok(headState.headLoopAmount > 0.6);
    assert.ok(headState.supraglotticNarrowing < 0.2);
    assert.match(headState.limitation, /fold \(source\)/i);
    assert.match(headState.surfaceLabel, /sensation/i);

    const zoomedOutHead = skullCloseupState(null, {
      inferredRegistration: { skullRim: 0.8, chestGlow: 0.1, mixedField: 0.05 },
    });
    assert.ok(zoomedOutHead.headLoopAmount > 0.6, 'zoom-in uses the same head-register amount as zoom-out');

    const quietChambers = chamberResonanceFromFormants([], { phonated: false });
    const sungChambers = chamberResonanceFromFormants([700, 1400, 2500], { phonated: true, flowRate: 0.6 });
    assert.equal(quietChambers.energy, 0);
    assert.equal(quietChambers.lungs, 0);
    assert.ok(sungChambers.oral > 0.08);
    assert.ok(sungChambers.pharynx > 0.08);
    assert.equal(sungChambers.brain, 0);
    assert.ok(nextAnatomyYaw(0, 40) > 0);
    const L = anatomyLayout(400, 720, { pose: snapshotPoseForClass('phonated_exhale') });
    const jets = exteriorBreathJetParticles(L, {
      timeMs: 200,
      direction: 1,
      flowRate: 0.7,
      yawRadians: 0.62,
      mouthOpen: 0.4,
    });
    assert.ok(jets.some((p) => p.path === 'oralJet'));
  });

  it('separates detailed vagal pathways from phrenic diaphragm motor supply', () => {
    const plan = anatomyDrawPlan([], {
      showVagus: true,
      vagusFocus: true,
      pose: snapshotPoseForClass('inhale'),
      timeMs: 900,
    });
    assert.equal(plan.vagus.active, true);
    assert.equal(plan.vagus.focus, true);
    assert.equal(plan.vagus.evidenceClass, 'simulated');
    assert.match(plan.vagus.caveat, /diaphragm motor drive is phrenic/i);

    const pathways = vagusAnatomyPaths(400, 720, plan.simulatedBreath);
    const branchIds = pathways.branches.map((branch) => branch.id);
    for (const id of [
      'leftVagusTrunk',
      'rightVagusTrunk',
      'leftSuperiorLaryngeal',
      'leftRecurrentLaryngeal',
      'cardiacVagalBranch',
      'pulmonaryVagalPlexus',
      'esophagealVagalPlexus',
      'leftPhrenic',
      'rightPhrenic',
    ]) {
      assert.ok(branchIds.includes(id), id);
    }
    assert.ok(pathways.branches.filter((branch) => branch.system === 'phrenic').length === 2);
    assert.ok(pathways.branches.every((branch) => branch.evidenceClass === 'simulated'));

    drawAnatomyV2(stubCanvas(), 400, 720, plan);
    for (const id of VAGUS_STRUCTURE_IDS) {
      assert.ok(plan.drawnStructureIds.includes(id), id);
    }
    assert.ok(plan.drawnStructureIds.includes('brain'));
    assert.ok(plan.drawnStructureIds.includes('heart'));
    assert.ok(plan.drawnStructureIds.includes('spine'));
    assert.equal(plan.breathResonance.active, false);
    assert.equal(plan.breathResonance.energy, 0);
    const inhale = anatomyDrawPlan([], { showRespiratory: true, pose: snapshotPoseForClass('inhale') });
    const rest = anatomyDrawPlan([], { showRespiratory: true, pose: snapshotPoseForClass('pause') });
    assert.equal(inhale.breathResonance.energy, 0);
    assert.equal(rest.breathResonance.energy, 0);
    assert.ok(anatomyLayout(400, 720, plan.simulatedBreath).brain.ry > 0);
    assert.ok(anatomyLayout(400, 720, plan.simulatedBreath).spine.y0 < anatomyLayout(400, 720).skull.y + 40);
  });

  it('keeps vocal-fold opening and technique candidates uncertainty-aware', () => {
    const idle = idleVocalFoldState(snapshotPoseForClass('inhale'));
    assert.match(idle.posture, /open/);
    assert.equal(idle.openingPercent, 88);
    assert.equal(idle.postureEvidenceClass, 'simulated');

    const consistent = estimateVocalFoldState({
      features: {
        fundamentalFrequencyHertz: 220,
        pitchConfidence: 0.9,
        periodicity: 0.86,
      },
      inferences: {
        respiration: { class: 'phonated_exhale' },
      },
    }, snapshotPoseForClass('phonated_exhale'));
    assert.equal(consistent.openingPercent, 14);
    assert.match(consistent.posture, /14% open/);
    assert.equal(consistent.vibration, 'consistent candidate');
    assert.equal(consistent.vibrationEvidenceClass, 'derived');
    assert.equal(consistent.technique, 'clean periodic candidate');
    assert.ok(consistent.modeledTension > 0.3);
    assert.ok(consistent.modeledTension < 0.7);
    assert.equal(consistent.frequencyHertz, 220);

    const tense = estimateVocalFoldState({
      features: {
        fundamentalFrequencyHertz: 220,
        pitchConfidence: 0.9,
        periodicity: 0.86,
      },
      inferences: {
        respiration: { class: 'phonated_exhale' },
        tensionEvidence: { global: 0.82, regions: { throat: 0.88 } },
      },
    }, snapshotPoseForClass('phonated_exhale'));
    assert.ok(tense.modeledTension > consistent.modeledTension);

    const gritOverlay = overlayTechniqueOnLive(consistent, 'grit', 200);
    assert.ok(gritOverlay.falseFoldActivity > consistent.falseFoldActivity);
    assert.equal(gritOverlay.frequencyHertz, 220);
    assert.match(gritOverlay.technique, /grit/i);

    const whisperOverlay = overlayTechniqueOnLive(consistent, 'whisper', 200);
    assert.match(whisperOverlay.vibration, /unphonated/i);
    assert.equal(whisperOverlay.frequencyHertz, null);
    assert.ok(whisperOverlay.drive <= 0.08);

    const hud = foldHudSummary(consistent, createFoldDynamics(consistent, 200));
    assert.match(hud.openingLabel, /mean aperture/);
    assert.match(hud.openingDetail, /not laryngoscopy/i);
    assert.match(hud.evidenceLabel, /derived/);
    assert.match(hud.evidenceDetail, /simulated teaching geometry/i);
    assert.equal(hud.openingMarkerPercent, consistent.openingPercent);
  });

  it('applies live scream/grit fold posture instead of a leftover manual model', () => {
    const screamGuess = inferTechniqueCandidate({
      rmsAmplitude: 0.16,
      periodicity: 0.12,
      relativeLevelDecibelsFullScale: -18,
      spectralCentroidHertz: 2800,
    }, false);
    assert.equal(screamGuess.id, 'scream');

    const scream = estimateVocalFoldState({
      features: {
        rmsAmplitude: 0.16,
        periodicity: 0.12,
        relativeLevelDecibelsFullScale: -18,
        spectralCentroidHertz: 2800,
      },
    });
    assert.equal(scream.techniqueId, 'scream');
    assert.ok(scream.falseFoldActivity > VOCAL_TECHNIQUE_PROFILES.clean.falseFoldActivity);
    assert.ok(scream.supraglotticNarrowing > 0.5);
    assert.notEqual(scream.modeledTension, null);

    const drums = skullCloseupState({
      features: {
        rmsAmplitude: 0.28,
        periodicity: 0.04,
        fundamentalFrequencyHertz: 0,
        formantsHertz: [],
        pitchConfidence: 0.04,
      },
    });
    const sungMouth = skullCloseupState({
      features: {
        rmsAmplitude: 0.18,
        fundamentalFrequencyHertz: 220,
        periodicity: 0.8,
        formantsHertz: [700, 1400, 2500],
      },
    });
    assert.ok(drums.mouthOpen < 0.12);
    assert.ok(sungMouth.mouthOpen > drums.mouthOpen);

    const voicedScream = inferTechniqueCandidate({
      rmsAmplitude: 0.14,
      periodicity: 0.42,
      relativeLevelDecibelsFullScale: -16,
      spectralCentroidHertz: 2500,
      fundamentalFrequencyHertz: 220,
    }, true);
    assert.equal(voicedScream.id, 'scream');

    const screamMouth = skullCloseupState({
      features: {
        rmsAmplitude: 0.18,
        periodicity: 0.2,
        relativeLevelDecibelsFullScale: -16,
        spectralCentroidHertz: 2600,
        formantsHertz: [280, 2260, 3000],
      },
    });
    const heeMouth = skullCloseupState({
      features: {
        rmsAmplitude: 0.18,
        fundamentalFrequencyHertz: 220,
        periodicity: 0.82,
        formantsHertz: [280, 2260, 3000],
        spectralCentroidHertz: 2800,
      },
    });
    assert.ok(screamMouth.mouthOpen > 0.65);
    assert.ok(screamMouth.mouthOpen > heeMouth.mouthOpen);
    assert.equal(screamMouth.chamberEvidenceClass, 'derived');
    const screamNoF = skullCloseupState({
      features: {
        rmsAmplitude: 0.18,
        periodicity: 0.2,
        relativeLevelDecibelsFullScale: -16,
        spectralCentroidHertz: 2600,
        formantsHertz: [],
      },
    });
    assert.ok(screamNoF.mouthOpen > 0.65);
    assert.equal(screamNoF.chamberEvidenceClass, 'inferred');
  });

  it('draws a much wider oral aperture for open vowels and screams than rest or hee', () => {
    const rest = anatomyLayout(760, 900, { pose: { mouthOpen: 0.08, jawDrop: 0.08 } });
    const hee = anatomyLayout(760, 900, { pose: { mouthOpen: 0.22, jawDrop: 0.18 } });
    const scream = anatomyLayout(760, 900, { pose: { mouthOpen: 0.92, jawDrop: 0.85 } });
    assert.ok(scream.mouth.ry > rest.mouth.ry * 6, 'body mouth can open several times rest height');
    assert.ok(scream.mouth.ry > hee.mouth.ry * 2.5, 'scream mouth is much taller than hee');
    assert.ok(scream.oral.ry > rest.oral.ry * 3);
    const haah = tractConfigurationFromFormants([750, 1180, 2500]);
    assert.ok(haah.mouthOpen > 0.75, 'open /a/ uses most of the visual aperture range');
  });

  it('provides simulated opening and tension ranges for common technique models', () => {
    for (const id of ['clean', 'chest_dominant', 'mixed', 'head_dominant', 'breathy', 'fry', 'grit', 'false_fold_distortion', 'growl', 'scream', 'pressed', 'whisper', 'falsetto', 'belt', 'twang', 'whistle']) {
      assert.ok(VOCAL_TECHNIQUE_PROFILES[id], id);
      const state = techniqueProfileState(id, 500);
      assert.equal(state.techniqueEvidenceClass, 'simulated');
      assert.ok(state.openingPercent >= 0 && state.openingPercent <= 100);
      assert.ok(state.tensionPercent >= 0 && state.tensionPercent <= 100);
      assert.ok(state.techniqueDetail.length > 0);
    }
    const grit = techniqueProfileState('grit', 500);
    assert.ok(grit.falseFoldActivity > VOCAL_TECHNIQUE_PROFILES.clean.falseFoldActivity);
    assert.match(grit.vibration, /irregular/);
  });

  it('marks technique percentages uncalibrated and reports evidence strength', () => {
    for (const id of Object.keys(VOCAL_TECHNIQUE_PROFILES)) {
      assert.equal(VOCAL_TECHNIQUE_EVIDENCE[id].numericCalibration, 'none', id);
      const state = techniqueProfileState(id, 100);
      assert.ok(state.evidenceStrength, id);
      assert.ok(state.evidenceSummary.length > 30, id);
    }
  });

  it('models register as continuous thickness and contact coordination, not shut-to-open states', () => {
    const chest = techniqueProfileState('chest_dominant', 500);
    const mixed = techniqueProfileState('mixed', 500);
    const head = techniqueProfileState('head_dominant', 500);
    assert.ok(chest.edgeThickness > mixed.edgeThickness);
    assert.ok(mixed.edgeThickness > head.edgeThickness);
    assert.ok(chest.medialCompression > mixed.medialCompression);
    assert.ok(mixed.medialCompression > head.medialCompression);
    assert.ok(createFoldDynamics(chest, 500).contactQuotient > createFoldDynamics(head, 500).contactQuotient);
    assert.ok(techniqueProfileState('clean', 500).irregularity < techniqueProfileState('grit', 500).irregularity);

    const transition = registrationCoordination({
      class: 'transition',
      probabilities: { chest_dominant: 0.48, mixed: 0.42, head_dominant: 0.1 },
      transition: { from: 'chest_dominant', to: 'mixed' },
    });
    assert.ok(transition.opening > 0);
    assert.ok(transition.medialCompression > 0);
    assert.match(transition.note, /not a closed-to-open valve/i);
  });

  it('maps real pitch to a bounded, pitch-linked slow-motion cycle', () => {
    assert.ok(visualFrequencyFromPitch(80) < visualFrequencyFromPitch(440));
    assert.ok(visualFrequencyFromPitch(440) < visualFrequencyFromPitch(1000));
    assert.ok(Math.abs(visualFrequencyFromPitch(240) - 5) < 0.05);
    const dynamics = createFoldDynamics(techniqueProfileState('clean', 500), 500);
    assert.equal(dynamics.actualFrequencyHertz, 180);
    assert.ok(dynamics.visualFrequencyHertz >= 1.6 && dynamics.visualFrequencyHertz <= 14);
    assert.ok(dynamics.slowMotionRatio > 1);
  });

  it('models medial contact and body-cover phase without string-like endpoint motion', () => {
    const pressed = contactQuotientCandidate({
      opening: 0.02,
      drive: 0.8,
      medialCompression: 0.92,
      tension: 0.7,
    });
    const breathy = contactQuotientCandidate({
      opening: 0.42,
      drive: 0.45,
      medialCompression: 0.18,
      tension: 0.4,
      breathiness: 0.85,
    });
    assert.ok(pressed > breathy);

    const dynamics = createFoldDynamics(techniqueProfileState('grit', 300), 300);
    assert.equal(edgeDisplacement(dynamics, { t: 0, side: -1, layer: 'superior' }), 0);
    assert.ok(Math.abs(edgeDisplacement(dynamics, { t: 1, side: 1, layer: 'inferior' })) < 1e-12);
    assert.notEqual(
      edgeDisplacement(dynamics, { t: 0.5, side: 1, layer: 'inferior' }),
      edgeDisplacement(dynamics, { t: 0.5, side: 1, layer: 'superior' }),
    );
    assert.ok(dynamics.verticalPhaseDelayDegrees > 0);
  });

  it('streams glottal-jet particles through the fold slit when air is moving', () => {
    const moving = glottalJetParticles({
      timeMs: 400,
      flowRate: 0.8,
      flowDirection: 1,
      phonated: true,
      opening: 0.22,
      superiorGap: 0.18,
    });
    assert.ok(moving.length > 20);
    assert.ok(moving.every((p) => p.t >= 0.28 && p.t <= 0.72));
    assert.ok(moving.every((p) => p.depth >= 0 && p.depth <= 1));
    assert.ok(moving.some((p) => p.depth < 0.2));
    assert.ok(moving.some((p) => p.depth > 0.8));
    assert.ok(moving.some((p) => p.t > 0.28 && p.t < 0.72));
    assert.ok(moving.some((p) => Math.abs(p.lane) < 0.2));

    const still = glottalJetParticles({ flowRate: 0, flowDirection: 0, opening: 0.2 });
    assert.equal(still.length, 0);

    const hold = glottalJetParticles({
      timeMs: 120,
      flowRate: 0.22,
      flowDirection: 0,
      opening: 0.28,
      superiorGap: 0.26,
    });
    assert.ok(hold.length > 20);
    assert.ok(hold.some((p) => p.inbound));
    assert.ok(hold.some((p) => !p.inbound));

    const inhale = glottalJetParticles({
      timeMs: 0,
      flowRate: 0.7,
      flowDirection: -1,
      opening: 0.6,
      superiorGap: 0.55,
    });
    const exhale = glottalJetParticles({
      timeMs: 0,
      flowRate: 0.7,
      flowDirection: 1,
      opening: 0.6,
      superiorGap: 0.55,
    });
    assert.ok(Math.abs(inhale[0].depth + exhale[0].depth - 1) < 1e-9);
    assert.equal(inhale[0].t, exhale[0].t);

    const live = estimateVocalFoldState({
      features: { fundamentalFrequencyHertz: 220, pitchConfidence: 0.8, periodicity: 0.9 },
    }, { flowRate: 0.7, flowDirection: 1 });
    assert.equal(live.airflow.phonated, true);
    assert.equal(live.airflow.direction, 1);

    const demo = techniqueProfileState('clean', 200);
    assert.ok(demo.airflow.flowRate > 0.4);
    assert.equal(demo.airflow.direction, 1);
  });

  it('lets each layer checkbox zero its visual plan fields', () => {
    const t = 1;
    const visual = (visualName, value, evidenceClass) => resolveVisualState({
      visualName,
      timestampSeconds: t,
      value,
      evidenceClass,
      observedAtSeconds: t,
    });
    const busy = [
      visual('actualPitchLayer', 220, 'derived'),
      visual('formantTrajectories', [700, 1200, 2500], 'derived'),
      visual('airflowParticles', 1, 'simulated'),
      visual('diaphragmMotion', 0.55, 'simulated'),
      visual('ribMotion', 0.5, 'simulated'),
      visual('skullRimUpperProduction', 0.82, 'inferred'),
      visual('chestRegionGlow', 0.74, 'inferred'),
      visual('mixedCoordinationField', 0.4, 'inferred'),
      visual('jawTensionGlow', 0.6, 'inferred'),
      visual('throatTensionGlow', 0.7, 'inferred'),
      visual('torsoTensionGlow', 0.5, 'inferred'),
      visual('auraCoherence', 0.8, 'derived'),
      visual('auraEnergy', 0.7, 'inferred'),
      visual('supportEvidence', 0.62, 'inferred'),
      visual('breathLaneUser', 'phonated_exhale', 'inferred'),
      visual('breathLaneReference', 'phonated_exhale', 'inferred'),
    ];
    const pose = snapshotPoseForClass('phonated_exhale');
    const on = anatomyDrawPlan(busy, { pose, showLanes: true, showSupport: true });
    assert.equal(on.actualPitch.frequencyHertz, 220);
    assert.ok(on.breathResonance.energy > 0);
    assert.ok(on.airflow.particles.length > 0);
    assert.equal(on.airflow.evidenceClass, 'simulated');
    assert.equal(on.circulatory.active, true);
    assert.ok(on.inferredRegistration.skullRim > 0);
    assert.ok(on.inferredRegistration.chestGlow > 0);
    assert.ok(on.tension.throat > 0);
    assert.ok(on.aura.energy > 0);
    assert.ok(on.support.value > 0);
    assert.equal(on.lanes.user, 'phonated_exhale');

    const offPitch = anatomyDrawPlan(busy, { pose, showPitch: false });
    assert.equal(offPitch.actualPitch.frequencyHertz, null);

    const offRes = anatomyDrawPlan(busy, { pose, showResonance: false });
    assert.equal(offRes.breathResonance.energy, 0);
    assert.deepEqual(offRes.resonance.formantsHertz, []);

    const offBreath = anatomyDrawPlan(busy, { pose, showRespiratory: false });
    assert.equal(offBreath.airflow.flowRate, 0);
    assert.equal(offBreath.airflow.particles.length, 0);
    assert.equal(offBreath.airflow.evidenceClass, 'unknown');
    assert.equal(offBreath.simulatedBreath.pose.flowRate, 0);

    const offCirc = anatomyDrawPlan(busy, { pose, showCirculatory: false });
    assert.equal(offCirc.circulatory.active, false);

    const offReg = anatomyDrawPlan(busy, { pose, showRegistration: false });
    assert.equal(offReg.inferredRegistration.active, false);
    assert.equal(offReg.inferredRegistration.skullRim, 0);
    assert.equal(offReg.inferredRegistration.chestGlow, 0);
    assert.equal(offReg.inferredRegistration.mixedField, 0);

    const offTen = anatomyDrawPlan(busy, { pose, showTension: false });
    assert.equal(offTen.tension.jaw + offTen.tension.throat + offTen.tension.torso, 0);

    const offAura = anatomyDrawPlan(busy, { pose, showAura: false });
    assert.equal(offAura.aura.energy, 0);
    assert.equal(offAura.aura.coherence, 0);

    const offSupport = anatomyDrawPlan(busy, { pose, showSupport: false });
    assert.equal(offSupport.support.value, 0);
    assert.equal(offSupport.support.evidenceClass, 'unknown');

    const offLanes = anatomyDrawPlan(busy, { pose, showLanes: false });
    assert.equal(offLanes.lanes, null);

    const frame = {
      features: {
        fundamentalFrequencyHertz: 330,
        periodicity: 0.9,
        rmsAmplitude: 0.2,
        formantsHertz: [700, 1400, 2500],
      },
      inferences: {
        registration: {
          class: 'head_dominant',
          confidence: 0.9,
          probabilities: { chest_dominant: 0.05, mixed: 0.1, head_dominant: 0.85 },
        },
      },
    };
    const gatedSkull = skullCloseupState(frame, offReg);
    assert.equal(gatedSkull.headAmount, 0);
    assert.equal(gatedSkull.chestAmount, 0);
    const gatedChambers = skullCloseupState(frame, offRes);
    assert.equal(gatedChambers.formantsHertz.length, 0);
    const gatedAir = skullCloseupState(frame, offBreath);
    assert.equal(gatedAir.flowRate, 0);
  });

  it('keeps interior↔exterior air when the pose has flow even without a breath-direction visual', () => {
    const pose = snapshotPoseForClass('phonated_exhale');
    const plan = anatomyDrawPlan([], { pose, showRespiratory: true, viewYawRadians: 0.62 });
    assert.ok(plan.airflow.flowRate > 0.2);
    assert.equal(plan.airflow.evidenceClass, 'simulated');
    assert.ok(plan.airflow.particles.length > 40);
    const L = anatomyLayout(800, 720, plan.simulatedBreath);
    const jets = exteriorBreathJetParticles(L, {
      timeMs: 200,
      direction: plan.airflow.direction,
      flowRate: plan.airflow.flowRate,
      yawRadians: 0.62,
      mouthOpen: pose.mouthOpen,
      phonated: true,
    });
    assert.ok(jets.some((p) => p.path === 'oralJet' && p.t > 0.55), 'exhale particles leave the mouth into the room');
    const inhalePose = snapshotPoseForClass('inhale');
    const inhalePlan = anatomyDrawPlan([], { pose: inhalePose, showRespiratory: true, viewYawRadians: 0.62 });
    const inhaleJets = exteriorBreathJetParticles(L, {
      timeMs: 180,
      direction: inhalePlan.airflow.direction,
      flowRate: inhalePlan.airflow.flowRate,
      yawRadians: 0.62,
      mouthOpen: inhalePose.mouthOpen,
    });
    assert.ok(inhaleJets.some((p) => p.inbound && p.t > 0.55), 'inhale particles start in the room and enter the face');
    const oral = airflowWaypoints(L, 'oral');
    assert.ok(oral[0].x - L.mouth.x > L.S(80), 'oral path begins in the environment, not inside the lips');
    assert.ok(
      oral.some((p) => p.x > L.cx + L.S(36) && p.y < L.larynx.y),
      'oral airflow follows the anterior tract instead of the cervical spine',
    );
  });
});

function stubCanvas() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    ellipse: noop,
    arc: noop,
    bezierCurveTo: noop,
    fill: noop,
    stroke: noop,
    closePath: noop,
    fillRect: noop,
    clearRect: noop,
    clip: noop,
    rect: noop,
    fillText: noop,
    strokeText: noop,
    setLineDash: noop,
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
  };
}
