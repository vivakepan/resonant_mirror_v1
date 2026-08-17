/**
 * Sagittal skull close-up: vocal-tract chambers, dual airflow, and
 * source–filter resonance. Glow and wavefronts follow RMS, pitch, and
 * formants — not a beat detector.
 */

import { frequencyToColor } from '../audio/piano.js';
import { vowelMapFromFormants } from '../resonance/vowelMap.js';
import { chamberResonanceFromFormants } from '../resonance/chamberResonance.js';
import { tractConfigurationFromFormants } from '../resonance/tractShape.js';
import { mouthArticulationFromAcoustics } from '../resonance/mouthArticulation.js';
import { inferTechniqueCandidate } from './vocalFoldState.js';
import { breathPlumeScale, soundFieldAttenuation } from './soundField.js';
import { registerGlowFromInference } from '../registration/estimator.js';
import {
  AIRFLOW_RGB,
  AIRWAY_COLUMN_RGB,
  BONE_RGB,
  CHEST_CHAMBER_RGB,
  CHEST_VOICE_RGB,
  HEAD_VOICE_RGB,
  LARYNX_RGB,
  MUSCLE_RGB,
  OUTLINE_RGB,
  SKULL_CHAMBER_RGB,
  STRUCTURE_VIBRATION_RGB,
  THROAT_CHAMBER_RGB,
  TRACT_RGB,
  mixedSystemVibration,
  registerVoiceAmounts,
  rgbaVoice,
  structureVibrationFromVoice,
} from './registerColors.js';
import { inferHumming } from '../resonance/humming.js';

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { r: 106, g: 215, b: 255 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(rgb, a) {
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

export function nextSkullZoom(current, deltaY) {
  const factor = deltaY > 0 ? 0.9 : 1.11;
  return Math.max(0.22, Math.min(2.6, current * factor));
}

export function nextSkullYaw(current, dxPixels) {
  return Math.max(-1.15, Math.min(1.15, (Number(current) || 0) + dxPixels * 0.008));
}

/** Local sagittal landmarks used to seat the shared head on the figure. */
export const SAGITTAL_LOCAL = Object.freeze({
  vaultY: -186,
  baseY: 52,
  spineX: -8,
  occiputX: -128,
  faceX: 152,
  larynxY: 162,
  orbitX: 58,
  orbitY: -46,
  /** Foramen magnum / medulla — skull-base, not the forehead. */
  brainstemX: -10,
  brainstemY: 20,
  /** C1 / craniovertebral junction — top of the neck, not mid-pharynx. */
  throatResonanceX: -8,
  throatResonanceY: 56,
  /** Head-voice register sits on the brainstem. */
  headVoiceX: -10,
  headVoiceY: 20,
});

/**
 * Camera that maps sagittal local coordinates onto the figure skull:
 * vault to the cranial vault, occiput/base onto the neck, midline onto the spine.
 */
export function sagittalCameraForFigure(layout) {
  const vaultTop = layout.skull.y - layout.skull.ry;
  const baseY = layout.neck.y0;
  const S = (baseY - vaultTop) / (SAGITTAL_LOCAL.baseY - SAGITTAL_LOCAL.vaultY);
  return {
    S,
    cx: layout.cx - SAGITTAL_LOCAL.spineX * S,
    cy: vaultTop - SAGITTAL_LOCAL.vaultY * S,
    vaultTop,
    baseY,
  };
}

/** Mid-sagittal (x, y) stays rigid; only lateral z creates parallax. */
export function rigidCloseupProject(x, y, z = 0, yaw = 0) {
  return {
    x: x + z * Math.sin(Number(yaw) || 0),
    y,
  };
}

export function rotateAround(x, y, px, py, radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const dx = x - px;
  const dy = y - py;
  return [px + dx * c - dy * s, py + dx * s + dy * c];
}

/** Mandible points rotate about the TMJ as the jaw drops. */
export function jawRotatedPoint(x, y, jawDrop = 0, tmj = { x: -24, y: 10 }) {
  const angle = clamp(jawDrop) * 1.15;
  const [jx, jy] = rotateAround(x, y, tmj.x, tmj.y, angle);
  return { x: jx, y: jy, angle };
}

/** Tongue height/frontness from F1/F2. Jaw opening lowers the dorsum. */
export function tongueArticulation(formants = [], mouthOpen = 0.12) {
  const f1 = Number(formants[0]) || 0;
  const f2 = Number(formants[1]) || 0;
  const open = clamp(mouthOpen);
  let height = 0.42;
  let front = 0.4;
  if (f1 > 180) height = clamp(1 - (f1 - 250) / 580);
  if (f2 > 400) front = clamp((f2 - 700) / 1600);
  height = clamp(height - open * 0.18);
  return { height, front, f1, f2 };
}

export function skullCloseupState(frame = null, plan = null) {
  const flags = plan?.layerFlags || {};
  const registrationOff = flags.registration === false;
  const resonanceOff = flags.resonance === false;
  const breathOff = flags.respiratory === false;
  const registration = registrationOff ? null : frame?.inferences?.registration;
  const fromInference = registration ? registerGlowFromInference(registration) : null;
  const chestAmount = clamp(registrationOff
    ? 0
    : (fromInference
      ? fromInference.chest
      : Number(plan?.inferredRegistration?.chestGlow) || 0));
  const mixedAmount = clamp(registrationOff
    ? 0
    : (fromInference
      ? fromInference.mixed
      : Number(plan?.inferredRegistration?.mixedField) || 0));
  const headAmount = clamp(registrationOff
    ? 0
    : (fromInference
      ? fromInference.head
      : Number(plan?.inferredRegistration?.skullRim) || 0));
  const formants = resonanceOff
    ? []
    : (Array.isArray(frame?.features?.formantsHertz)
      ? frame.features.formantsHertz.filter((value) => value > 0)
      : (Array.isArray(plan?.resonance?.formantsHertz)
        ? plan.resonance.formantsHertz.filter((value) => value > 0)
        : []));
  const rms = Number(frame?.features?.rmsAmplitude);
  const frequencyHertz = Number(frame?.features?.fundamentalFrequencyHertz)
    || Number(plan?.actualPitch?.frequencyHertz)
    || 0;
  const periodicity = clamp(Number(frame?.features?.periodicity) || 0);
  const rmsSafe = Number.isFinite(rms) ? clamp(rms) : 0;
  const voiced = frequencyHertz > 60 && periodicity > 0.28 && rmsSafe > 0.012;
  const technique = inferTechniqueCandidate(frame?.features || {}, voiced, frame?.inferences?.registration);
  const vocalDrive = voiced || ['scream', 'grit', 'growl'].includes(technique.id);
  const phonated = vocalDrive;
  const pose = plan?.simulatedBreath?.pose || {};
  let flowRate;
  let flowDirection;
  if (breathOff) {
    flowRate = 0;
    flowDirection = 0;
  } else {
    flowRate = Number.isFinite(plan?.airflow?.flowRate)
      ? plan.airflow.flowRate
      : (phonated ? clamp(0.35 + rmsSafe * 4) : pose.flowRate || 0);
    flowDirection = plan?.airflow?.direction;
    if (flowDirection == null) {
      flowDirection = pose.flowDirection ?? 0;
    }
    if (phonated && !(flowDirection > 0)) flowDirection = 1;
    if (phonated && !(flowRate > 0.08)) flowRate = clamp(0.28 + rmsSafe * 5);
  }
  const tract = tractConfigurationFromFormants(formants, {
    nasalShare: Number.isFinite(plan?.airflow?.nasalShare) ? plan.airflow.nasalShare : (pose.nasalShare ?? 0),
    spectralCentroidHertz: Number(frame?.features?.spectralCentroidHertz) || 0,
  });
  const nasalShare = clamp(Math.max(
    Number.isFinite(plan?.airflow?.nasalShare) ? plan.airflow.nasalShare : (pose.nasalShare ?? 0.18),
    tract.velumOpen,
    tract.directNasal ? 0.62 : 0,
  ));
  const energy = vocalDrive
    ? clamp(Math.max(rmsSafe * 5.2, phonated ? periodicity * 0.55 : 0.4))
    : 0;
  const moving = flowRate > 0.04 && (Math.abs(flowDirection) > 0.12 || !vocalDrive);
  const oralFlow = moving ? Math.max(0.12, flowRate * (1 - nasalShare * 0.5)) : 0;
  const nasalFlow = moving ? Math.max(0.12, flowRate * Math.max(0.35, nasalShare)) : 0;
  const screamOpen = ['scream', 'growl'].includes(technique.id) ? 0.22 : 0;
  const poseOpen = Number(pose.mouthOpen);
  const art = mouthArticulationFromAcoustics(frame?.features || {}, {
    sung: vocalDrive && periodicity > 0.28,
    distorted: ['scream', 'grit', 'growl'].includes(technique.id),
    techniqueId: technique.id,
  });
  const vowelMouth = art.vowelOpen > 0 ? art.vowelOpen : null;
  const livePose = Number.isFinite(poseOpen) && poseOpen > 0.02
    && (plan?.simulatedBreath?.pose != null);
  const mouthOpen = clamp(Math.max(
    livePose ? poseOpen : 0,
    art.mouthOpen,
    vocalDrive && !livePose && vowelMouth == null ? 0.14 + energy * 0.5 + screamOpen : 0,
    !vocalDrive && moving && !livePose ? 0.1 : 0,
  ) || (moving ? 0.08 : 0.04));
  const jawDrop = clamp(Math.max(
    livePose && Number.isFinite(pose.jawDrop) ? pose.jawDrop : 0,
    art.jawDrop,
    tract.evidenceClass === 'derived' ? tract.jawDrop : 0,
  ));
  const jawRetract = clamp(
    Number.isFinite(pose.jawRetract) ? pose.jawRetract : (tract.jawRetract || 0),
  );
  const headTuck = clamp(
    Number.isFinite(pose.headTuck) ? pose.headTuck : (tract.headTuck || 0),
  );
  const vowelMap = plan?.vowelMap?.symbol
    ? plan.vowelMap
    : vowelMapFromFormants(formants);
  const chambers = chamberResonanceFromFormants(formants, {
    phonated: vocalDrive,
    rmsAmplitude: rmsSafe,
    flowRate,
    nasalShare,
    spectralCentroidHertz: Number(frame?.features?.spectralCentroidHertz) || 0,
  });
  const headRegister = headAmount;
  const noisyThroat = ['scream', 'twang', 'belt', 'grit'].includes(technique.id);
  const techniqueNarrow = Number(plan?.foldTechnique?.supraglotticNarrowing)
    || (noisyThroat ? 0.62 : 0.18);
  const supraglotticNarrowing = headRegister > 0.28 && !noisyThroat
    ? clamp(0.05 + techniqueNarrow * 0.12)
    : techniqueNarrow;
  return {
    headAmount,
    chestAmount,
    mixedAmount,
    registerAmounts: registerVoiceAmounts({
      chestGlow: chestAmount || plan?.inferredRegistration?.chestGlow || 0,
      skullRim: headAmount || plan?.inferredRegistration?.skullRim || 0,
      mixedField: mixedAmount || plan?.inferredRegistration?.mixedField || 0,
    }),
    techniqueId: technique.id,
    techniqueLabel: technique.label,
    supraglotticNarrowing,
    headLoopAmount: headRegister,
    headSensationAmount: headRegister,
    headPattern: headAmount > 0.05
      ? `head-dominant candidate · ${Math.round(headAmount * 100)}%`
      : 'no head-dominant evidence',
    headEvidenceClass: headAmount > 0.05 ? 'inferred' : 'unknown',
    formantsHertz: formants,
    tract,
    chambers,
    chamberEvidenceClass: chambers.evidenceClass !== 'unknown'
      ? chambers.evidenceClass
      : (formants.length ? 'derived' : 'unknown'),
    surfaceLabel: headAmount > 0.05
      ? 'peri-aural / cranial sensation · inferred, not a resonator'
      : 'skull-surface cue inactive',
    chamberLabel: chambers.active
      ? chambers.label
      : formants.length
        ? 'vocal-tract resonances unknown at these frequencies'
        : 'vocal-tract resonances unknown',
    limitation: 'Head voice is a fold (source) mode. Ear-canal and skull glow is felt vibration, not what creates the register. Sinuses are not proven primary vocal resonators.',
    frequencyHertz: frequencyHertz > 0 ? frequencyHertz : 0,
    rmsAmplitude: rmsSafe,
    periodicity,
    phonated,
    flowDirection,
    flowRate,
    nasalShare,
    nasalFlow,
    oralFlow,
    energy,
    mouthOpen,
    jawDrop,
    jawRetract,
    headTuck,
    directNasal: Boolean(tract.directNasal),
    lipSpread: art.lipSpread ?? (tract.evidenceClass === 'derived' ? tract.lipSpread : 0.35),
    pharynxWide: tract.evidenceClass === 'derived' ? tract.pharynxWide : 0.45,
    pitchColor: frequencyHertz > 0 ? frequencyToColor(frequencyHertz) : '#9ad7ff',
    vowelMap,
    humming: art.humming || inferHumming(frame?.features || {}, { mouthOpen, nasalShare }),
    mixedVibration: mixedSystemVibration({
      mixedAmount,
      rmsAmplitude: rmsSafe,
      energy,
      frequencyHertz,
      formantsHertz: formants,
    }),
    structureVibration: structureVibrationFromVoice({
      chestAmount,
      mixedAmount,
      headAmount,
      hummingAmount: (art.humming || inferHumming(frame?.features || {}, { mouthOpen, nasalShare })).amount,
      rmsAmplitude: rmsSafe,
      energy,
      frequencyHertz,
    }),
  };
}

/** Slowed standing-wave sample along a cavity. Amplitude follows energy, not a beat. */
export function cavityStandingWave({
  s = 0,
  timeMs = 0,
  formantHertz = 0,
  energy = 0,
  harmonic = 1,
} = {}) {
  if (!(formantHertz > 0) || !(energy > 0.01)) return 0;
  const visualHz = Math.min(7.5, Math.max(0.45, formantHertz / 90));
  const spatial = Math.sin(Math.PI * harmonic * clamp(s));
  const temporal = Math.sin((timeMs / 1000) * visualHz * Math.PI * 2);
  return energy * spatial * temporal;
}

export function closeupAirflowParticles({
  timeMs = 0,
  flowDirection = 0,
  flowRate = 0,
  nasalShare = 0.2,
  phonated = false,
  energy = 0,
  frequencyHertz = 0,
} = {}) {
  const drive = Math.max(flowRate, energy * 0.85);
  if (flowDirection === 0 && energy < 0.04 && drive < 0.04) return [];
  const holding = Math.abs(flowDirection) < 0.12;
  const out = [];
  const oralN = 140;
  const nasalN = 160;
  const speedMag = 0.00052 * (0.7 + Math.max(0.35, drive));
  const visualHz = phonated && frequencyHertz > 60 ? Math.max(1.6, Math.min(14, frequencyHertz / 48)) : 0;
  const speed = speedMag * (visualHz ? 0.9 + 0.2 * (0.5 + 0.5 * Math.sin((timeMs / 1000) * visualHz * Math.PI * 2)) : 1);
  const push = (path, n, share) => {
    for (let i = 0; i < n; i++) {
      const localDir = holding ? (i % 2 === 0 ? 1 : -1) : (flowDirection === 0 ? 1 : Math.sign(flowDirection));
      const base = i / n;
      const jitter = ((i * 19) % 11) / 90;
      const phase = ((base + jitter + timeMs * speed) % 1 + 1) % 1;
      const t = localDir < 0 ? 1 - phase : phase;
      const lane = ((i % 5) - 2) * 0.32;
      out.push({
        path,
        t,
        lane,
        inbound: localDir < 0,
        alpha: soundFieldAttenuation(t) * (0.28 + 0.32 * Math.max(0.5, drive) * share),
        radius: path === 'nasal' ? 1.6 + drive * 1.4 : 1.8 + drive * 1.8,
        streak: 0.04 + drive * 0.03,
      });
    }
  };
  push('oral', oralN, 1);
  push('nasal', nasalN, Math.max(0.4, nasalShare));
  return out;
}

export function mouthEmissionParticles({
  timeMs = 0,
  flowDirection = 0,
  flowRate = 0,
  rmsAmplitude = 0,
  phonated = false,
  nasalShare = 0.18,
  frequencyHertz = 0,
} = {}) {
  const holding = Math.abs(flowDirection) <= 0.12 && flowRate > 0.08;
  const moving = Math.abs(flowDirection) > 0.12 || rmsAmplitude > 0.012 || holding;
  const drive = clamp(Math.max(flowRate, rmsAmplitude * 6.5, moving ? 0.28 : 0));
  if (!moving || !(drive > 0.05)) return [];
  const out = [];
  const oralN = 140 + Math.round(drive * 90);
  const nasalN = Math.max(80, Math.round((96 + drive * 70) * Math.max(0.45, nasalShare)));
  const visualHz = phonated && frequencyHertz > 60 ? Math.max(1.6, Math.min(14, frequencyHertz / 48)) : 0;
  const speed = 0.00058 * (0.55 + drive) * (visualHz ? 0.9 + 0.2 * (0.5 + 0.5 * Math.sin((timeMs / 1000) * visualHz * Math.PI * 2)) : 1);
  for (let i = 0; i < oralN; i++) {
    const inbound = holding ? i % 2 === 0 : flowDirection < 0;
    const phase = ((i / oralN) + timeMs * speed) % 1;
    const t = inbound ? 1 - phase : phase;
    out.push({
      path: 'oralJet',
      t,
      lane: ((i % 11) - 5) / 5,
      alpha: soundFieldAttenuation(t) * (0.55 + drive * 0.42) * (holding ? 0.8 : 1),
      radius: 2.4 + drive * 2.6,
      phonated,
      inbound,
    });
  }
  for (let i = 0; i < nasalN; i++) {
    const inbound = holding ? i % 2 === 1 : flowDirection < 0;
    const phase = ((i / Math.max(1, nasalN)) + timeMs * speed * 0.92 + 0.17) % 1;
    const t = inbound ? 1 - phase : phase;
    out.push({
      path: 'nasalJet',
      t,
      lane: ((i % 9) - 4) / 4,
      alpha: soundFieldAttenuation(t) * (0.48 + drive * 0.38) * (holding ? 0.8 : 1),
      radius: 2.2 + drive * 2.0,
      phonated: false,
      inbound,
    });
  }
  return out;
}

export function exteriorCloseupParticles({
  timeMs = 0,
  flowDirection = 0,
  flowRate = 0.35,
  count = 420,
} = {}) {
  const holding = Math.abs(flowDirection) < 0.12;
  const drive = Math.max(0.22, flowRate);
  const speedMag = 0.00026 * (0.5 + drive) * (holding ? 0.55 : 1);
  const streams = [
    (t) => ({ x: -18 + Math.cos(t * Math.PI * 1.7 + 0.4) * 168, y: -36 + Math.sin(t * Math.PI * 1.7 + 0.4) * 188 }),
    (t) => ({ x: -70 + Math.cos(t * Math.PI * 1.4) * 58, y: -20 + Math.sin(t * Math.PI * 1.4) * 118 }),
    (t) => ({ x: 108 + t * 128, y: -18 + Math.sin(t * Math.PI * 5) * 28 - t * 12 }),
    (t) => ({ x: 118 + t * 122, y: 28 + Math.sin(t * Math.PI * 4 + 0.6) * 22 + t * 10 }),
    (t) => ({ x: 96 + t * 110, y: 8 + Math.sin(t * 9) * 18 }),
    (t) => ({ x: -86 + Math.sin(t * 7) * 28, y: 30 + t * 140 }),
    (t) => ({ x: 40 + t * 150, y: -90 + Math.sin(t * Math.PI * 3) * 36 }),
    (t) => ({ x: -40 + Math.sin(t * 4.2) * 90, y: -140 + t * 80 }),
    (t) => ({ x: 20 + Math.cos(t * Math.PI * 2) * 150, y: 40 + Math.sin(t * Math.PI * 2) * 70 }),
    (t) => ({ x: 160 + Math.sin(t * 6) * 24, y: -40 + t * 90 }),
  ];
  const per = Math.max(10, Math.round(count / streams.length));
  const out = [];
  for (let s = 0; s < streams.length; s++) {
    for (let i = 0; i < per; i++) {
      const base = i / per;
      const localDir = holding ? (i % 2 === 0 ? 1 : -1) : Math.sign(flowDirection || 1);
      const phase = ((base + timeMs * speedMag * (0.85 + (s % 3) * 0.08) + s * 0.13) % 1 + 1) % 1;
      const t = localDir < 0 ? 1 - phase : phase;
      const pt = streams[s](t);
      out.push({
        x: pt.x,
        y: pt.y,
        alpha: soundFieldAttenuation(t) * (0.28 + 0.42 * drive),
        radius: (1.8 + (i % 4) * 0.7 + drive * 0.8) * breathPlumeScale(t),
      });
    }
  }
  return out;
}

export function nasalCavityWaypoints() {
  // t = 0 at the larynx, t = 1 at the naris — same convention as oral,
  // so inhale (t: 1 → 0) enters the nose and continues down the pharynx.
  return [
    [14, 162],
    [10, 128],
    [8, 86],
    [14, 46],
    [28, 18],
    [48, -6],
    [74, -18],
    [102, -20],
    [126, -14],
    [148, -8],
  ];
}

export function oralCavityWaypoints(jawDrop = 0.12, mouthOpen = 0.12) {
  const open = clamp(mouthOpen);
  const lips = { x: 152, y: 28 + open * 12 };
  return [
    [14, 162],
    [16, 128],
    [14, 86],
    [20, 42],
    [48, 20],
    [88, 16],
    [126, 18],
    [lips.x, lips.y],
  ];
}

export function drawSkullCloseup(ctx, W, H, state, timeMs = 0, view = {}) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, W, H);
  drawSagittalHead(ctx, W, H, state, timeMs, { ...view, compact: false, originX: 0, originY: 0 });
}

/**
 * The same sagittal head used on the main figure and in the zoom dialog.
 * Zoom and origin change the camera, not the object.
 */
export function drawSagittalHead(ctx, W, H, state, timeMs = 0, {
  zoom = 1,
  yaw = 0,
  compact = false,
  originX = 0,
  originY = 0,
  camera = null,
} = {}) {
  ctx.save();
  ctx.translate(originX, originY);
  const L = closeupLayout(W, H, yaw, zoom, {
    mouthOpen: state.mouthOpen,
    jawDrop: state.jawDrop,
    lipSpread: state.lipSpread,
    jawRetract: state.jawRetract,
    headTuck: state.headTuck,
  }, camera);
  const rgb = hexToRgb(state.pitchColor);
  const formants = state.formantsHertz || [];

  if (!compact) drawExteriorAir(ctx, L, state, timeMs, 0.55);
  drawVault(ctx, L, state, timeMs);
  drawOrbit(ctx, L);
  drawSinuses(ctx, L, formants, state.chambers?.nasal || 0, timeMs);
  drawPharynx(ctx, L, formants, state.chambers?.pharynx || 0, timeMs, state);
  drawMandible(ctx, L);
  drawNasalCavity(ctx, L, formants, state.chambers?.nasal || 0, timeMs, state);
  drawOralCavity(ctx, L, formants, state.chambers?.oral || 0, timeMs, state);
  drawRegisterVoiceCloseup(ctx, L, state);
  drawMixedCloseupVibration(ctx, L, state, timeMs);
  drawCloseupAirwayColumn(ctx, L);
  drawLarynx(ctx, L, state, timeMs);
  if (!compact) drawTractHud(ctx, L, state);
  drawAirColumns(ctx, L, state, timeMs);
  drawTongue(ctx, L, state);
  drawMouth(ctx, L, state);
  drawEar(ctx, L, state);
  drawHeadSensationField(ctx, L, state, timeMs);
  if (!compact) {
    drawMouthEmission(ctx, L, state, timeMs, rgb);
    drawExteriorAir(ctx, L, state, timeMs, 1);
    drawLabels(ctx, L, state);
  }
  ctx.restore();
}

function closeupLayout(W, H, yaw, zoom, pose = {}, camera = null) {
  const mouthOpen = pose.mouthOpen ?? 0.12;
  const jawDrop = pose.jawDrop ?? 0.12;
  const lipSpread = clamp(pose.lipSpread ?? 0.35);
  const jawRetract = clamp(pose.jawRetract ?? 0);
  const headTuck = clamp(pose.headTuck ?? 0);
  const localW = 420;
  const localH = 520;
  const S = camera?.S ?? (Math.min(W / localW, H / localH) * 0.88 * zoom);
  const cx = camera?.cx ?? (W * 0.42);
  const cy = camera?.cy ?? (H * 0.50);
  const tmj = { x: -24, y: 10 };
  const pivot = { x: -18, y: 92 };
  const tuck = headTuck * 0.38;
  const rotateTuck = (x, y) => {
    if (!(tuck > 0.01)) return { x, y };
    const c = Math.cos(tuck);
    const s = Math.sin(tuck);
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
  };
  const project = (x, y, z = 0) => {
    const tucked = rotateTuck(x, y);
    const r = rigidCloseupProject(tucked.x, tucked.y, z, yaw);
    return { x: cx + r.x * S, y: cy + r.y * S };
  };
  const p = (x, y, z) => project(x, y, z);
  const jawP = (x, y, z = 0) => {
    const retracted = { x: x - jawRetract * 28, y: y + jawRetract * 5 };
    const r = jawRotatedPoint(retracted.x, retracted.y, jawDrop, tmj);
    return project(r.x, r.y, z);
  };
  const gap = 2 + clamp(mouthOpen) * 148;
  const jaw = clamp(jawDrop) * 72;
  const lipReach = 152 + lipSpread * 12 - jawRetract * 18;
  const upperLip = p(lipReach, 24 + (1 - lipSpread) * 4);
  const lowerLip = jawP(lipReach - 2, 42 + clamp(mouthOpen) * 28);
  const lips = { x: (upperLip.x + lowerLip.x) / 2, y: (upperLip.y + lowerLip.y) / 2 };
  const naris = p(148, -8, 6);
  return {
    W, H, S, cx, cy, yaw, project, p, jawP, tmj,
    lips, naris, upperLip, lowerLip,
    mouthOpen: clamp(mouthOpen),
    jawDrop: clamp(jawDrop),
    jawRetract,
    headTuck,
    lipSpread,
    gap,
    jaw,
    farZ: yaw >= 0 ? -12 : 12,
    ear: p(-42, 8, 22),
    palateY: 12,
  };
}

function drawVault(ctx, L, state = {}, timeMs = 0) {
  const { p, S } = L;
  const bone = ctx.createRadialGradient(p(12, -80).x, p(12, -80).y, 24 * S, L.cx, L.cy, 118 * S);
  bone.addColorStop(0, 'rgba(228,220,204,0.5)');
  bone.addColorStop(0.55, 'rgba(148,142,128,0.3)');
  bone.addColorStop(1, 'rgba(48,54,58,0.16)');
  ctx.fillStyle = bone;
  ctx.strokeStyle = rgbaVoice(OUTLINE_RGB, 0.9);
  ctx.lineWidth = 2.4 * S;
  ctx.beginPath();
  ctx.moveTo(p(-88, 52).x, p(-88, 52).y);
  ctx.bezierCurveTo(p(-128, 6).x, p(-128, 6).y, p(-118, -96).x, p(-118, -96).y, p(-36, -158).x, p(-36, -158).y);
  ctx.bezierCurveTo(p(24, -186).x, p(24, -186).y, p(102, -168).x, p(102, -168).y, p(118, -92).x, p(118, -92).y);
  ctx.bezierCurveTo(p(128, -58).x, p(128, -58).y, p(122, -28).x, p(122, -28).y, p(108, -16).x, p(108, -16).y);
  ctx.lineTo(p(104, 8).x, p(104, 8).y);
  ctx.lineTo(p(110, 20).x, p(110, 20).y);
  ctx.lineTo(p(54, 18).x, p(54, 18).y);
  ctx.lineTo(p(-32, 28).x, p(-32, 28).y);
  ctx.quadraticCurveTo(p(-78, 40).x, p(-78, 40).y, p(-88, 52).x, p(-88, 52).y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = rgbaVoice(OUTLINE_RGB, 0.28);
  ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(p(-6, -150).x, p(-6, -150).y);
  ctx.quadraticCurveTo(p(6, -40).x, p(6, -40).y, p(-8, 18).x, p(-8, 18).y);
  ctx.moveTo(p(72, -68).x, p(72, -68).y);
  ctx.lineTo(p(108, -18).x, p(108, -18).y);
  ctx.stroke();
  const vib = state.structureVibration;
  if (vib?.skullRim > 0.08 && vib.visualHz > 0) {
    const pulse = 0.55 + 0.45 * Math.sin((timeMs / 1000) * vib.visualHz * Math.PI * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgbaVoice(STRUCTURE_VIBRATION_RGB, 0.32 + 0.22 * vib.skullRim * pulse);
    ctx.lineWidth = 2.2 * S;
    ctx.beginPath();
    ctx.moveTo(p(-88, 52).x, p(-88, 52).y);
    ctx.bezierCurveTo(p(-128, 6).x, p(-128, 6).y, p(-118, -96).x, p(-118, -96).y, p(-36, -158).x, p(-36, -158).y);
    ctx.bezierCurveTo(p(24, -186).x, p(24, -186).y, p(102, -168).x, p(102, -168).y, p(118, -92).x, p(118, -92).y);
    ctx.bezierCurveTo(p(128, -58).x, p(128, -58).y, p(122, -28).x, p(122, -28).y, p(108, -16).x, p(108, -16).y);
    ctx.stroke();
    ctx.strokeStyle = rgbaVoice(STRUCTURE_VIBRATION_RGB, 0.78 + 0.22 * pulse);
    ctx.lineWidth = (0.75 + 0.35 * pulse) * S;
    ctx.beginPath();
    ctx.moveTo(p(-88, 52).x, p(-88, 52).y);
    ctx.bezierCurveTo(p(-128, 6).x, p(-128, 6).y, p(-118, -96).x, p(-118, -96).y, p(-36, -158).x, p(-36, -158).y);
    ctx.bezierCurveTo(p(24, -186).x, p(24, -186).y, p(102, -168).x, p(102, -168).y, p(118, -92).x, p(118, -92).y);
    ctx.bezierCurveTo(p(128, -58).x, p(128, -58).y, p(122, -28).x, p(122, -28).y, p(108, -16).x, p(108, -16).y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawRegisterVoiceCloseup(ctx, L, state = {}) {
  const amounts = state.registerAmounts || registerVoiceAmounts({
    chestGlow: state.chestAmount || 0,
    skullRim: state.headAmount || 0,
    mixedField: state.mixedAmount || 0,
  });
  const { chest, head, mixed, mixedRgb } = amounts;
  if (chest > 0.04 || head > 0.04 || mixed > 0.04) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    if (chest > 0.04) {
      const larynx = L.p(10, 148);
      const a = 0.16 + 0.28 * chest;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(larynx.x, larynx.y, 22 * L.S, 28 * L.S, 0.08, 0, Math.PI * 2);
      ctx.clip();
      const g = ctx.createRadialGradient(larynx.x, larynx.y, 4 * L.S, larynx.x, larynx.y, 28 * L.S);
      g.addColorStop(0, rgbaVoice(CHEST_VOICE_RGB, a));
      g.addColorStop(1, rgbaVoice(CHEST_VOICE_RGB, 0));
      ctx.fillStyle = g;
      ctx.fillRect(larynx.x - 28 * L.S, larynx.y - 32 * L.S, 56 * L.S, 64 * L.S);
      ctx.restore();
    }
    if (head > 0.04) {
      const stem = L.p(SAGITTAL_LOCAL.headVoiceX, SAGITTAL_LOCAL.headVoiceY);
      const a = 0.32 + 0.52 * head;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(stem.x, stem.y, 28 * L.S, 36 * L.S, 0.08, 0, Math.PI * 2);
      ctx.clip();
      const g = ctx.createRadialGradient(stem.x, stem.y, 4 * L.S, stem.x, stem.y, 36 * L.S);
      g.addColorStop(0, rgbaVoice(HEAD_VOICE_RGB, a));
      g.addColorStop(0.62, rgbaVoice(HEAD_VOICE_RGB, a * 0.32));
      g.addColorStop(1, rgbaVoice(HEAD_VOICE_RGB, 0));
      ctx.fillStyle = g;
      ctx.fillRect(stem.x - 32 * L.S, stem.y - 40 * L.S, 64 * L.S, 80 * L.S);
      ctx.restore();
      ctx.strokeStyle = rgbaVoice(HEAD_VOICE_RGB, 0.5 + 0.45 * head);
      ctx.lineWidth = 2.2 * L.S;
      ctx.beginPath();
      ctx.ellipse(stem.x, stem.y, 26 * L.S, 34 * L.S, 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (mixed > 0.04) {
      const mid = L.p(8, 78);
      const a = 0.22 + 0.4 * mixed;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, 22 * L.S, 40 * L.S, 0.12, 0, Math.PI * 2);
      ctx.clip();
      const g = ctx.createRadialGradient(mid.x, mid.y, 4 * L.S, mid.x, mid.y, 40 * L.S);
      g.addColorStop(0, rgbaVoice(mixedRgb, a));
      g.addColorStop(1, rgbaVoice(mixedRgb, 0));
      ctx.fillStyle = g;
      ctx.fillRect(mid.x - 26 * L.S, mid.y - 44 * L.S, 52 * L.S, 88 * L.S);
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.save();
  ctx.font = `bold ${Math.max(9, 10)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'left';
  const x = 14;
  let y = 22;
  ctx.fillStyle = 'rgba(236, 244, 252, 0.92)';
  ctx.fillText('register · source', x, y);
  y += 14;
  const lit = (amount, on, off) => (amount > 0.18 ? on : off);
  ctx.font = `${Math.max(8, 9)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = lit(chest, rgbaVoice(CHEST_VOICE_RGB, 0.95), 'rgba(150,162,178,0.4)');
  ctx.fillText(`chest ${Math.round(chest * 100)}%`, x, y);
  y += 13;
  ctx.fillStyle = lit(mixed, rgbaVoice(mixedRgb, 0.95), 'rgba(150,162,178,0.4)');
  ctx.fillText(`mixed ${Math.round(mixed * 100)}%`, x, y);
  y += 13;
  ctx.fillStyle = lit(head, rgbaVoice(HEAD_VOICE_RGB, 0.95), 'rgba(150,162,178,0.4)');
  ctx.fillText(`head ${Math.round(head * 100)}%`, x, y);
  y += 18;
  const chambers = state.chambers || {};
  const oral = Number(chambers.oral) || 0;
  const pharynx = Number(chambers.pharynx) || 0;
  const nasal = Number(chambers.nasal) || 0;
  ctx.font = `bold ${Math.max(9, 10)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = 'rgba(236, 244, 252, 0.92)';
  ctx.fillText('resonance · filter', x, y);
  y += 14;
  ctx.font = `${Math.max(8, 9)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = lit(oral, rgbaVoice(CHEST_CHAMBER_RGB, 0.98), 'rgba(150,162,178,0.4)');
  ctx.fillText(`chest ${Math.round(oral * 100)}%`, x, y);
  y += 13;
  ctx.fillStyle = lit(pharynx, rgbaVoice(THROAT_CHAMBER_RGB, 0.98), 'rgba(150,162,178,0.4)');
  ctx.fillText(`throat ${Math.round(pharynx * 100)}%`, x, y);
  y += 13;
  ctx.fillStyle = lit(nasal, rgbaVoice(SKULL_CHAMBER_RGB, 0.98), 'rgba(150,162,178,0.4)');
  ctx.fillText(`head ${Math.round(nasal * 100)}%`, x, y);
  ctx.restore();
}

function drawMixedCloseupVibration(ctx, L, state, timeMs) {
  const vib = state.mixedVibration;
  if (!vib || !(vib.amount > 0.08) || !(vib.visualHz > 0)) return;
  const rgb = state.registerAmounts?.mixedRgb || { r: 180, g: 210, b: 140 };
  const phase = ((timeMs / 1000) * vib.visualHz) % 1;
  const pulse = 0.55 + 0.45 * Math.sin(phase * Math.PI * 2);
  const path = [
    L.p(10, 148),
    L.p(4, 110),
    L.p(8, 78),
    L.p(40, 28),
    L.p(70, -12),
    L.p(SAGITTAL_LOCAL.headVoiceX, SAGITTAL_LOCAL.headVoiceY),
  ];
  ctx.save();
    ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = rgba(rgb, 0.18 + vib.amount * 0.42 * pulse);
  ctx.lineWidth = (2.2 + vib.amount * 4.5 * pulse) * L.S;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const t = (phase + i / 5) % 1;
    const idx = t * (path.length - 1);
    const a = Math.floor(idx);
    const u = idx - a;
    const p0 = path[a];
    const p1 = path[Math.min(path.length - 1, a + 1)];
    const x = p0.x + (p1.x - p0.x) * u;
    const y = p0.y + (p1.y - p0.y) * u;
    ctx.strokeStyle = rgba(rgb, 0.22 + vib.amount * 0.5 * (1 - t));
    ctx.lineWidth = 1.4 * L.S;
    ctx.beginPath();
    ctx.ellipse(x, y, (10 + vib.amount * 16) * L.S * (0.7 + t), (7 + vib.amount * 10) * L.S, 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSinuses(ctx, L, formants, energy, timeMs) {
  const f3 = formants[2] || 0;
  const wave = energy > 0.04 && f3 > 1800
    ? Math.abs(cavityStandingWave({ s: 0.5, timeMs, formantHertz: f3, energy, harmonic: 3 }))
    : 0;
  const glow = energy > 0.04 ? 0.08 + 0.18 * energy + 0.12 * wave : 0;
  fillChamber(ctx, L, [
    [36, -118], [72, -126], [88, -102], [64, -84], [32, -92],
  ], rgbaVoice(SKULL_CHAMBER_RGB, 0.08 + glow), rgbaVoice(SKULL_CHAMBER_RGB, 0.28 + energy * 0.12));
  fillChamber(ctx, L, [
    [2, -24], [22, -28], [28, -8], [12, 6], [-2, 2],
  ], rgbaVoice(SKULL_CHAMBER_RGB, 0.06 + glow * 0.7), rgbaVoice(SKULL_CHAMBER_RGB, 0.22));
  fillChamber(ctx, L, [
    [48, -18], [70, -16], [74, 4], [52, 10], [42, -2],
  ], rgbaVoice(SKULL_CHAMBER_RGB, 0.05 + glow * 0.5), rgbaVoice(SKULL_CHAMBER_RGB, 0.18));
}

function traceNasalLumen(ctx, L) {
  ctx.beginPath();
  ctx.moveTo(L.p(148, -8).x, L.p(148, -8).y);
  ctx.bezierCurveTo(L.p(132, -32).x, L.p(132, -32).y, L.p(96, -50).x, L.p(96, -50).y, L.p(64, -42).x, L.p(64, -42).y);
  ctx.bezierCurveTo(L.p(36, -36).x, L.p(36, -36).y, L.p(18, -22).x, L.p(18, -22).y, L.p(16, -4).x, L.p(16, -4).y);
  ctx.quadraticCurveTo(L.p(18, 10).x, L.p(18, 10).y, L.p(28, 12).x, L.p(28, 12).y);
  ctx.lineTo(L.p(128, 12).x, L.p(128, 12).y);
  ctx.quadraticCurveTo(L.p(140, 2).x, L.p(140, 2).y, L.p(148, -8).x, L.p(148, -8).y);
  ctx.closePath();
}

function drawNasalCavity(ctx, L, formants, energy, timeMs, state) {
  const f3 = formants[2] || 0;
  const wave = energy > 0.04 && f3 > 1800
    ? cavityStandingWave({ s: 0.45, timeMs, formantHertz: f3, energy, harmonic: 2 })
    : 0;
  const nasal = 0.08 + state.nasalShare * 0.12 + energy * 0.45 + Math.abs(wave) * 0.3 + (state.nasalFlow || 0) * 0.12;
  ctx.fillStyle = `rgba(8, 18, 28, ${0.62 + nasal * 0.2})`;
  ctx.strokeStyle = rgbaVoice(TRACT_RGB, 0.7);
  ctx.lineWidth = 2.2 * L.S;
  traceNasalLumen(ctx, L);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgbaVoice(SKULL_CHAMBER_RGB, energy > 0.04 ? 0.28 + nasal * 0.55 : 0.1);
  traceNasalLumen(ctx, L);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = rgbaVoice(TRACT_RGB, 0.22);
  ctx.strokeStyle = rgbaVoice(TRACT_RGB, 0.48);
  ctx.lineWidth = 1.3 * L.S;
  for (const [sx, sy, ex, ey, drop] of [
    [96, 6, 38, 2, 10],
    [88, -10, 34, -12, 9],
    [70, -24, 32, -22, 7],
  ]) {
    ctx.beginPath();
    ctx.moveTo(L.p(sx, sy).x, L.p(sx, sy).y);
    ctx.bezierCurveTo(
      L.p((sx + ex) / 2, sy - drop).x, L.p((sx + ex) / 2, sy - drop).y,
      L.p(ex + 8, ey - 2).x, L.p(ex + 8, ey - 2).y,
      L.p(ex, ey).x, L.p(ex, ey).y,
    );
    ctx.quadraticCurveTo(
      L.p((sx + ex) / 2, sy + 3).x, L.p((sx + ex) / 2, sy + 3).y,
      L.p(sx - 2, sy + 4).x, L.p(sx - 2, sy + 4).y,
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = rgbaVoice(BONE_RGB, 0.9);
  ctx.lineWidth = 4.4 * L.S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(L.p(104, 12).x, L.p(104, 12).y);
  ctx.lineTo(L.p(22, 12).x, L.p(22, 12).y);
  ctx.stroke();

  const narisOpen = 4 + (state.nasalFlow || 0) * 8;
  ctx.fillStyle = `rgba(6,18,24,${0.78 + (state.nasalFlow || 0) * 0.18})`;
  ctx.strokeStyle = rgbaVoice(TRACT_RGB, 0.7);
  ctx.beginPath();
  ctx.ellipse(L.naris.x, L.naris.y, 8 * L.S, narisOpen * L.S, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function traceOralLumen(ctx, L) {
  ctx.beginPath();
  ctx.moveTo(L.p(104, 14).x, L.p(104, 14).y);
  ctx.lineTo(L.p(24, 14).x, L.p(24, 14).y);
  ctx.quadraticCurveTo(L.p(10, 28).x, L.p(10, 28).y, L.p(12, 52).x, L.p(12, 52).y);
  ctx.quadraticCurveTo(L.p(10, 78).x, L.p(10, 78).y, L.p(14, 96).x, L.p(14, 96).y);
  ctx.quadraticCurveTo(L.jawP(40, 100).x, L.jawP(40, 100).y, L.jawP(78, 88).x, L.jawP(78, 88).y);
  ctx.quadraticCurveTo(L.jawP(108, 70).x, L.jawP(108, 70).y, L.jawP(118, 38).x, L.jawP(118, 38).y);
  ctx.lineTo(L.p(124, 24).x, L.p(124, 24).y);
  ctx.quadraticCurveTo(L.p(116, 18).x, L.p(116, 18).y, L.p(104, 14).x, L.p(104, 14).y);
  ctx.closePath();
}

function drawTractHud(ctx, L, state) {
  const tract = state.tract || {};
  const vowel = state.vowelMap || {};
  ctx.save();
  ctx.font = `bold ${Math.max(9, 10)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'left';
  ctx.fillStyle = rgbaVoice(THROAT_CHAMBER_RGB, 0.95);
  ctx.fillText(tract.tokenLabel || vowel.label || 'unknown tract', 14, L.H - 36);
  ctx.font = `${Math.max(8, 9)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = 'rgba(174,194,207,0.78)';
  ctx.fillText('filter · not register', 14, L.H - 22);
  ctx.restore();
}

function drawVowelSensationCloseup(ctx, L, state) {
  drawTractHud(ctx, L, state);
}

function drawOralCavity(ctx, L, formants, energy, timeMs, state) {
  const f1 = formants[0] || 0;
  const wave = energy > 0.04 && f1 > 180
    ? cavityStandingWave({ s: 0.55, timeMs, formantHertz: f1, energy, harmonic: 1 })
    : 0;
  const fill = 0.06 + energy * 0.4 + Math.abs(wave) * 0.28;
  ctx.fillStyle = `rgba(18, 6, 10, ${0.7 + fill * 0.2})`;
  ctx.strokeStyle = rgbaVoice(TRACT_RGB, 0.55 + energy * 0.2);
  ctx.lineWidth = (1.8 + energy) * L.S;
  traceOralLumen(ctx, L);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgbaVoice(CHEST_CHAMBER_RGB, energy > 0.04 ? 0.28 + fill * 0.7 : 0.08);
  traceOralLumen(ctx, L);
  ctx.fill();
  ctx.restore();
  drawHardPalate(ctx, L);
  drawSoftPalate(ctx, L, state);
}

function drawHardPalate(ctx, L) {
  ctx.fillStyle = rgbaVoice(BONE_RGB, 0.28);
  ctx.strokeStyle = rgbaVoice(BONE_RGB, 0.88);
  ctx.lineWidth = 2.2 * L.S;
  ctx.beginPath();
  ctx.moveTo(L.p(106, 10).x, L.p(106, 10).y);
  ctx.lineTo(L.p(22, 10).x, L.p(22, 10).y);
  ctx.lineTo(L.p(22, 15).x, L.p(22, 15).y);
  ctx.lineTo(L.p(106, 15).x, L.p(106, 15).y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(210,198,178,0.45)';
  ctx.lineWidth = 1.1 * L.S;
  for (let i = 0; i < 4; i++) {
    const x = 96 - i * 10;
    ctx.beginPath();
    ctx.moveTo(L.p(x, 11).x, L.p(x, 11).y);
    ctx.quadraticCurveTo(L.p(x - 4, 7).x, L.p(x - 4, 7).y, L.p(x - 9, 11).x, L.p(x - 9, 11).y);
    ctx.stroke();
  }
}

function drawSoftPalate(ctx, L, state) {
  const drop = 4 + (1 - (state.nasalShare || 0.18)) * 16;
  ctx.fillStyle = rgbaVoice(TRACT_RGB, 0.42);
  ctx.strokeStyle = rgbaVoice(TRACT_RGB, 0.7);
  ctx.lineWidth = 1.6 * L.S;
  ctx.beginPath();
  ctx.moveTo(L.p(24, 12).x, L.p(24, 12).y);
  ctx.quadraticCurveTo(L.p(8, 16 + drop * 0.35).x, L.p(8, 16 + drop * 0.35).y, L.p(-4, 30 + drop).x, L.p(-4, 30 + drop).y);
  ctx.quadraticCurveTo(L.p(6, 38 + drop).x, L.p(6, 38 + drop).y, L.p(22, 16).x, L.p(22, 16).y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = rgbaVoice(TRACT_RGB, 0.55);
  ctx.beginPath();
  ctx.moveTo(L.p(-2, 28 + drop).x, L.p(-2, 28 + drop).y);
  ctx.quadraticCurveTo(L.p(-8, 42 + drop).x, L.p(-8, 42 + drop).y, L.p(-1, 50 + drop).x, L.p(-1, 50 + drop).y);
  ctx.quadraticCurveTo(L.p(6, 40 + drop).x, L.p(6, 40 + drop).y, L.p(2, 30 + drop).x, L.p(2, 30 + drop).y);
  ctx.closePath();
  ctx.fill();
}

function tongueShape(L, state) {
  const art = tongueArticulation(state.formantsHertz, L.mouthOpen);
  const height = state.tract?.evidenceClass === 'derived' ? state.tract.height : art.height;
  const front = state.tract?.evidenceClass === 'derived' ? state.tract.front : art.front;
  const lift = (1 - height) * 22;
  const floor = jawRotatedPoint(78, 82, L.jawDrop, L.tmj);
  const genial = jawRotatedPoint(108, 68, L.jawDrop, L.tmj);
  const hyoid = jawRotatedPoint(24, 92, L.jawDrop, L.tmj);
  return {
    art: { ...art, height, front },
    tip: [108 + front * 18, 40 + lift * 0.18 + L.gap * 0.05],
    blade: [80 + front * 14, 28 + lift * 0.08 - height * 16],
    dorsum: [44 + (1 - front) * 18, 24 + lift * 0.06 - height * 18 + (1 - front) * 10],
    root: [12 + (1 - front) * 12, 50 + lift * 0.5],
    vallecula: [8, 68],
    hyoid: [hyoid.x, hyoid.y],
    floor: [floor.x, floor.y],
    genial: [genial.x, genial.y],
  };
}

function traceTongue(ctx, L, shape, z) {
  const P = (xy) => L.p(xy[0], xy[1], z);
  const tip = P(shape.tip);
  const blade = P(shape.blade);
  const dorsum = P(shape.dorsum);
  const root = P(shape.root);
  const vallecula = P(shape.vallecula);
  const hyoid = P(shape.hyoid);
  const floor = P(shape.floor);
  const genial = P(shape.genial);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.quadraticCurveTo(blade.x, blade.y, dorsum.x, dorsum.y);
  ctx.quadraticCurveTo(root.x, root.y, vallecula.x, vallecula.y);
  ctx.quadraticCurveTo(hyoid.x, hyoid.y, floor.x, floor.y);
  ctx.quadraticCurveTo(genial.x, genial.y, tip.x, tip.y + 4 * L.S);
  ctx.closePath();
}

function drawTongue(ctx, L, state) {
  const shape = tongueShape(L, state);
  const layers = Math.abs(L.yaw) > 0.06 ? (L.yaw >= 0 ? [L.farZ, 0, -L.farZ] : [-L.farZ, 0, L.farZ]) : [0];
  for (const z of layers) {
    const midline = z === 0;
    ctx.fillStyle = midline ? rgbaVoice(MUSCLE_RGB, 0.72) : rgbaVoice(MUSCLE_RGB, 0.28 + Math.abs(Math.sin(L.yaw)) * 0.22);
    ctx.strokeStyle = midline ? rgbaVoice(MUSCLE_RGB, 0.85) : rgbaVoice(MUSCLE_RGB, 0.4);
    ctx.lineWidth = (midline ? 1.6 : 1.05) * L.S;
    traceTongue(ctx, L, shape, z);
    ctx.fill();
    ctx.stroke();
  }
  const dorsum = L.p(shape.dorsum[0], shape.dorsum[1], 0);
  const blade = L.p(shape.blade[0], shape.blade[1], 0);
  const tip = L.p(shape.tip[0], shape.tip[1], 0);
  const root = L.p(shape.root[0], shape.root[1], 0);
  ctx.strokeStyle = rgbaVoice(MUSCLE_RGB, 0.4);
  ctx.lineWidth = 1.15 * L.S;
  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  ctx.quadraticCurveTo(dorsum.x, dorsum.y - 3 * L.S, blade.x, blade.y);
  ctx.quadraticCurveTo(tip.x - 6 * L.S, tip.y - 4 * L.S, tip.x, tip.y);
  ctx.stroke();
  ctx.fillStyle = rgbaVoice(MUSCLE_RGB, 0.28);
  for (let i = 0; i < 7; i++) {
    const pt = L.p(
      shape.blade[0] + (shape.tip[0] - shape.blade[0]) * (i / 6) - 4,
      shape.blade[1] + (shape.tip[1] - shape.blade[1]) * (i / 6) + 3,
      0,
    );
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, (1.1 + (i % 2) * 0.4) * L.S, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgbaVoice(MUSCLE_RGB, 0.62);
  ctx.beginPath();
  ctx.ellipse(tip.x, tip.y, 7.5 * L.S, 4.2 * L.S, 0.15, 0, Math.PI * 2);
  ctx.fill();
}

function drawMouth(ctx, L, state) {
  const flowing = (state.oralFlow || 0) > 0.06 || Math.abs(state.flowDirection) > 0.2;
  ctx.fillStyle = `rgba(10,2,6,${0.78 + L.mouthOpen * 0.18})`;
  ctx.beginPath();
  ctx.moveTo(L.p(104, 22).x, L.p(104, 22).y);
  ctx.quadraticCurveTo(L.p(124, 20).x, L.p(124, 20).y, L.p(132, 26).x, L.p(132, 26).y);
  ctx.lineTo(L.jawP(132, 44 + L.mouthOpen * 28).x, L.jawP(132, 44 + L.mouthOpen * 28).y);
  ctx.quadraticCurveTo(L.jawP(120, 52 + L.mouthOpen * 22).x, L.jawP(120, 52 + L.mouthOpen * 22).y, L.jawP(104, 40 + L.mouthOpen * 10).x, L.jawP(104, 40 + L.mouthOpen * 10).y);
  ctx.closePath();
  ctx.fill();
  drawTeeth(ctx, L);
  drawLips(ctx, L);
  if (flowing && L.mouthOpen > 0.08) {
    ctx.fillStyle = rgbaVoice(AIRFLOW_RGB, 0.12 + (state.oralFlow || 0) * 0.32);
    ctx.beginPath();
    ctx.ellipse(L.lips.x, L.lips.y, (16 + L.mouthOpen * 18) * L.S, Math.max(5, (L.lowerLip.y - L.upperLip.y) * 0.42), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTeeth(ctx, L) {
  const h = 8;
  const zs = Math.abs(L.yaw) > 0.08 ? [L.farZ * 0.7, 0, -L.farZ * 0.7] : [0];
  for (const z of zs) {
    ctx.fillStyle = z === 0 ? 'rgba(236,232,220,0.92)' : 'rgba(214,208,196,0.45)';
    ctx.strokeStyle = 'rgba(176,170,158,0.55)';
    ctx.lineWidth = 0.7 * L.S;
    for (let i = 0; i < 6; i++) {
      const x = 100 + i * 5.6;
      toothQuad(ctx, L.p, x, 16, h, z, 1);
      toothQuad(ctx, L.jawP, x, 34, h, z, -1);
    }
  }
}

function toothQuad(ctx, projector, x, y, h, z, dir) {
  const a = projector(x, y, z);
  const b = projector(x + 4.2, y, z);
  const c = projector(x + 3.6, y + dir * h, z);
  const d = projector(x + 0.6, y + dir * h, z);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawLips(ctx, L) {
  const spread = clamp(L.lipSpread ?? 0.35);
  const reach = 118 + spread * 18;
  const thin = 12 + (1 - spread) * 8;
  const layers = Math.abs(L.yaw) > 0.06 ? [L.farZ, 0, -L.farZ] : [0];
  for (const z of layers) {
    const mid = z === 0;
    ctx.fillStyle = mid ? 'rgba(176,64,78,0.92)' : 'rgba(148,48,62,0.4)';
    ctx.strokeStyle = mid ? 'rgba(232,128,132,0.9)' : 'rgba(200,96,108,0.4)';
    ctx.lineWidth = (mid ? 1.5 : 1) * L.S;
    ctx.beginPath();
    ctx.moveTo(L.p(96, 22, z).x, L.p(96, 22, z).y);
    ctx.quadraticCurveTo(L.p(118, thin, z).x, L.p(118, thin, z).y, L.p(reach, 24, z).x, L.p(reach, 24, z).y);
    ctx.quadraticCurveTo(L.p(118, 26, z).x, L.p(118, 26, z).y, L.p(98, 24, z).x, L.p(98, 24, z).y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = mid ? 'rgba(168,58,72,0.94)' : 'rgba(140,42,56,0.4)';
    ctx.beginPath();
    const drop = L.mouthOpen * 22;
    ctx.moveTo(L.jawP(96, 36 + drop * 0.4, z).x, L.jawP(96, 36 + drop * 0.4, z).y);
    ctx.quadraticCurveTo(L.jawP(118, 46 + (1 - spread) * 8 + drop, z).x, L.jawP(118, 46 + (1 - spread) * 8 + drop, z).y, L.jawP(reach, 38 + drop, z).x, L.jawP(reach, 38 + drop, z).y);
    ctx.quadraticCurveTo(L.jawP(118, 40 + drop * 0.7, z).x, L.jawP(118, 40 + drop * 0.7, z).y, L.jawP(98, 38 + drop * 0.45, z).x, L.jawP(98, 38 + drop * 0.45, z).y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawPharynx(ctx, L, formants, energy, timeMs, state = {}) {
  const f2 = formants[1] || 0;
  const wave = energy > 0.04 && f2 > 500
    ? cavityStandingWave({ s: 0.4, timeMs, formantHertz: f2, energy, harmonic: 2 })
    : 0;
  const fill = 0.08 + energy * 0.45 + Math.abs(wave) * 0.3;
  const pinch = clamp(state.supraglotticNarrowing || 0);
  const wide = clamp(state.pharynxWide ?? 0.45);
  const open = (wide - pinch * 0.7) * (38 + clamp(state.mouthOpen) * 36);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(${THROAT_CHAMBER_RGB.r},${THROAT_CHAMBER_RGB.g},${THROAT_CHAMBER_RGB.b},${energy > 0.04 ? 0.1 + fill * 0.22 : 0.1 + fill * 0.28})`;
  ctx.strokeStyle = rgbaVoice(TRACT_RGB, 0.62 + energy * 0.12);
  ctx.lineWidth = (2.2 + energy * 0.8) * L.S;
  ctx.beginPath();
  ctx.moveTo(L.p(22, 8).x, L.p(22, 8).y);
  ctx.bezierCurveTo(
    L.p(-28 - open + pinch * 6, 22).x, L.p(-28 - open + pinch * 6, 22).y,
    L.p(-34 - open + pinch * 8, 82).x, L.p(-34 - open + pinch * 8, 82).y,
    L.p(-12 - open * 0.4 + pinch * 4, 148).x, L.p(-12 - open * 0.4 + pinch * 4, 148).y,
  );
  ctx.lineTo(L.p(28 + open * 0.4 - pinch * 8, 148).x, L.p(28 + open * 0.4 - pinch * 8, 148).y);
  ctx.bezierCurveTo(
    L.p(18 + open - pinch * 10, 86).x, L.p(18 + open - pinch * 10, 86).y,
    L.p(26 + open - pinch * 8, 38).x, L.p(26 + open - pinch * 8, 38).y,
    L.p(34 + open * 0.4 - pinch * 6, 16).x, L.p(34 + open * 0.4 - pinch * 6, 16).y,
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (energy > 0.04) {
    const top = L.p(SAGITTAL_LOCAL.throatResonanceX, SAGITTAL_LOCAL.throatResonanceY);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(top.x, top.y, 3 * L.S, top.x, top.y, 28 * L.S);
    const a = 0.32 + fill * 0.55;
    g.addColorStop(0, rgbaVoice(THROAT_CHAMBER_RGB, a));
    g.addColorStop(0.65, rgbaVoice(THROAT_CHAMBER_RGB, a * 0.35));
    g.addColorStop(1, rgbaVoice(THROAT_CHAMBER_RGB, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, 18 * L.S, 26 * L.S, 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgbaVoice(THROAT_CHAMBER_RGB, 0.82 + energy * 0.16);
    ctx.lineWidth = (2.4 + energy * 1.4) * L.S;
    ctx.stroke();
  }
  ctx.restore();
}

function drawCloseupAirwayColumn(ctx, L) {
  const top = L.p(SAGITTAL_LOCAL.brainstemX - 6, SAGITTAL_LOCAL.brainstemY - 8);
  const throat = L.p(SAGITTAL_LOCAL.throatResonanceX - 10, SAGITTAL_LOCAL.throatResonanceY);
  const box = L.p(-6, 148);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgbaVoice(AIRWAY_COLUMN_RGB, 0.94);
  ctx.lineWidth = 1.55 * L.S;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(throat.x, throat.y);
  ctx.lineTo(box.x, box.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(L.p(SAGITTAL_LOCAL.brainstemX + 10, SAGITTAL_LOCAL.brainstemY - 8).x, top.y);
  ctx.lineTo(L.p(SAGITTAL_LOCAL.throatResonanceX + 12, SAGITTAL_LOCAL.throatResonanceY).x, throat.y);
  ctx.lineTo(L.p(22, 148).x, box.y);
  ctx.stroke();
  ctx.restore();
}

function drawLarynx(ctx, L, state, timeMs) {
  const open = state.phonated ? 0.28 : 0.7;
  const vib = state.structureVibration || {};
  const pulse = vib.throatCartilage > 0.08 && vib.visualHz > 0
    ? 0.55 + 0.45 * Math.sin((timeMs / 1000) * vib.visualHz * Math.PI * 2)
    : 1;
  const lift = 1 + 0.015 * (vib.throatCartilage || 0) * pulse;
  ctx.save();
  ctx.fillStyle = rgbaVoice(LARYNX_RGB, 0.46);
  ctx.strokeStyle = rgbaVoice(LARYNX_RGB, 0.98);
  ctx.lineWidth = 2.2 * L.S;
  ctx.beginPath();
  ctx.moveTo(L.p(-10, 122).x, L.p(-10, 122).y);
  ctx.lineTo(L.p(26, 122).x, L.p(26, 122).y);
  ctx.lineTo(L.p(18, 158 * lift).x, L.p(18, 158 * lift).y);
  ctx.lineTo(L.p(-4, 158 * lift).x, L.p(-4, 158 * lift).y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = rgbaVoice(LARYNX_RGB, 0.88);
  ctx.lineWidth = 1.5 * L.S;
  ctx.beginPath();
  ctx.moveTo(L.p(-14, 118).x, L.p(-14, 118).y);
  ctx.quadraticCurveTo(L.p(8, 112).x, L.p(8, 112).y, L.p(28, 118).x, L.p(28, 118).y);
  ctx.stroke();
  const wiggle = state.phonated && state.frequencyHertz
    ? Math.sin(timeMs * 0.001 * Math.max(1.6, Math.min(14, state.frequencyHertz / 48)) * Math.PI * 2) * 1.4
    : 0;
  ctx.strokeStyle = 'rgba(255, 248, 255, 0.96)';
  ctx.lineWidth = 1.85 * L.S;
  ctx.beginPath();
  ctx.moveTo(L.p(0, 136 - open * 8 + wiggle).x, L.p(0, 136 - open * 8 + wiggle).y);
  ctx.lineTo(L.p(14, 136 - open * 8 - wiggle).x, L.p(14, 136 - open * 8 - wiggle).y);
  ctx.moveTo(L.p(0, 142 + open * 8 - wiggle).x, L.p(0, 142 + open * 8 - wiggle).y);
  ctx.lineTo(L.p(14, 142 + open * 8 + wiggle).x, L.p(14, 142 + open * 8 + wiggle).y);
  ctx.stroke();
  ctx.restore();
}

function drawEar(ctx, L, state = {}) {
  const e = L.ear;
  const sensation = clamp(state.headSensationAmount || state.headLoopAmount || 0);
  const inner = L.p(10, 36);
  ctx.strokeStyle = rgbaVoice(SKULL_CHAMBER_RGB, 0.42 + sensation * 0.4);
  ctx.lineWidth = (3.4 + sensation * 2.2) * L.S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.quadraticCurveTo(L.p(-18, 22).x, L.p(-18, 22).y, inner.x, inner.y);
  ctx.stroke();
  ctx.strokeStyle = rgbaVoice(SKULL_CHAMBER_RGB, 0.22 + sensation * 0.25);
  ctx.lineWidth = 1.4 * L.S;
  ctx.beginPath();
  ctx.moveTo(e.x + 2 * L.S, e.y + 4 * L.S);
  ctx.quadraticCurveTo(L.p(-10, 28).x, L.p(-10, 28).y, inner.x + 3 * L.S, inner.y + 4 * L.S);
  ctx.stroke();
  ctx.fillStyle = 'rgba(4,10,14,0.88)';
  ctx.strokeStyle = sensation > 0.12
    ? rgbaVoice(SKULL_CHAMBER_RGB, 0.7 + sensation * 0.3)
    : rgbaVoice(OUTLINE_RGB, 0.7);
  ctx.lineWidth = (1.4 + sensation * 1.2) * L.S;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, 9 * L.S, 14 * L.S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = sensation > 0.12
    ? rgbaVoice(SKULL_CHAMBER_RGB, 0.45 + sensation * 0.4)
    : rgbaVoice(OUTLINE_RGB, 0.4);
  ctx.beginPath();
  ctx.ellipse(e.x - 2 * L.S, e.y, 4 * L.S, 7 * L.S, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgbaVoice(SKULL_CHAMBER_RGB, 0.35 + sensation * 0.4);
  ctx.beginPath();
  ctx.arc(inner.x, inner.y, (3.2 + sensation * 2.4) * L.S, 0, Math.PI * 2);
  ctx.fill();
  if (sensation > 0.08 && state.phonated) {
    const glow = ctx.createRadialGradient(e.x, e.y, 1 * L.S, e.x, e.y, 22 * L.S);
    glow.addColorStop(0, rgbaVoice(SKULL_CHAMBER_RGB, 0.22 + sensation * 0.35));
    glow.addColorStop(1, rgbaVoice(SKULL_CHAMBER_RGB, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 22 * L.S, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMandible(ctx, L) {
  ctx.fillStyle = rgbaVoice(BONE_RGB, 0.22);
  ctx.strokeStyle = rgbaVoice(BONE_RGB, 0.82);
  ctx.lineWidth = 2.6 * L.S;
  ctx.beginPath();
  ctx.moveTo(L.jawP(-24, 10).x, L.jawP(-24, 10).y);
  ctx.lineTo(L.jawP(-8, -4).x, L.jawP(-8, -4).y);
  ctx.lineTo(L.jawP(6, 22).x, L.jawP(6, 22).y);
  ctx.lineTo(L.jawP(18, 58).x, L.jawP(18, 58).y);
  ctx.quadraticCurveTo(L.jawP(52, 96).x, L.jawP(52, 96).y, L.jawP(96, 86).x, L.jawP(96, 86).y);
  ctx.lineTo(L.jawP(112, 68).x, L.jawP(112, 68).y);
  ctx.lineTo(L.jawP(108, 92).x, L.jawP(108, 92).y);
  ctx.quadraticCurveTo(L.jawP(48, 118).x, L.jawP(48, 118).y, L.jawP(-8, 98).x, L.jawP(-8, 98).y);
  ctx.lineTo(L.jawP(-22, 48).x, L.jawP(-22, 48).y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawOrbit(ctx, L) {
  const o = L.p(SAGITTAL_LOCAL.orbitX, SAGITTAL_LOCAL.orbitY, 16);
  ctx.fillStyle = 'rgba(6,10,16,0.9)';
  ctx.strokeStyle = rgbaVoice(BONE_RGB, 0.8);
  ctx.lineWidth = 3.2 * L.S;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, 30 * L.S, 22 * L.S, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(18, 28, 36, 0.95)';
  ctx.beginPath();
  ctx.ellipse(o.x + 2 * L.S, o.y + 2 * L.S, 18 * L.S, 16 * L.S, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(210, 196, 178, 0.7)';
  ctx.beginPath();
  ctx.ellipse(o.x + 1 * L.S, o.y + 1 * L.S, 13 * L.S, 13 * L.S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(70, 118, 96, 0.85)';
  ctx.beginPath();
  ctx.ellipse(o.x + 2 * L.S, o.y + 1 * L.S, 6.5 * L.S, 6.5 * L.S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(8, 10, 12, 0.92)';
  ctx.beginPath();
  ctx.ellipse(o.x + 2 * L.S, o.y + 1 * L.S, 3.1 * L.S, 3.1 * L.S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(o.x - 2 * L.S, o.y - 3 * L.S, 1.6 * L.S, 0, Math.PI * 2);
  ctx.fill();
}

function fillChamber(ctx, L, pts, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.1 * L.S;
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const p = L.p(x, y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function oralPathPoint(L, t) {
  return polyline(oralCavityWaypoints(L.jawDrop, L.mouthOpen).map(([x, y]) => L.p(x, y)), t);
}

function nasalPathPoint(L, t) {
  return polyline(nasalCavityWaypoints().map(([x, y]) => L.p(x, y)), t);
}

function polyline(pts, t) {
  const u = clamp(t) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(u));
  const f = u - i;
  const s = (1 - Math.cos(f * Math.PI)) / 2;
  return {
    x: pts[i].x + (pts[i + 1].x - pts[i].x) * s,
    y: pts[i].y + (pts[i + 1].y - pts[i].y) * s,
  };
}

function drawAirColumns(ctx, L, state, timeMs) {
  const particles = closeupAirflowParticles({
    timeMs,
    flowDirection: state.flowDirection,
    flowRate: state.flowRate,
    nasalShare: state.nasalShare,
    phonated: state.phonated,
    energy: state.energy,
    frequencyHertz: state.frequencyHertz || 0,
  });
  const oralRgb = AIRFLOW_RGB;
  const nasalRgb = AIRFLOW_RGB;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.save();
  traceNasalAirway(ctx, L);
  ctx.clip();
  drawStreamTube(ctx, L, (layout, t) => nasalPathPoint(layout, t), nasalRgb, 7 * L.S, 0.42 + (state.nasalFlow || state.nasalShare) * 0.4);
  drawParticleSet(ctx, L, particles.filter((p) => p.path === 'nasal'), nasalPathPoint, nasalRgb, 3.2 * L.S);
  ctx.restore();
  ctx.save();
  traceOralLumen(ctx, L);
  ctx.clip();
  drawStreamTube(ctx, L, (layout, t) => oralPathPoint(layout, t), oralRgb, 4.2 * L.S, 0.32 + (state.oralFlow || state.energy) * 0.38);
  drawParticleSet(ctx, L, particles.filter((p) => p.path === 'oral'), (layout, t) => oralPathPoint(layout, t), oralRgb, 2.2 * L.S);
  ctx.restore();
  ctx.restore();
}

function traceNasalDescent(ctx, L) {
  ctx.moveTo(L.p(24, 12).x, L.p(24, 12).y);
  ctx.lineTo(L.p(10, 16).x, L.p(10, 16).y);
  ctx.quadraticCurveTo(L.p(-4, 48).x, L.p(-4, 48).y, L.p(0, 90).x, L.p(0, 90).y);
  ctx.quadraticCurveTo(L.p(2, 128).x, L.p(2, 128).y, L.p(8, 152).x, L.p(8, 152).y);
  ctx.lineTo(L.p(24, 150).x, L.p(24, 150).y);
  ctx.quadraticCurveTo(L.p(20, 88).x, L.p(20, 88).y, L.p(26, 22).x, L.p(26, 22).y);
}

function traceNasalAirway(ctx, L) {
  ctx.beginPath();
  ctx.moveTo(L.p(148, -8).x, L.p(148, -8).y);
  ctx.bezierCurveTo(L.p(132, -32).x, L.p(132, -32).y, L.p(96, -50).x, L.p(96, -50).y, L.p(64, -42).x, L.p(64, -42).y);
  ctx.bezierCurveTo(L.p(36, -36).x, L.p(36, -36).y, L.p(18, -22).x, L.p(18, -22).y, L.p(16, -4).x, L.p(16, -4).y);
  ctx.quadraticCurveTo(L.p(18, 10).x, L.p(18, 10).y, L.p(28, 12).x, L.p(28, 12).y);
  ctx.lineTo(L.p(10, 16).x, L.p(10, 16).y);
  ctx.quadraticCurveTo(L.p(-4, 48).x, L.p(-4, 48).y, L.p(0, 90).x, L.p(0, 90).y);
  ctx.quadraticCurveTo(L.p(2, 128).x, L.p(2, 128).y, L.p(8, 152).x, L.p(8, 152).y);
  ctx.lineTo(L.p(24, 150).x, L.p(24, 150).y);
  ctx.quadraticCurveTo(L.p(22, 90).x, L.p(22, 90).y, L.p(28, 18).x, L.p(28, 18).y);
  ctx.lineTo(L.p(128, 12).x, L.p(128, 12).y);
  ctx.quadraticCurveTo(L.p(140, 2).x, L.p(140, 2).y, L.p(148, -8).x, L.p(148, -8).y);
  ctx.closePath();
}

function drawParticleSet(ctx, L, particles, sampler, rgb, laneScale) {
  for (const p of particles) {
    const pt = offsetAlong(sampler(L, p.t), sampler(L, clamp(p.t + 0.03)), p.lane * laneScale);
    const ahead = offsetAlong(sampler(L, clamp(p.t + p.streak)), sampler(L, clamp(p.t + p.streak + 0.03)), p.lane * laneScale);
    ctx.strokeStyle = rgba(rgb, p.alpha * 0.85);
    ctx.lineWidth = p.radius * L.S * 0.55;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(ahead.x, ahead.y);
    ctx.stroke();
    ctx.fillStyle = rgba(rgb, Math.min(0.45, p.alpha * 0.5));
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, p.radius * L.S * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(rgb, Math.min(0.18, p.alpha * 0.22));
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, p.radius * L.S * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStreamTube(ctx, L, sampler, rgb, width, alpha) {
  ctx.strokeStyle = rgba(rgb, alpha);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const pt = sampler(L, i / 28);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
}

function offsetAlong(pt, ahead, offset) {
  const dx = ahead.x - pt.x;
  const dy = ahead.y - pt.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: pt.x + (-dy / len) * offset,
    y: pt.y + (dx / len) * offset,
  };
}

function drawExteriorAir(ctx, L, state, timeMs, alphaScale = 1) {
  if (!(state.flowRate > 0.04)) return;
  const particles = exteriorCloseupParticles({
    timeMs,
    flowDirection: state.flowDirection,
    flowRate: state.flowRate,
    count: 420,
  });
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const pt = L.p(p.x, p.y);
    ctx.fillStyle = rgba(AIRFLOW_RGB, p.alpha * 0.95 * alphaScale);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, p.radius * L.S * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(AIRFLOW_RGB, p.alpha * 0.2 * alphaScale);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, p.radius * L.S * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMouthEmission(ctx, L, state, timeMs, rgb) {
  const particles = mouthEmissionParticles({
    timeMs,
    flowDirection: state.flowDirection,
    flowRate: state.flowRate,
    rmsAmplitude: state.rmsAmplitude,
    phonated: state.phonated,
    nasalShare: state.nasalShare,
    frequencyHertz: state.frequencyHertz || 0,
  });
  const drive = clamp(Math.max(state.flowRate, state.rmsAmplitude * 6.5, state.energy));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (drive > 0.08 && Math.abs(state.flowDirection) > 0.12) {
    const reach = Math.max(L.W * 0.7, 420 * L.S);
    const outX = L.lips.x + reach;
    const inbound = state.flowDirection < 0;
    const fromX = inbound ? outX : L.lips.x;
    const toX = inbound ? L.lips.x : outX;
    const mist = ctx.createLinearGradient(fromX, L.lips.y, toX, L.lips.y + 8 * L.S);
    mist.addColorStop(0, rgba(AIRFLOW_RGB, inbound ? 0.05 : 0.32 + drive * 0.22));
    mist.addColorStop(0.4, rgba(AIRFLOW_RGB, inbound ? 0.12 : 0.1));
    mist.addColorStop(1, rgba(AIRFLOW_RGB, inbound ? 0.28 + drive * 0.18 : 0));
    ctx.fillStyle = mist;
    ctx.beginPath();
    ctx.moveTo(L.lips.x, L.lips.y - 10 * L.S);
    ctx.lineTo(L.lips.x + reach, L.lips.y - (64 + drive * 88) * L.S);
    ctx.lineTo(L.lips.x + reach, L.lips.y + (52 + drive * 72) * L.S);
    ctx.lineTo(L.lips.x, L.lips.y + 12 * L.S);
    ctx.closePath();
    ctx.fill();
  }
  const travel = Math.max(L.W * 0.7, 420 * L.S);
  for (const p of particles) {
    const origin = p.path === 'nasalJet' ? L.naris : L.lips;
    const lift = p.path === 'nasalJet' ? -40 : 10;
    const spread = (p.lane || 0) * (32 + p.t * 130) * L.S;
    const x = origin.x + p.t * travel;
    const y = origin.y + p.t * lift * L.S + spread;
    const r = p.radius * L.S * breathPlumeScale(p.t);
    ctx.fillStyle = rgba(AIRFLOW_RGB, Math.min(0.95, p.alpha));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(AIRFLOW_RGB, p.alpha * 0.4);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRadiatingWaves(ctx, L, state, timeMs, rgb) {
  if (!state.phonated || state.energy < 0.08) return;
  const f0 = state.frequencyHertz > 60 ? state.frequencyHertz : 0;
  if (!f0) return;
  const visualHz = Math.max(1.6, Math.min(14, f0 / 48));
  const maxR = Math.max(L.W, L.H) * 0.85;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (let ring = 0; ring < 7; ring++) {
    const phase = ((timeMs / 1000) * visualHz + ring / 7) % 1;
    const radius = 12 * L.S + phase * maxR;
    const alpha = state.energy * soundFieldAttenuation(phase) * 0.55;
    ctx.strokeStyle = rgba(rgb, alpha);
    ctx.lineWidth = Math.max(0.6, (2.4 - phase * 1.8) * L.S);
    ctx.beginPath();
    ctx.ellipse(L.lips.x, L.lips.y, radius * 1.15, radius * 0.62, -0.18, -0.55, 0.85);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHeadSensationField(ctx, L, state, timeMs) {
  const amount = clamp(state.headSensationAmount || state.headLoopAmount || 0);
  if (amount < 0.04) return;
  const pulse = state.phonated ? 0.7 + 0.3 * Math.sin((timeMs || 0) * 0.008) : 0.85;
  const alpha = (0.18 + 0.46 * amount) * pulse;
  const stem = L.p(SAGITTAL_LOCAL.brainstemX, SAGITTAL_LOCAL.brainstemY);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgbaVoice(HEAD_VOICE_RGB, alpha);
  ctx.lineWidth = (2.2 + amount * 2.2) * L.S;
  ctx.beginPath();
  ctx.ellipse(stem.x, stem.y, 24 * L.S, 32 * L.S, 0.08, 0, Math.PI * 2);
  ctx.stroke();
  const core = ctx.createRadialGradient(stem.x, stem.y, 4 * L.S, stem.x, stem.y, 36 * L.S);
  core.addColorStop(0, rgbaVoice(HEAD_VOICE_RGB, 0.22 + amount * 0.4));
  core.addColorStop(1, rgbaVoice(HEAD_VOICE_RGB, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(stem.x, stem.y, 26 * L.S, 34 * L.S, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHeadResonanceLoop(ctx, L, state, timeMs) {
  drawHeadSensationField(ctx, L, state, timeMs);
}

function drawLabels(ctx, L, state = {}) {
  const right = L.W - 18;
  label(ctx, 'brainstem', right, Math.max(28, L.p(SAGITTAL_LOCAL.brainstemX, SAGITTAL_LOCAL.brainstemY).y - 8), L.p(SAGITTAL_LOCAL.brainstemX, SAGITTAL_LOCAL.brainstemY).x, L.p(SAGITTAL_LOCAL.brainstemX, SAGITTAL_LOCAL.brainstemY).y, 'right');
  label(ctx, 'nasal', right, 72, L.p(86, -28).x, L.p(86, -28).y, 'right');
  label(ctx, 'oral', right, 108, L.p(92, 28).x, L.p(92, 28).y, 'right');
  label(ctx, 'tongue', right, 144, L.p(78, 48).x, L.p(78, 48).y, 'right');
  label(ctx, 'throat chamber', 16, L.H * 0.42, L.p(SAGITTAL_LOCAL.throatResonanceX, SAGITTAL_LOCAL.throatResonanceY).x, L.p(SAGITTAL_LOCAL.throatResonanceX, SAGITTAL_LOCAL.throatResonanceY).y, 'left');
  label(ctx, 'larynx', 16, L.H - 40, L.p(10, 152).x, L.p(10, 152).y, 'left');
  if ((state.headSensationAmount || state.headLoopAmount || 0) > 0.12 && state.phonated) {
    label(ctx, 'ear sensation', 16, L.ear.y - 22 * L.S, L.ear.x - 10 * L.S, L.ear.y, 'left');
  }
  if ((state.mixedVibration?.amount || 0) > 0.12) {
    label(ctx, 'mixed vibration', right, 180, L.p(12, 70).x, L.p(12, 70).y, 'right');
  }
}

function label(ctx, text, x, y, tx, ty, align = 'left') {
  ctx.strokeStyle = 'rgba(220, 232, 240, 0.45)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x + (align === 'left' ? 8 : -8), y - 3);
  ctx.stroke();
  ctx.save();
  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(5, 8, 12, 0.94)';
  ctx.lineWidth = 4.6;
  if (typeof ctx.strokeText === 'function') ctx.strokeText(text, x, y);
  ctx.fillStyle = 'rgba(248, 252, 255, 1)';
  ctx.fillText(text, x, y);
  ctx.restore();
}
