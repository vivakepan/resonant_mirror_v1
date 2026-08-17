/**
 * Deterministic anatomy drawing from provenance-tagged visual states.
 *
 * The renderer may transform evidence; it may never create it.
 * Missing/stale evidence stays unknown / rest-pose. Decorative particle
 * positions are time-seeded and do not change evidentiary meaning.
 *
 * Breathing displacements are simulated from an inferred respiratory class.
 * They are not measured airflow, lung volume, or diaphragm travel.
 */

import { ANATOMY_STRUCTURES, REQUIRED_STRUCTURE_IDS } from './structures.js';
import { poseFromBreathInputs, REST_POSE } from './breathKinematics.js';
import { visualFrequencyFromPitch } from './vocalFoldDynamics.js';
import { frequencyToColor } from '../audio/piano.js';
import { vowelMapFromFormants } from '../resonance/vowelMap.js';
import { chamberResonanceFromFormants } from '../resonance/chamberResonance.js';
import {
  drawSagittalHead,
  nasalCavityWaypoints,
  oralCavityWaypoints,
  sagittalCameraForFigure,
  SAGITTAL_LOCAL,
  skullCloseupState,
} from './skullCloseup.js';
import { breathPlumeScale, soundFieldAttenuation } from './soundField.js';
export { breathPlumeScale, soundFieldAttenuation } from './soundField.js';
import {
  AIRFLOW_RGB,
  AIRWAY_COLUMN_RGB,
  BONE_RGB,
  CHEST_CHAMBER_RGB,
  CHEST_VOICE_RGB,
  HEAD_VOICE_RGB,
  LARYNX_RGB,
  LUNG_RGB,
  MUSCLE_RGB,
  OUTLINE_RGB,
  SKULL_CHAMBER_RGB,
  STRUCTURE_VIBRATION_RGB,
  THROAT_CHAMBER_RGB,
  TRACT_RGB,
  registerVoiceAmounts,
  mixedSystemVibration,
  structureVibrationFromVoice,
  rgbaVoice,
} from './registerColors.js';
import { inferHumming } from '../resonance/humming.js';

export const FIGURE_ZOOM_RANGE = Object.freeze({ min: 0.48, max: 1.55 });

export function nextFigureZoom(current, deltaY) {
  const factor = deltaY > 0 ? 0.91 : 1.1;
  return Math.max(FIGURE_ZOOM_RANGE.min, Math.min(FIGURE_ZOOM_RANGE.max, current * factor));
}

function stateMap(visualStates) {
  const map = new Map();
  for (const s of visualStates) map.set(s.visualName, s);
  return map;
}

function assertiveness(state) {
  if (!state || state.evidenceClass === 'unknown' || state.value == null) return 0;
  if (typeof state.value === 'number') {
    return Math.max(0, Math.min(1, state.assertiveness ?? state.confidence ?? state.value));
  }
  return state.assertiveness ?? state.confidence ?? 1;
}

function num(state) {
  if (!state || state.evidenceClass === 'unknown' || state.value == null) return 0;
  return typeof state.value === 'number' ? state.value : 0;
}

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function streamSign(direction, index = 0) {
  if (Math.abs(direction) >= 0.12) return Math.sign(direction);
  return index % 2 === 0 ? 1 : -1;
}

function pitchLinkedSpeed(baseSpeed, { phonated = false, frequencyHertz = 0, timeMs = 0 } = {}) {
  if (!phonated || !(frequencyHertz > 60)) return baseSpeed;
  const visualHz = visualFrequencyFromPitch(frequencyHertz);
  return baseSpeed * (0.9 + 0.2 * (0.5 + 0.5 * Math.sin((timeMs / 1000) * visualHz * Math.PI * 2)));
}

/** Twelve rib pairs: 1–7 true, 8–10 false, 11–12 floating. */
export const RIB_PAIR_COUNT = 12;
const RIB_BLUEPRINT = Object.freeze([
  { index: 1, t: 0.00, width: 0.46, kind: 'true', obliquity: 0.05, anterior: 0.20 },
  { index: 2, t: 0.08, width: 0.58, kind: 'true', obliquity: 0.09, anterior: 0.17 },
  { index: 3, t: 0.17, width: 0.70, kind: 'true', obliquity: 0.13, anterior: 0.14 },
  { index: 4, t: 0.26, width: 0.80, kind: 'true', obliquity: 0.17, anterior: 0.12 },
  { index: 5, t: 0.35, width: 0.89, kind: 'true', obliquity: 0.22, anterior: 0.11 },
  { index: 6, t: 0.45, width: 0.96, kind: 'true', obliquity: 0.27, anterior: 0.10 },
  { index: 7, t: 0.55, width: 1.00, kind: 'true', obliquity: 0.33, anterior: 0.12 },
  { index: 8, t: 0.64, width: 0.95, kind: 'false', obliquity: 0.38, anterior: 0.24 },
  { index: 9, t: 0.73, width: 0.86, kind: 'false', obliquity: 0.44, anterior: 0.34 },
  { index: 10, t: 0.81, width: 0.76, kind: 'false', obliquity: 0.48, anterior: 0.44 },
  { index: 11, t: 0.89, width: 0.56, kind: 'floating', obliquity: 0.40, anterior: 0.70 },
  { index: 12, t: 0.96, width: 0.40, kind: 'floating', obliquity: 0.34, anterior: 0.82 },
]);

export function anatomyLayout(W, H, breath = {}, view = {}) {
  const pose = breath.pose || poseFromBreathInputs(breath);
  const figureZoom = clamp(Number(view.figureZoom) || 1, FIGURE_ZOOM_RANGE.min, FIGURE_ZOOM_RANGE.max);
  const cx = W * 0.48;
  const regionScale = 1.58;
  const scale = Math.min(W / 430, H / 700) * regionScale * figureZoom;
  const horizontalScale = clamp(W / 760, 1, 1.8);
  const headWidthCompensation = Math.sqrt(horizontalScale);
  const S = (n) => n * scale;

  const ribExp = 1 + 0.18 * pose.ribExpansion;
  const pump = pose.clavicleRise;
  const lungVol = pose.lungVolume;
  const abd = pose.abdominalExpansion;
  const dOff = pose.diaphragmDescent * S(36);

  const skullRy = S(78);
  const vaultTop = Math.max(24, H * 0.032);
  const skullY = vaultTop + skullRy;
  const skullRx = S(66) / headWidthCompensation;
  const mouthOpen = clamp(pose.mouthOpen ?? 0.12);
  const jawDrop = clamp(pose.jawDrop ?? mouthOpen * 0.55);
  const jawY = skullY + S(62) + S(52) * jawDrop;
  const shoulderY = jawY + S(30) + pump * S(8);
  const ribY0 = shoulderY + S(10) + pump * S(6);
  const ribY1 = ribY0 + S(168) + dOff * 0.22;
  const ribRx = S(96) * ribExp;
  const pairs = RIB_BLUEPRINT.map((spec) => {
    const pumpHandle = clamp(1 - spec.t * 1.15);
    const bucketHandle = clamp(spec.t * 1.25);
    const y = ribY0 + spec.t * (ribY1 - ribY0) - pumpHandle * pump * S(9);
    const rx = ribRx * spec.width * (1 + 0.14 * bucketHandle * pose.ribExpansion);
    return {
      ...spec,
      y,
      rx,
      pumpHandle,
      bucketHandle,
    };
  });
  const lungScale = 0.74 + 0.32 * lungVol;
  const lungLateral = 1 + 0.1 * pose.ribExpansion;
  const apexLift = lungVol * S(7);
  const baseDrop = dOff * 0.55 + lungVol * S(10);
  const rightLung = {
    side: -1,
    lobes: 3,
    x: cx - S(36) * lungLateral,
    y: (ribY0 + ribY1) * 0.5 + S(4) - lungVol * S(6),
    rx: S(40) * lungScale * lungLateral,
    ry: S(72) * lungScale,
    apexY: ribY0 - S(16) - apexLift,
    baseY: ribY1 - S(6) + baseDrop - S(8),
  };
  const leftLung = {
    side: 1,
    lobes: 2,
    x: cx + S(40) * lungLateral,
    y: (ribY0 + ribY1) * 0.5 + S(10) - lungVol * S(5),
    rx: S(36) * lungScale * lungLateral,
    ry: S(66) * lungScale,
    apexY: ribY0 - S(12) - apexLift,
    baseY: ribY1 + S(2) + baseDrop,
    notchX: cx + S(10),
    notchY: ribY0 + (ribY1 - ribY0) * 0.42,
  };
  const lungRx = Math.max(rightLung.rx, leftLung.rx);
  const lungRy = Math.max(rightLung.ry, leftLung.ry);
  const oralRy = S(6 + mouthOpen * 64);
  const airwayX = cx + S(14);
  const hyoidY = jawY + S(6);
  const larynxY = jawY + S(16);
  const diaphragmY = ribY1 + S(8) + dOff;
  const abdomenY1 = diaphragmY + S(122) + abd * S(12);
  const heartX = cx + S(22);
  const heartY = ribY0 + (ribY1 - ribY0) * 0.36;

  return {
    W,
    H,
    cx,
    scale,
    regionScale,
    figureZoom,
    horizontalScale,
    S,
    pose,
    skull: { x: cx, y: skullY, rx: skullRx, ry: skullRy },
    brain: {
      x: cx,
      y: skullY - S(16),
      rx: skullRx * 0.84,
      ry: skullRy * 0.62,
      stemY: skullY + S(20),
      stemR: S(8),
    },
    orbit: { y: skullY + S(6), rx: S(11) / headWidthCompensation, ry: S(8), gap: S(22) / headWidthCompensation },
    nasal: { x: cx, y: skullY + S(22), rx: S(9) / headWidthCompensation, ry: S(16) },
    oral: { x: cx, y: skullY + S(58) + S(14) * jawDrop, rx: S(22 + mouthOpen * 26) / headWidthCompensation, ry: oralRy },
    jaw: { x: cx, y: jawY, w: skullRx * 0.92 },
    mouth: { x: cx, y: skullY + S(62) + S(18) * jawDrop, rx: S(12 + mouthOpen * 28) / headWidthCompensation, ry: S(2 + mouthOpen * 58), open: mouthOpen },
    pharynx: { x: airwayX, y0: skullY + S(48), y1: larynxY - S(4), w: S(24) },
    hyoid: { y: hyoidY },
    larynx: { x: airwayX, y: larynxY, r: S(14), glottisOpen: pose.glottisOpen },
    trachea: { x: airwayX, y0: larynxY + S(12), y1: ribY0 + S(28), w: S(16) },
    neck: { x: cx, y0: skullY + S(70), y1: shoulderY - S(4), w: S(44) },
    shoulders: { y: shoulderY, span: S(118) + pump * S(8) },
    clavicle: { y: shoulderY + S(6), span: S(96) },
    ribs: { y0: ribY0, y1: ribY1, rx: ribRx, count: RIB_PAIR_COUNT, pairs },
    lungs: {
      y: (rightLung.y + leftLung.y) * 0.5,
      rx: lungRx,
      ry: lungRy,
      gap: S(18),
      right: rightLung,
      left: leftLung,
    },
    heart: { x: heartX, y: heartY, rx: S(24), ry: S(31) },
    aorta: {
      rootX: heartX + S(10),
      rootY: heartY - S(24),
      archY: ribY0 + S(22),
      descendingX: cx + S(25),
      bottomY: abdomenY1 - S(18),
    },
    venaCava: {
      x: cx - S(18),
      topY: shoulderY - S(8),
      heartY: heartY - S(4),
      bottomY: abdomenY1 - S(18),
    },
    neckVessels: {
      y0: skullY + S(38),
      y1: shoulderY + S(6),
      arterialGap: S(14),
      venousGap: S(21),
    },
    bronchi: { y: ribY0 + S(36) },
    sternum: { y0: ribY0 + S(8), y1: ribY1 - S(18) },
    xiphoid: { y: ribY1 - S(8) },
    diaphragm: { y: diaphragmY, span: ribRx * 0.92, dome: S(26) * (1 - 0.72 * pose.diaphragmDescent) },
    abdomen: { y0: diaphragmY + S(10), y1: abdomenY1, rx: ribRx * (0.72 + 0.18 * abd) },
    torso: { y: (ribY0 + ribY1) * 0.5 },
    spine: { y0: skullY + S(20), y1: abdomenY1 - S(8) },
  };
}

export const VAGUS_STRUCTURE_IDS = Object.freeze([
  'vagusNerve',
  'superiorLaryngealNerve',
  'recurrentLaryngealNerve',
  'cardiacVagalBranches',
  'pulmonaryVagalPlexus',
  'esophagealVagalPlexus',
  'phrenicNerves',
]);

export function vagusAnatomyPaths(W, H, breath = {}, view = {}) {
  const L = anatomyLayout(W, H, breath, view);
  const branch = (points, id, system = 'vagus') => ({
    id,
    system,
    evidenceClass: 'simulated',
    points,
  });
  const leftX = L.cx + L.S(19);
  const rightX = L.cx - L.S(19);
  const brainstemY = L.brain?.stemY ?? (L.skull.y + L.S(8));
  const neckTop = L.skull.y + L.S(42);
  const neckBottom = L.shoulders.y + L.S(4);
  const lungRootY = L.lungs.y - L.S(4);
  const diaphragmY = L.diaphragm.y;

  return {
    evidenceClass: 'simulated',
    label: 'generic neuro-respiratory anatomy; nerve activity is not measured',
    caveat: 'The phrenic nerves provide the diaphragm’s motor drive; the vagus carries visceral sensory and parasympathetic pathways.',
    branches: [
      branch([
        { x: L.cx + L.S(6), y: brainstemY },
        { x: leftX, y: neckTop },
        { x: leftX + L.S(3), y: neckBottom },
        { x: L.cx + L.S(21), y: lungRootY },
        { x: L.cx + L.S(9), y: diaphragmY - L.S(7) },
        { x: L.cx + L.S(8), y: L.abdomen.y1 - L.S(12) },
      ], 'leftVagusTrunk'),
      branch([
        { x: L.cx - L.S(6), y: brainstemY },
        { x: rightX, y: neckTop },
        { x: rightX - L.S(3), y: neckBottom },
        { x: L.cx - L.S(21), y: lungRootY },
        { x: L.cx - L.S(9), y: diaphragmY - L.S(7) },
        { x: L.cx - L.S(8), y: L.abdomen.y1 - L.S(12) },
      ], 'rightVagusTrunk'),
      branch([
        { x: leftX, y: L.hyoid.y - L.S(3) },
        { x: L.cx + L.S(8), y: L.larynx.y - L.S(8) },
        { x: L.cx + L.S(5), y: L.larynx.y },
      ], 'leftSuperiorLaryngeal'),
      branch([
        { x: rightX, y: L.hyoid.y - L.S(3) },
        { x: L.cx - L.S(8), y: L.larynx.y - L.S(8) },
        { x: L.cx - L.S(5), y: L.larynx.y },
      ], 'rightSuperiorLaryngeal'),
      branch([
        { x: leftX + L.S(3), y: neckBottom },
        { x: L.aorta.descendingX + L.S(13), y: L.aorta.archY + L.S(12) },
        { x: L.aorta.descendingX, y: L.aorta.archY + L.S(23) },
        { x: L.cx + L.S(8), y: L.larynx.y + L.S(8) },
      ], 'leftRecurrentLaryngeal'),
      branch([
        { x: rightX - L.S(3), y: neckBottom - L.S(9) },
        { x: L.cx - L.S(54), y: L.shoulders.y + L.S(11) },
        { x: L.cx - L.S(31), y: L.shoulders.y + L.S(23) },
        { x: L.cx - L.S(8), y: L.larynx.y + L.S(8) },
      ], 'rightRecurrentLaryngeal'),
      branch([
        { x: leftX + L.S(2), y: neckBottom },
        { x: L.heart.x + L.S(5), y: L.heart.y - L.S(18) },
      ], 'cardiacVagalBranch'),
      branch([
        { x: rightX - L.S(2), y: neckBottom },
        { x: L.heart.x - L.S(8), y: L.heart.y - L.S(11) },
      ], 'cardiacVagalBranch'),
      branch([
        { x: L.cx + L.S(21), y: lungRootY },
        { x: L.cx + L.lungs.gap + L.lungs.rx * 0.68, y: L.lungs.y },
      ], 'pulmonaryVagalPlexus'),
      branch([
        { x: L.cx - L.S(21), y: lungRootY },
        { x: L.cx - L.lungs.gap - L.lungs.rx * 0.68, y: L.lungs.y },
      ], 'pulmonaryVagalPlexus'),
      branch([
        { x: L.cx + L.S(9), y: lungRootY + L.S(18) },
        { x: L.cx, y: diaphragmY - L.S(4) },
        { x: L.cx + L.S(5), y: L.abdomen.y1 - L.S(16) },
      ], 'esophagealVagalPlexus'),
      branch([
        { x: L.cx + L.S(29), y: neckTop + L.S(5) },
        { x: L.cx + L.S(38), y: neckBottom },
        { x: L.cx + L.S(44), y: L.lungs.y + L.S(12) },
        { x: L.cx + L.diaphragm.span * 0.48, y: diaphragmY },
      ], 'leftPhrenic', 'phrenic'),
      branch([
        { x: L.cx - L.S(29), y: neckTop + L.S(5) },
        { x: L.cx - L.S(38), y: neckBottom },
        { x: L.cx - L.S(44), y: L.lungs.y + L.S(12) },
        { x: L.cx - L.diaphragm.span * 0.48, y: diaphragmY },
      ], 'rightPhrenic', 'phrenic'),
    ],
  };
}

export function larynxHitRegion(W, H, plan) {
  const L = anatomyLayout(W, H, plan?.simulatedBreath || {}, plan?.view || {});
  const projection = plan?.view?.projectionScale ?? 1;
  return {
    x: L.larynx.x,
    y: L.larynx.y,
    radiusX: Math.max(12, L.S(25) * projection * L.horizontalScale),
    radiusY: Math.max(22, L.S(25)),
  };
}

export function pointHitsLarynx(x, y, W, H, plan) {
  const hit = larynxHitRegion(W, H, plan);
  const dx = (x - hit.x) / hit.radiusX;
  const dy = (y - hit.y) / hit.radiusY;
  return dx * dx + dy * dy <= 1;
}

export function skullHitRegion(W, H, plan) {
  const L = anatomyLayout(W, H, plan?.simulatedBreath || {}, plan?.view || {});
  const projection = plan?.view?.projectionScale ?? 1;
  return {
    x: L.skull.x,
    y: L.skull.y,
    radiusX: Math.max(18, L.skull.rx * 1.2 * projection * L.horizontalScale),
    radiusY: Math.max(28, L.skull.ry * 1.2),
  };
}

export function pointHitsSkull(x, y, W, H, plan) {
  const hit = skullHitRegion(W, H, plan);
  const dx = (x - hit.x) / hit.radiusX;
  const dy = (y - hit.y) / hit.radiusY;
  return dx * dx + dy * dy <= 1;
}

export function chestHitRegion(W, H, plan) {
  const L = anatomyLayout(W, H, plan?.simulatedBreath || {}, plan?.view || {});
  const projection = plan?.view?.projectionScale ?? 1;
  const y0 = L.shoulders.y + L.S(6);
  const y1 = L.abdomen.y1 - L.S(10);
  return {
    x: L.cx,
    y: (L.ribs.y0 + L.ribs.y1) * 0.52,
    radiusX: Math.max(30, L.ribs.rx * 0.96 * projection * L.horizontalScale),
    radiusY: Math.max(40, (y1 - y0) * 0.46),
  };
}

export function pointHitsChest(x, y, W, H, plan) {
  const hit = chestHitRegion(W, H, plan);
  const dx = (x - hit.x) / hit.radiusX;
  const dy = (y - hit.y) / hit.radiusY;
  return dx * dx + dy * dy <= 1;
}

export function nextChestZoom(current, deltaY) {
  const factor = deltaY > 0 ? 0.91 : 1.1;
  return Math.max(0.42, Math.min(2.8, current * factor));
}

export function drawChestCloseup(ctx, W, H, plan = {}, { zoom = 1 } = {}) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, W, H);

  const pose = plan.simulatedBreath?.pose || REST_POSE;
  const layoutW = Math.max(420, Math.round(W * 0.7));
  const layoutH = Math.max(720, H);
  const L = anatomyLayout(layoutW, layoutH, { pose });
  const focusY = (L.ribs.y0 + L.diaphragm.y) * 0.52;
  const spanX = L.ribs.rx * 2.4;
  const spanY = (L.abdomen.y1 - L.shoulders.y) + L.S(28);
  const fit = Math.min(W / spanX, H / spanY) * 1.06 * zoom;
  const closePlan = {
    ...plan,
    simulatedBreath: { pose, evidenceClass: 'simulated', class: plan.simulatedBreath?.class || null },
    inferredRegistration: plan.inferredRegistration || { chestGlow: 0 },
    circulatory: plan.circulatory?.active
      ? plan.circulatory
      : {
        active: true,
        pulseScale: 1,
        particles: [],
        respiratoryCoupling: clamp(pose.flowRate || 0),
      },
    airflow: {
      evidenceClass: 'simulated',
      direction: pose.flowDirection || 0,
      phonated: plan.airflow?.phonated || plan.simulatedBreath?.class === 'phonated_exhale',
      flowRate: pose.flowRate || 0,
      nasalShare: pose.nasalShare ?? 0.2,
      particles: Array.isArray(plan.airflow?.particles) ? plan.airflow.particles : [],
    },
    breathResonance: plan.breathResonance || { active: true, energy: clamp(pose.flowRate || 0), phase: pose.lungVolume || 0 },
    timeMs: plan.timeMs || 0,
    vagus: plan.vagus,
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.translate(W / 2, H * 0.46);
  ctx.scale(fit, fit);
  ctx.translate(-L.cx, -focusY);

  drawSoftBody(ctx, L, 0.55);
  drawSpine(ctx, L, closePlan);
  drawRegisterVoiceFields(ctx, L, closePlan);
  drawAbdomen(ctx, L, 0.55);
  drawClavicles(ctx, L);
  drawRibCage(ctx, L);
  drawLungs(ctx, L, true);
  drawCirculatorySystem(ctx, L, closePlan.circulatory);
  drawSternum(ctx, L);
  drawDiaphragm(ctx, L);
  drawTrachea(ctx, L);
  drawAirwayColumn(ctx, L, closePlan);
  drawLarynx(ctx, L, closePlan);
  drawAirflow(ctx, L, closePlan);
  drawInternalResonance(ctx, L, closePlan);
  drawStructureVibration(ctx, L, closePlan);
  drawChestCloseupStructureLabels(ctx, L);
  ctx.restore();

  drawChestCloseupHud(ctx, W, H, closePlan, pose);
}

function polylinePoint(pts, t) {
  if (!pts.length) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const u = clamp(t) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(u));
  const f = u - i;
  const s = (1 - Math.cos(f * Math.PI)) / 2;
  return {
    x: pts[i].x + (pts[i + 1].x - pts[i].x) * s,
    y: pts[i].y + (pts[i + 1].y - pts[i].y) * s,
  };
}

function sagittalToFigure(L, x, y) {
  const cam = sagittalCameraForFigure(L);
  return { x: cam.cx + x * cam.S, y: cam.cy + y * cam.S };
}

function tractAirflowWaypoints(L, local) {
  const exit = local[local.length - 1];
  const larynx = sagittalToFigure(L, local[0][0], local[0][1]);
  const lips = sagittalToFigure(L, exit[0], exit[1]);
  const outside = { x: lips.x + L.S(96), y: lips.y };
  const head = local.slice().reverse().map(([x, y]) => sagittalToFigure(L, x, y));
  return [
    outside,
    lips,
    ...head.slice(1),
    { x: larynx.x, y: L.trachea.y0 + L.S(8) },
    { x: (larynx.x + L.cx) * 0.5, y: (L.trachea.y0 + L.bronchi.y) * 0.55 },
    { x: L.trachea.x, y: L.bronchi.y },
  ];
}

export function airflowWaypoints(L, path = 'oral') {
  const left = path === 'bronchusL';
  const right = path === 'bronchusR';
  const nasal = path === 'nasal';
  if (nasal) {
    return tractAirflowWaypoints(L, nasalCavityWaypoints());
  }
  if (left || right) {
    const side = left ? -1 : 1;
    return [
      { x: L.trachea.x, y: L.bronchi.y },
      { x: L.cx + side * L.S(10), y: L.bronchi.y + L.S(8) },
      { x: L.cx + side * (L.lungs.gap + L.lungs.rx * 0.35), y: L.lungs.y - L.lungs.ry * 0.15 },
      { x: L.cx + side * (L.lungs.gap + L.lungs.rx * 0.7), y: L.lungs.y + L.lungs.ry * 0.25 },
    ];
  }
  return tractAirflowWaypoints(
    L,
    oralCavityWaypoints(L.pose?.jawDrop ?? 0.12, L.pose?.mouthOpen ?? 0.12),
  );
}

/** Path parameter 0 = outside the face, 1 = inside the lungs. */
export function airflowPathPoint(L, t, path = 'oral') {
  return polylinePoint(airflowWaypoints(L, path), t);
}

export function circulationWaypoints(L, path) {
  const h = L.heart;
  if (path === 'aorta') {
    return [
      { x: h.x + L.S(7), y: h.y - L.S(13) },
      { x: L.aorta.rootX, y: L.aorta.archY + L.S(8) },
      { x: L.cx + L.S(25), y: L.aorta.archY },
      { x: L.aorta.descendingX, y: L.lungs.y + L.S(20) },
      { x: L.aorta.descendingX, y: L.aorta.bottomY },
    ];
  }
  if (path === 'venaCava') {
    return [
      { x: L.venaCava.x, y: L.venaCava.bottomY },
      { x: L.venaCava.x, y: h.y + L.S(5) },
      { x: h.x - L.S(7), y: h.y - L.S(5) },
    ];
  }
  if (path.startsWith('pulmonaryArtery') || path.startsWith('pulmonaryVein')) {
    const side = path.endsWith('L') ? -1 : 1;
    const artery = path.startsWith('pulmonaryArtery');
    const lung = side < 0 ? L.lungs.right : L.lungs.left;
    const lungX = lung.x;
    const points = [
      { x: h.x + side * L.S(3), y: h.y - L.S(9) },
      { x: L.cx + side * L.S(13), y: L.bronchi.y + L.S(12) },
      { x: lungX, y: lung.y - L.S(8) },
      { x: lungX + side * lung.rx * 0.48, y: lung.y + L.S(12) },
    ];
    return artery ? points : [...points].reverse();
  }
  if (path.startsWith('carotid') || path.startsWith('jugular')) {
    const side = path.endsWith('L') ? -1 : 1;
    const jugular = path.startsWith('jugular');
    const gap = jugular ? L.neckVessels.venousGap : L.neckVessels.arterialGap;
    const points = [
      { x: L.cx + side * L.S(12), y: L.aorta.archY + L.S(4) },
      { x: L.cx + side * gap, y: L.neckVessels.y1 },
      { x: L.cx + side * gap * 0.82, y: L.neckVessels.y0 },
    ];
    return jugular ? [...points].reverse() : points;
  }
  return [];
}

export function circulationPathPoint(L, t, path) {
  return polylinePoint(circulationWaypoints(L, path), t);
}

export function circulationParticles({ timeMs = 0, active = true, speedScale = 1 } = {}) {
  if (!active) return [];
  const paths = [
    ['aorta', 'arterial', 7],
    ['venaCava', 'venous', 6],
    ['pulmonaryArteryL', 'venous', 4],
    ['pulmonaryArteryR', 'venous', 4],
    ['pulmonaryVeinL', 'arterial', 4],
    ['pulmonaryVeinR', 'arterial', 4],
    ['carotidL', 'arterial', 3],
    ['carotidR', 'arterial', 3],
    ['jugularL', 'venous', 3],
    ['jugularR', 'venous', 3],
  ];
  const out = [];
  for (const [path, kind, count] of paths) {
    for (let i = 0; i < count; i++) {
      const offset = i / count + ((i * 13) % 7) / 70;
      const t = (offset + timeMs * 0.0002 * speedScale) % 1;
      out.push({
        path,
        kind,
        t,
        alpha: 0.32 + 0.45 * Math.sin(t * Math.PI),
        radius: kind === 'arterial' ? 1.85 : 1.65,
      });
    }
  }
  return out;
}

export function airflowParticles({
  direction,
  timeMs = 0,
  count = 240,
  phonated = false,
  flowRate = 0.7,
  nasalShare = 0.4,
  frequencyHertz = 0,
} = {}) {
  if (direction == null || !(flowRate > 0.04)) return [];
  const holding = Math.abs(direction) < 0.12;
  const baseSpeed = 0.00046 * (0.65 + flowRate);
  const speed = pitchLinkedSpeed(baseSpeed, { phonated, frequencyHertz, timeMs });
  const paths = [];
  const nasalN = Math.max(24, Math.round(count * Math.max(0.28, nasalShare) * 0.5));
  const oralN = Math.max(36, Math.round(count * (1 - nasalShare * 0.35) * 0.52));
  const bronchN = Math.max(20, Math.round(count * 0.32));
  for (let i = 0; i < nasalN; i++) paths.push({ path: 'nasal', i, n: nasalN });
  for (let i = 0; i < oralN; i++) paths.push({ path: 'oral', i, n: oralN });
  for (let i = 0; i < bronchN; i++) {
    paths.push({ path: i % 2 === 0 ? 'bronchusL' : 'bronchusR', i, n: bronchN });
  }
  const out = [];
  for (const spec of paths) {
    const localDir = streamSign(direction, spec.i);
    const signedSpeed = speed * localDir;
    const base = spec.n ? spec.i / spec.n : 0;
    const jitter = (spec.i * 17 % 10) / 80;
    const phase = ((base + jitter + timeMs * Math.abs(signedSpeed)) % 1 + 1) % 1;
    const t = localDir < 0 ? phase : 1 - phase;
    const atGlottis = t > 0.42 && t < 0.58;
    out.push({
      t,
      path: spec.path,
      inbound: localDir < 0,
      alpha: 0.4 + 0.6 * Math.sin(phase * Math.PI) * Math.max(0.45, flowRate) * (holding ? 0.78 : 1),
      radius: phonated && atGlottis ? 4.2 : spec.path.startsWith('bronchus') ? 2.4 : 3.1,
      streak: 10 + 14 * flowRate,
      blink: 0.55 + 0.45 * particleBlink(timeMs, spec.i),
    });
  }
  return out;
}

function particleBlink(timeMs, index) {
  const spark = Math.max(0, Math.sin(timeMs * 0.046 + index * 2.17));
  return 0.28 + 0.72 * spark ** 3;
}

export function backgroundCurrentParticles(L, {
  timeMs = 0,
  direction = -1,
  flowRate = 0.48,
  phonated = false,
  count = 360,
  frequencyHertz = 0,
} = {}) {
  const W = L.W;
  const H = L.H;
  const holding = Math.abs(direction) < 0.12;
  const baseSpeed = 0.00022 * (0.5 + Math.max(0.18, flowRate));
  const speedMag = pitchLinkedSpeed(holding ? baseSpeed * 0.48 : baseSpeed, { phonated, frequencyHertz, timeMs });
  const streams = [
    (t) => ({ x: W * 0.05 + Math.sin(t * Math.PI * 2) * W * 0.04, y: H * (0.98 - t * 0.94) }),
    (t) => ({ x: W * 0.14 + Math.sin(t * Math.PI * 3 + 0.8) * W * 0.035, y: H * (0.94 - t * 0.88) }),
    (t) => ({ x: W * 0.95 + Math.sin(t * Math.PI * 2 + 0.4) * W * 0.04, y: H * (0.98 - t * 0.94) }),
    (t) => ({ x: W * 0.86 + Math.sin(t * Math.PI * 3 + 1.3) * W * 0.035, y: H * (0.94 - t * 0.88) }),
    (t) => {
      const a = Math.PI * 1.12 + t * Math.PI * 1.76;
      const grow = 1.15 + t * 2.6;
      return {
        x: L.skull.x + Math.cos(a) * (L.skull.rx * grow),
        y: L.skull.y + Math.sin(a) * (L.skull.ry * grow * 0.92),
      };
    },
    (t) => ({
      x: L.cx + (t - 0.5) * W * 0.9,
      y: H * 0.965 + Math.sin(t * Math.PI * 4) * H * 0.018,
    }),
    (t) => ({ x: W * 0.28 + Math.sin(t * 5.2) * W * 0.1, y: H * (0.06 + t * 0.88) }),
    (t) => ({ x: W * 0.72 + Math.sin(t * 5.2 + 1.1) * W * 0.1, y: H * (0.06 + t * 0.88) }),
    (t) => ({ x: W * t, y: H * 0.16 + Math.sin(t * Math.PI * 3.1) * H * 0.1 }),
    (t) => ({ x: W * t, y: H * 0.38 + Math.sin(t * Math.PI * 2.4 + 0.7) * H * 0.12 }),
    (t) => ({ x: W * (1 - t), y: H * 0.58 + Math.sin(t * Math.PI * 2.2) * H * 0.1 }),
    (t) => ({ x: W * (1 - t), y: H * 0.78 + Math.sin(t * Math.PI * 2.6 + 0.4) * H * 0.08 }),
    (t) => {
      const a = t * Math.PI * 2;
      return {
        x: L.cx + Math.cos(a) * L.ribs.rx * (1.7 + t * 1.1),
        y: L.torso.y + Math.sin(a) * (L.ribs.y1 - L.ribs.y0) * 0.72,
      };
    },
    (t) => ({
      x: W * 0.5 + Math.sin(t * Math.PI * 2) * W * 0.46,
      y: H * 0.08 + Math.cos(t * Math.PI * 3) * H * 0.07,
    }),
  ];
  const streamBudget = Math.min(count, Math.round(count * 0.42));
  const perStream = Math.max(10, Math.round(streamBudget / streams.length));
  const out = [];
  for (let s = 0; s < streams.length; s++) {
    for (let i = 0; i < perStream; i++) {
      const base = i / perStream;
      const jitter = ((i * 13 + s * 7) % 11) / 90;
      const localDir = streamSign(direction, i + s * 3);
      const phase = ((base + jitter + timeMs * speedMag) % 1 + 1) % 1;
      const t = localDir > 0 ? 1 - phase : phase;
      const point = streams[s](t);
      const ahead = streams[s](clamp(t + 0.03));
      out.push({
        x: point.x,
        y: point.y,
        dx: ahead.x - point.x,
        dy: ahead.y - point.y,
        alpha: (0.1 + 0.22 * flowRate) + soundFieldAttenuation(t) * (0.18 + 0.38 * (0.45 + flowRate)),
        radius: (1.5 + (s % 2) * 0.4) * (0.7 + 0.45 * breathPlumeScale(t)),
        blink: 0.22 + 0.78 * Math.max(0, Math.sin(timeMs * 0.046 + (i + s * 17) * 2.17)) ** 2,
        phonated,
      });
    }
  }
  const moteN = Math.max(48, count - out.length);
  for (let i = 0; i < moteN; i++) {
    const seedX = ((i * 137 + 19) % 1000) / 1000;
    const seedY = ((i * 89 + 41) % 1000) / 1000;
    const localDir = streamSign(direction, i + 31);
    const phase = ((seedX + timeMs * speedMag * 0.72 + (i % 9) * 0.07) % 1 + 1) % 1;
    const t = localDir > 0 ? 1 - phase : phase;
    const x = ((seedX + localDir * t * 0.22) % 1 + 1) % 1 * W;
    const y = ((seedY + t * 0.1 * localDir + Math.sin((seedX + t) * Math.PI * 2) * 0.04) % 1 + 1) % 1 * H;
    const aheadX = ((seedX + localDir * clamp(t + 0.03) * 0.22) % 1 + 1) % 1 * W;
    const aheadY = ((seedY + clamp(t + 0.03) * 0.1 * localDir) % 1 + 1) % 1 * H;
    out.push({
      x,
      y,
      dx: aheadX - x,
      dy: aheadY - y,
      alpha: (0.12 + 0.28 * flowRate) * (0.4 + 0.6 * (1 - Math.abs(t - 0.4))),
      radius: 1.15 + (i % 5) * 0.35 + t * 1.1,
      blink: 0.22 + 0.78 * Math.max(0, Math.sin(timeMs * 0.046 + (i + 51) * 2.17)) ** 2,
      phonated,
    });
  }
  return out;
}

export function anatomyDrawPlan(visualStates, {
  transparent = false,
  showPitch = true,
  showResonance = true,
  showRespiratory = true,
  showVagus = false,
  vagusFocus = false,
  showCirculatory = true,
  showRegistration = true,
  showTension = true,
  showAura = true,
  showSupport = true,
  showLanes = true,
  timeMs = 0,
  pose = null,
  demoBreath = null,
  viewYawRadians = 0,
  figureZoom = 1,
  seeThrough = false,
  features = {},
} = {}) {
  const states = stateMap(visualStates);
  const diaphragm = states.get('diaphragmMotion');
  const ribs = states.get('ribMotion');
  const skullRim = states.get('skullRimUpperProduction');
  const chest = states.get('chestRegionGlow');
  const mixed = states.get('mixedCoordinationField');
  const transition = states.get('registrationTransition');
  const jaw = states.get('jawTensionGlow');
  const throat = states.get('throatTensionGlow');
  const torso = states.get('torsoTensionGlow');
  const pitch = states.get('actualPitchLayer');
  const airflow = states.get('airflowParticles');
  const formants = states.get('formantTrajectories');
  const coherence = states.get('auraCoherence');
  const energy = states.get('auraEnergy');
  const support = states.get('supportEvidence');
  const userBreath = states.get('breathLaneUser');
  const refBreath = states.get('breathLaneReference');

  const direction = !showRespiratory
    ? null
    : (Number.isFinite(pose?.flowDirection)
      ? pose.flowDirection
      : (airflow?.evidenceClass === 'simulated'
        ? airflow.value
        : demoBreath?.pose?.flowDirection ?? null));
  const breathClass = showRespiratory
    ? (userBreath && userBreath.evidenceClass !== 'unknown' ? userBreath.value : demoBreath?.className ?? null)
    : null;
  const phonated = breathClass === 'phonated_exhale'
    || Boolean(showRespiratory && pose && pose.flowDirection > 0.2 && pose.glottisOpen < 0.42);

  const resolvedPose = showRespiratory
    ? poseFromBreathInputs({
      className: breathClass || 'unknown',
      diaphragmOffset: diaphragm?.evidenceClass === 'simulated' ? Number(diaphragm.value) : null,
      ribExpansion: ribs?.evidenceClass === 'simulated' ? Number(ribs.value) : null,
      pose: pose || null,
    })
    : { ...REST_POSE };

  if (!showRespiratory) {
    resolvedPose.flowDirection = 0;
    resolvedPose.flowRate = 0;
  } else if (!pose && direction != null) {
    resolvedPose.flowDirection = direction;
    if (!(resolvedPose.flowRate > 0.04) && direction !== 0) resolvedPose.flowRate = 0.7;
  }

  const humming = inferHumming(features, {
    mouthOpen: resolvedPose.mouthOpen,
    nasalShare: resolvedPose.nasalShare,
  });
  if (showRespiratory && humming.active) {
    resolvedPose.nasalShare = Math.max(resolvedPose.nasalShare || 0, 0.78);
    resolvedPose.mouthOpen = Math.min(resolvedPose.mouthOpen || 0.12, 0.08);
    resolvedPose.jawDrop = Math.min(resolvedPose.jawDrop || 0.12, 0.1);
  }

  const simulatedBreath = {
    diaphragmOffset: resolvedPose.diaphragmDescent,
    ribExpansion: resolvedPose.ribExpansion,
    pose: resolvedPose,
    evidenceClass: 'simulated',
    active: showRespiratory && (assertiveness(diaphragm) > 0 || assertiveness(ribs) > 0 || pose != null),
    class: breathClass,
    label: demoBreath?.label || 'simulated anatomy driven by inferred respiratory state',
  };
  const respiratoryCoupling = showRespiratory
    ? clamp(0.35 + resolvedPose.lungVolume * 0.65)
    : 0.65;
  const simulatedRateBeatsPerMinute = Math.round(clamp(
    80
      + 14 * (resolvedPose.flowDirection < -0.2 ? 1 : resolvedPose.flowDirection > 0.2 ? 0.15 : 0)
      + 8 * (phonated ? 1 : 0)
      + 6 * (resolvedPose.lungVolume - 0.4),
    68,
    112,
  ));
  const pulsePeriodMs = 60000 / Math.max(60, simulatedRateBeatsPerMinute);
  const pulsePhase = ((timeMs % pulsePeriodMs) + pulsePeriodMs) % pulsePeriodMs / pulsePeriodMs;
  const systolicPulse = Math.exp(-1 * (((pulsePhase - 0.1) / 0.08) ** 2))
    + 0.38 * Math.exp(-1 * (((pulsePhase - 0.28) / 0.1) ** 2));
  const respiratoryPhase = resolvedPose.flowDirection < -0.2
    ? 'inhale'
    : resolvedPose.flowDirection > 0.2
      ? 'exhale'
      : 'pause';
  const yawRadians = normalizeYawRadians(viewYawRadians);
  const yawCosine = Math.cos(yawRadians);
  const yawSine = Math.sin(yawRadians);

  return {
    transparent,
    seeThrough,
    timeMs,
    structures: ANATOMY_STRUCTURES.map((s) => ({
      id: s.id,
      label: s.label,
      fillAlpha: transparent ? 0.16 : 0.5,
    })),
    requiredStructureIds: REQUIRED_STRUCTURE_IDS,
    simulatedBreath,
    vagus: {
      active: showVagus,
      focus: showVagus && vagusFocus,
      evidenceClass: 'simulated',
      respiratoryPhase,
      structureIds: VAGUS_STRUCTURE_IDS,
      label: 'breath + vagus + spine + head/brain + heart · neural activity is not measured',
      caveat: 'Diaphragm motor drive is phrenic. Vagal pathways shown here are visceral sensory, parasympathetic, and laryngeal branches.',
    },
    view: {
      yawRadians,
      yawDegrees: Math.round(yawRadians * 180 / Math.PI),
      projectionScale: 0.42 + Math.abs(yawCosine) * 0.58,
      facingSign: yawCosine >= 0 ? 1 : -1,
      frontVisibility: (1 + yawCosine) / 2,
      backVisibility: (1 - yawCosine) / 2,
      sideVisibility: Math.abs(yawSine),
      figureZoom: clamp(Number(figureZoom) || 1, FIGURE_ZOOM_RANGE.min, FIGURE_ZOOM_RANGE.max),
      label: Math.abs(yawCosine) < 0.35
        ? 'lateral'
        : yawCosine >= 0
          ? 'anterior'
          : 'posterior',
      evidenceClass: 'simulated',
    },
    circulatory: {
      active: showCirculatory,
      evidenceClass: 'simulated',
      pulsePhase,
      pulseScale: 1
        + 0.28 * systolicPulse * (0.85 + respiratoryCoupling * 0.22)
        + 0.02 * (respiratoryCoupling - 0.65),
      simulatedRateBeatsPerMinute,
      respiratoryCoupling,
      respiratoryPhase,
      particles: circulationParticles({
        timeMs,
        active: showCirculatory,
        speedScale: (simulatedRateBeatsPerMinute / 72) * 5.6,
      }),
      label: 'simulated cardiorespiratory coupling · not measured heart rate, pressure, or perfusion',
    },
    inferredRegistration: {
      active: showRegistration,
      skullRim: showRegistration ? assertiveness(skullRim) : 0,
      chestGlow: showRegistration ? assertiveness(chest) : 0,
      mixedField: showRegistration ? assertiveness(mixed) : 0,
      transition: showRegistration && transition?.evidenceClass === 'inferred' ? transition.value : null,
      evidenceClass: 'inferred',
      label: 'inferred registration/resonance-pattern mapping, not cavity proof',
    },
    mixedVibration: mixedSystemVibration({
      mixedAmount: showRegistration ? assertiveness(mixed) : 0,
      energy: phonated ? 0.62 : 0,
      frequencyHertz: Number(pitch?.value) > 60 ? Number(pitch.value) : 0,
      formantsHertz: showResonance && Array.isArray(formants?.value) ? formants.value.filter((hz) => hz > 0) : [],
    }),
    humming,
    structureVibration: structureVibrationFromVoice({
      chestAmount: showRegistration ? assertiveness(chest) : 0,
      mixedAmount: showRegistration ? assertiveness(mixed) : 0,
      headAmount: showRegistration ? assertiveness(skullRim) : 0,
      hummingAmount: humming.amount,
      energy: phonated ? 0.62 : 0,
      rmsAmplitude: Number(features.rmsAmplitude) || 0,
      frequencyHertz: Number(pitch?.value) > 60
        ? Number(pitch.value)
        : (Number(features.fundamentalFrequencyHertz) > 60 ? Number(features.fundamentalFrequencyHertz) : 0),
    }),
    tension: {
      jaw: showTension ? assertiveness(jaw) : 0,
      throat: showTension ? assertiveness(throat) : 0,
      torso: showTension ? assertiveness(torso) : 0,
      evidenceClass: 'inferred',
      label: 'tension evidence',
      accessibilityCue: densityCue(Math.max(
        showTension ? assertiveness(jaw) : 0,
        showTension ? assertiveness(throat) : 0,
        showTension ? assertiveness(torso) : 0,
      )),
    },
    airflow: {
      direction: resolvedPose.flowRate > 0.04 ? resolvedPose.flowDirection : (direction == null ? null : 0),
      phonated,
      flowRate: resolvedPose.flowRate,
      nasalShare: resolvedPose.nasalShare,
      frequencyHertz: phonated && Number(pitch?.value) > 60 ? Number(pitch.value) : 0,
      particles: airflowParticles({
        direction: resolvedPose.flowRate > 0.04 ? resolvedPose.flowDirection : null,
        timeMs,
        phonated,
        flowRate: resolvedPose.flowRate,
        nasalShare: resolvedPose.nasalShare,
        count: 360,
        frequencyHertz: phonated && Number(pitch?.value) > 60 ? Number(pitch.value) : 0,
      }),
      evidenceClass: showRespiratory && (pose != null || demoBreath != null || direction != null)
        ? 'simulated'
        : 'unknown',
      label: 'simulated airflow direction, not measured velocity',
    },
    resonance: {
      formantsHertz: showResonance && Array.isArray(formants?.value) ? formants.value : [],
      evidenceClass: showResonance && (formants?.evidenceClass === 'derived' || formants?.evidenceClass === 'inferred')
        ? formants.evidenceClass
        : 'unknown',
    },
    vowelMap: vowelMapFromFormants(
      showResonance && Array.isArray(formants?.value) ? formants.value : [],
    ),
    breathResonance: (() => {
      const formantsHertz = showResonance && Array.isArray(formants?.value)
        ? formants.value.filter((hz) => hz > 0)
        : [];
      const chambers = chamberResonanceFromFormants(formantsHertz, {
        phonated,
        flowRate: resolvedPose.flowRate,
        nasalShare: resolvedPose.nasalShare,
        rmsAmplitude: Math.max(0, Number(resolvedPose.flowRate) || 0) * 0.22,
      });
      return {
        active: showResonance && chambers.active,
        energy: showResonance ? chambers.energy : 0,
        chambers,
        phase: clamp(resolvedPose.lungVolume ?? 0.4),
        flowDirection: resolvedPose.flowDirection || 0,
        phonated,
        formantsHertz,
        evidenceClass: chambers.evidenceClass,
        label: chambers.label,
      };
    })(),
    aura: {
      coherence: showAura ? num(coherence) : 0,
      energy: showAura ? num(energy) : 0,
      independent: true,
    },
    support: {
      value: showSupport ? num(support) : 0,
      evidenceClass: showSupport ? (support?.evidenceClass || 'unknown') : 'unknown',
    },
    lanes: showLanes
      ? {
        user: userBreath?.evidenceClass === 'unknown' ? null : userBreath?.value,
        reference: refBreath?.evidenceClass === 'unknown' ? null : refBreath?.value,
      }
      : null,
    layerFlags: {
      pitch: showPitch,
      resonance: showResonance,
      respiratory: showRespiratory,
      circulatory: showCirculatory,
      registration: showRegistration,
      tension: showTension,
      aura: showAura,
      support: showSupport,
      lanes: showLanes,
    },
    actualPitch: showPitch && pitch?.value != null && pitch.evidenceClass !== 'unknown'
      ? {
        frequencyHertz: pitch.value,
        color: frequencyToColor(pitch.value),
        evidenceClass: 'derived',
      }
      : { frequencyHertz: null, color: null, evidenceClass: 'unknown' },
  };
}

export function normalizeYawRadians(value) {
  const tau = Math.PI * 2;
  return ((Number(value) || 0) % tau + tau) % tau;
}

export function nextAnatomyYaw(current, dxPixels) {
  return normalizeYawRadians((Number(current) || 0) + dxPixels * 0.008);
}

export { chamberResonanceFromFormants };

/** Screen-space point after the same horizontal squash used by applyYawProjection. */
export function projectedAnatomyPoint(L, view, x, y) {
  const scaleX = L.horizontalScale * (view?.projectionScale ?? 1) * (view?.facingSign ?? 1);
  return { x: L.cx + (x - L.cx) * scaleX, y };
}

/** Direction in front of the face: air leaves this way on exhale. */
export function jetFacingX(yawRadians = 0) {
  const s = Math.sin(Number(yawRadians) || 0);
  if (Math.abs(s) < 0.18) return 0.55;
  return Math.sign(s) * Math.max(0.5, Math.abs(s));
}

/**
 * Particles from the lips / naris into the space in front of the face.
 * t = 0 at the aperture, t = 1 outside. Inhale runs that path in reverse.
 */
export function exteriorBreathJetParticles(L, {
  timeMs = 0,
  direction = 0,
  flowRate = 0,
  nasalShare = 0.2,
  yawRadians = 0,
  mouthOpen = 0.12,
  phonated = false,
  frequencyHertz = 0,
} = {}) {
  if (!(flowRate > 0.04)) return [];
  const holding = Math.abs(direction) < 0.12;
  const drive = clamp(Math.max(flowRate, holding ? 0.18 : 0));
  const oralN = Math.max(90, Math.round((140 + drive * 110) * (0.6 + clamp(mouthOpen) * 0.55)));
  const nasalN = Math.max(48, Math.round((72 + drive * 64) * Math.max(0.4, nasalShare)));
  const speed = pitchLinkedSpeed(0.00052 * (0.5 + drive), { phonated, frequencyHertz, timeMs });
  const facing = jetFacingX(yawRadians);
  const out = [];
  const push = (path, n, share) => {
    for (let i = 0; i < n; i++) {
      const inbound = streamSign(direction, i) < 0;
      const phase = ((i / Math.max(1, n)) + timeMs * speed * (path === 'nasalJet' ? 0.9 : 1) + (path === 'nasalJet' ? 0.17 : 0)) % 1;
      const t = inbound ? 1 - phase : phase;
      out.push({
        path,
        t,
        lane: ((i % 13) - 6) / 6,
        alpha: soundFieldAttenuation(t) * (0.55 + drive * 0.45) * share * (holding ? 0.85 : 1),
        radius: path === 'nasalJet' ? 2.4 + drive * 1.8 : 3.1 + drive * 2.6,
        phonated: path === 'oralJet' && phonated,
        inbound,
        facing,
      });
    }
  };
  push('oralJet', oralN, 1);
  push('nasalJet', nasalN, Math.max(0.45, nasalShare));
  return out;
}

function densityCue(amount) {
  if (!(amount > 0.05)) return 'tension evidence: none';
  if (amount < 0.2) return 'tension evidence: dim';
  if (amount < 0.5) return 'tension evidence: moderate';
  if (amount < 0.8) return 'tension evidence: strong';
  return 'tension evidence: dense';
}

export function drawAnatomyV2(ctx, W, H, plan) {
  const L = anatomyLayout(W, H, plan.simulatedBreath, plan.view);
  const drawn = new Set();
  const mark = (id) => drawn.add(id);
  const alpha = plan.transparent || plan.seeThrough ? 0.14 : 0.52;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawAura(ctx, L, W, H, plan.aura);
  drawBackgroundCurrents(ctx, L, plan);
  ctx.save();
  applyYawProjection(ctx, L, plan.view);
  if (plan.view?.backVisibility > 0.04) {
    ctx.globalAlpha = plan.view.backVisibility;
    drawPosteriorAnatomy(ctx, L, plan);
  }
  const frontAlpha = 0.1 + 0.9 * (plan.view?.frontVisibility ?? 1);
  ctx.globalAlpha = frontAlpha * (plan.vagus?.focus ? 0.42 : 1);
  drawSoftBody(ctx, L, alpha, plan.transparent);
  mark('upperTorso');
  drawSpine(ctx, L, plan);
  mark('spine');
  drawAbdomen(ctx, L, alpha);
  mark('abdomen');
  drawClavicles(ctx, L);
  mark('clavicles');
  drawLungs(ctx, L, plan.transparent);
  mark('lungs');
  drawRibCage(ctx, L);
  mark('ribCage');
  if (plan.circulatory?.active) {
    drawCirculatorySystem(ctx, L, plan.circulatory);
    for (const id of [
      'heart', 'aorta', 'venaeCavae', 'pulmonaryArteries',
      'pulmonaryVeins', 'carotidArteries', 'jugularVeins', 'coronaryVessels',
    ]) mark(id);
  }
  drawSternum(ctx, L);
  mark('sternum');
  mark('xiphoidProcess');
  drawDiaphragm(ctx, L);
  mark('diaphragm');
  drawTrachea(ctx, L);
  mark('trachea');
  ctx.globalAlpha = Math.max(frontAlpha, plan.view?.backVisibility ?? 0, 0.72) * (plan.vagus?.focus ? 0.42 : 1);
  drawNeck(ctx, L, alpha, plan);
  mark('neck');
  drawEmbeddedSagittalHead(ctx, L, plan);
  ctx.globalAlpha = frontAlpha * (plan.vagus?.focus ? 0.42 : 1);
  mark('skull');
  mark('brain');
  mark('nasalCavity');
  mark('oralCavity');
  mark('jaw');
  mark('pharyngealRegion');
  mark('laryngealRegion');
  mark('hyoid');
  mark('thyroidCartilage');
  drawRegisterVoiceFields(ctx, L, plan, { legend: false });
  drawTension(ctx, L, plan.tension);
  drawAirflow(ctx, L, plan);
  if (!plan.vagus?.focus) drawInternalResonance(ctx, L, plan);
  drawMixedArchitectureVibration(ctx, L, plan);
  drawStructureVibration(ctx, L, plan);
  drawFormants(ctx, L, plan.resonance);
  if (plan.vagus?.active) {
    ctx.globalAlpha = frontAlpha;
    if (plan.vagus.focus) {
      drawSpine(ctx, L, plan);
      drawBrain(ctx, L, plan);
      drawLungs(ctx, L, true);
      drawDiaphragm(ctx, L);
      drawTrachea(ctx, L);
      drawPharynx(ctx, L, plan);
      drawDetailedHeart(ctx, L, vagusHeartState(plan), {
        arterial: 'rgba(255,116,108,0.92)',
        venous: 'rgba(110,168,238,0.88)',
      });
      mark('heart');
      drawAirflow(ctx, L, plan);
      drawInternalResonance(ctx, L, plan);
      drawMixedArchitectureVibration(ctx, L, plan);
      drawStructureVibration(ctx, L, plan);
    }
    drawBreathVagusSystem(ctx, L, plan);
    for (const id of VAGUS_STRUCTURE_IDS) mark(id);
  }
  drawSupportOrganization(ctx, L, plan);
  drawOuterContour(ctx, L);
  ctx.globalAlpha = 1;
  drawAirwayColumn(ctx, L, plan);
  drawLarynx(ctx, L, plan);
  drawStructureVibration(ctx, L, plan);
  ctx.restore();
  ctx.globalAlpha = 1;
  drawExteriorBreathJets(ctx, L, plan);
  drawRegionCallouts(ctx, L, plan);
  drawCaptions(ctx, L, W, plan);
  if (plan.inferredRegistration?.active !== false) {
    const amounts = registerVoiceAmounts(plan.inferredRegistration || {});
    if (amounts.chest > 0.04 || amounts.head > 0.04 || amounts.mixed > 0.04) {
      drawRegisterVoiceLegend(ctx, L, amounts, {
        x: L.S(16),
        y: H - L.S(plan.lanes ? 96 : 70),
      });
    }
  }
  {
    const chambers = plan.breathResonance?.chambers || {};
    if ((chambers.oral || 0) > 0.04 || (chambers.pharynx || 0) > 0.04 || (chambers.nasal || 0) > 0.04) {
      drawChamberResonanceLegend(ctx, L, chambers, {
        x: L.W - L.S(118),
        y: H - L.S(plan.lanes ? 96 : 70),
      });
    }
  }
  if (plan.humming?.active) {
    ctx.save();
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillStyle = rgbaVoice(SKULL_CHAMBER_RGB, 0.95);
    ctx.textAlign = 'left';
    ctx.fillText('humming · inferred', L.S(16), H - L.S(plan.lanes ? 118 : 92));
    ctx.restore();
  }
  drawLanes(ctx, W, H, plan.lanes);
  drawEvidenceFooter(ctx, W, H, plan);

  ctx.restore();
  plan.drawnStructureIds = [...drawn];
  return plan;
}

function applyYawProjection(ctx, L, view = {}) {
  if (typeof ctx.translate !== 'function' || typeof ctx.scale !== 'function') return;
  const scaleX = L.horizontalScale * (view.projectionScale ?? 1) * (view.facingSign ?? 1);
  ctx.translate(L.cx, 0);
  ctx.scale(scaleX, 1);
  ctx.translate(-L.cx, 0);
}

function drawPosteriorAnatomy(ctx, L, plan) {
  drawSoftBody(ctx, L, plan.transparent ? 0.2 : 0.42);

  // Nuchal line only — the shared sagittal head is the skull, fitted to the spine.
  ctx.strokeStyle = 'rgba(205,219,230,0.62)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(L.skull.x - L.skull.rx * 0.7, L.skull.y + L.skull.ry * 0.18);
  ctx.quadraticCurveTo(L.skull.x, L.skull.y + L.skull.ry * 0.36, L.skull.x + L.skull.rx * 0.7, L.skull.y + L.skull.ry * 0.18);
  ctx.stroke();

  // Trapezius and scapulae.
  ctx.fillStyle = 'rgba(126,70,76,0.16)';
  ctx.strokeStyle = 'rgba(220,139,145,0.38)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(L.cx, L.neck.y0 + L.S(15));
    ctx.lineTo(L.cx + side * L.shoulders.span * 0.82, L.shoulders.y + L.S(5));
    ctx.lineTo(L.cx + side * L.ribs.rx * 0.45, L.lungs.y + L.S(34));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(206,218,228,0.5)';
    ctx.beginPath();
    ctx.moveTo(L.cx + side * L.S(24), L.ribs.y0 + L.S(26));
    ctx.quadraticCurveTo(
      L.cx + side * L.ribs.rx * 0.7,
      L.lungs.y,
      L.cx + side * L.ribs.rx * 0.42,
      L.lungs.y + L.S(54),
    );
    ctx.quadraticCurveTo(
      L.cx + side * L.S(24),
      L.lungs.y + L.S(26),
      L.cx + side * L.S(24),
      L.ribs.y0 + L.S(26),
    );
    ctx.stroke();
  }

  drawSpine(ctx, L);
  ctx.strokeStyle = 'rgba(178,198,214,0.42)';
  ctx.lineWidth = 1.1;
  for (const rib of L.ribs.pairs) {
    ctx.beginPath();
    ctx.ellipse(L.cx, rib.y, rib.rx, L.S(7 + rib.t * 3), 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }

  // Posterior abdominal wall and sacral anchor.
  ctx.strokeStyle = 'rgba(184,112,102,0.42)';
  ctx.beginPath();
  ctx.ellipse(
    L.cx,
    (L.diaphragm.y + L.abdomen.y1) * 0.5,
    L.abdomen.rx * 0.7,
    (L.abdomen.y1 - L.diaphragm.y) * 0.31,
    0,
    Math.PI,
    Math.PI * 2,
  );
  ctx.stroke();
}

function drawAura(ctx, L, W, H, aura) {
  const c = clamp(aura.coherence || 0);
  const e = clamp(aura.energy || 0);
  if (c < 0.05 && e < 0.05) return;
  const rad = Math.max(L.ribs.rx * 1.85, W * 0.24) * (1 + 0.1 * e);
  const g = ctx.createRadialGradient(L.cx, L.torso.y, 16, L.cx, L.torso.y, rad);
  g.addColorStop(0, rgbaVoice(OUTLINE_RGB, 0.04 + 0.08 * c));
  g.addColorStop(0.55, rgbaVoice(OUTLINE_RGB, 0.03 + 0.06 * e));
  g.addColorStop(1, rgbaVoice(OUTLINE_RGB, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(L.cx, L.torso.y - H * 0.04, rad * 0.52, rad, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSoftBody(ctx, L, alpha) {
  const p = L.pose;
  ctx.fillStyle = `rgba(22,30,40,${alpha})`;
  ctx.strokeStyle = rgbaVoice(OUTLINE_RGB, 0.22);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(L.cx - L.shoulders.span, L.shoulders.y);
  ctx.bezierCurveTo(
    L.cx - L.ribs.rx * 1.12, L.ribs.y0 + L.S(18),
    L.cx - L.ribs.rx * 1.05, L.ribs.y1,
    L.cx - L.abdomen.rx, L.diaphragm.y + L.S(8),
  );
  ctx.quadraticCurveTo(L.cx - L.abdomen.rx * (0.85 + 0.2 * p.abdominalExpansion), L.abdomen.y1, L.cx, L.abdomen.y1 + L.S(6));
  ctx.quadraticCurveTo(L.cx + L.abdomen.rx * (0.85 + 0.2 * p.abdominalExpansion), L.abdomen.y1, L.cx + L.abdomen.rx, L.diaphragm.y + L.S(8));
  ctx.bezierCurveTo(
    L.cx + L.ribs.rx * 1.05, L.ribs.y1,
    L.cx + L.ribs.rx * 1.12, L.ribs.y0 + L.S(18),
    L.cx + L.shoulders.span, L.shoulders.y,
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawOuterContour(ctx, L) {
  const p = L.pose;
  ctx.save();
  ctx.strokeStyle = rgbaVoice(OUTLINE_RGB, 0.92);
  ctx.lineWidth = 1.9;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(L.cx - L.neck.w * 0.42, L.neck.y0);
  ctx.lineTo(L.cx - L.shoulders.span, L.shoulders.y);
  ctx.bezierCurveTo(
    L.cx - L.ribs.rx * 1.12, L.ribs.y0 + L.S(18),
    L.cx - L.ribs.rx * 1.05, L.ribs.y1,
    L.cx - L.abdomen.rx, L.diaphragm.y + L.S(8),
  );
  ctx.quadraticCurveTo(L.cx - L.abdomen.rx * (0.85 + 0.2 * p.abdominalExpansion), L.abdomen.y1, L.cx, L.abdomen.y1 + L.S(6));
  ctx.quadraticCurveTo(L.cx + L.abdomen.rx * (0.85 + 0.2 * p.abdominalExpansion), L.abdomen.y1, L.cx + L.abdomen.rx, L.diaphragm.y + L.S(8));
  ctx.bezierCurveTo(
    L.cx + L.ribs.rx * 1.05, L.ribs.y1,
    L.cx + L.ribs.rx * 1.12, L.ribs.y0 + L.S(18),
    L.cx + L.shoulders.span, L.shoulders.y,
  );
  ctx.lineTo(L.cx + L.neck.w * 0.42, L.neck.y0);
  ctx.stroke();
  ctx.restore();
}

function drawSpine(ctx, L, plan = {}) {
  const vagus = Boolean(plan.vagus?.active);
  ctx.strokeStyle = vagus ? 'rgba(232, 196, 210, 0.82)' : rgbaVoice(OUTLINE_RGB, 0.38);
  ctx.lineWidth = vagus ? 5.2 : 3.2;
  ctx.beginPath();
  ctx.moveTo(L.cx, L.brain?.stemY ?? L.spine.y0);
  ctx.lineTo(L.cx, L.spine.y1);
  ctx.stroke();
  const n = 18;
  for (let i = 0; i < n; i++) {
    const y = L.spine.y0 + (i / (n - 1)) * (L.spine.y1 - L.spine.y0);
    const cervical = i < 7;
    const w = L.S((cervical ? 7.5 : 5.2) + (i > 8 ? 2 : 0));
    ctx.strokeStyle = vagus && cervical
      ? 'rgba(255, 176, 198, 0.95)'
      : vagus
        ? 'rgba(236, 188, 200, 0.55)'
        : rgbaVoice(OUTLINE_RGB, 0.4);
    ctx.lineWidth = vagus && cervical ? 1.7 : 1.15;
    ctx.beginPath();
    ctx.moveTo(L.cx - w, y);
    ctx.lineTo(L.cx + w, y);
    ctx.stroke();
  }
  if (vagus && L.brain) {
    ctx.fillStyle = 'rgba(255, 168, 196, 0.55)';
    ctx.strokeStyle = 'rgba(255, 210, 224, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(L.cx, L.brain.stemY + L.S(2), L.S(11), L.S(18), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 170, 190, 0.9)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(L.cx, L.brain.stemY);
    ctx.lineTo(L.cx, L.spine.y0);
    ctx.stroke();
  }
}

function vagusHeartState(plan) {
  if (plan.circulatory?.active) return plan.circulatory;
  const t = plan.timeMs || 0;
  const systolic = 0.5 + 0.5 * Math.sin(t * 0.011);
  return {
    pulseScale: 1 + 0.12 * systolic,
    respiratoryCoupling: clamp(0.45 + (plan.simulatedBreath?.pose?.flowRate || 0) * 0.4),
    respiratoryPhase: plan.vagus?.respiratoryPhase || 'unknown',
    particles: [],
  };
}

function drawBrain(ctx, L, plan = {}) {
  const b = L.brain;
  if (!b) return;
  const vagus = Boolean(plan.vagus?.active);
  const breath = plan.breathResonance || {};
  const pulse = 1 + (breath.energy || 0) * 0.05 * Math.sin((plan.timeMs || 0) * 0.006);
  const rx = b.rx * pulse;
  const ry = b.ry * pulse;
  const pink = vagus
    ? { fill0: 'rgba(255, 186, 210, 0.96)', fill1: 'rgba(232, 86, 128, 0.92)', stroke: 'rgba(255, 224, 232, 0.95)' }
    : { fill0: 'rgba(214, 150, 168, 0.38)', fill1: 'rgba(148, 78, 102, 0.32)', stroke: 'rgba(232, 186, 198, 0.4)' };

  ctx.fillStyle = pink.fill1;
  ctx.strokeStyle = pink.stroke;
  ctx.lineWidth = vagus ? 1.8 : 1.1;
  ctx.beginPath();
  ctx.ellipse(b.x, b.stemY + L.S(8), b.stemR * 1.35, L.S(18), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(b.x, b.stemY + L.S(20), L.S(16), L.S(10), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(L.skull.x, L.skull.y - L.S(8), L.skull.rx * 0.92, L.skull.ry * 0.82, 0, 0, Math.PI * 2);
  ctx.clip();
  const tissue = ctx.createRadialGradient(b.x - rx * 0.18, b.y - ry * 0.2, L.S(4), b.x, b.y, ry);
  tissue.addColorStop(0, pink.fill0);
  tissue.addColorStop(1, pink.fill1);
  ctx.fillStyle = tissue;
  ctx.strokeStyle = pink.stroke;
  ctx.beginPath();
  ctx.ellipse(b.x - rx * 0.08, b.y, rx * 0.96, ry, -0.08, 0, Math.PI * 2);
  ctx.ellipse(b.x + rx * 0.08, b.y, rx * 0.96, ry, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = vagus ? 'rgba(255, 236, 240, 0.55)' : 'rgba(255, 210, 220, 0.18)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y - ry * 0.88);
  ctx.lineTo(b.x, b.y + ry * 0.28);
  for (const side of [-1, 1]) {
    for (let g = 0; g < 4; g++) {
      const gy = b.y - ry * 0.62 + g * ry * 0.28;
      ctx.moveTo(b.x + side * rx * 0.08, gy);
      ctx.quadraticCurveTo(b.x + side * rx * 0.72, gy + ry * 0.08, b.x + side * rx * 0.18, gy + ry * 0.22);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function formantRgb(hz) {
  if (!(hz > 0)) return { r: 139, g: 229, b: 143 };
  const t = clamp((hz - 250) / 2800);
  return {
    r: Math.round(80 + t * 140),
    g: Math.round(210 - t * 70),
    b: Math.round(255 - t * 110),
  };
}

function drawInternalResonance(ctx, L, plan) {
  const br = plan.breathResonance;
  const chambers = br?.chambers || {};
  if (!br?.active || !(br.energy > 0.04)) return;
  const timeMs = plan.timeMs || 0;
  const formants = br.formantsHertz || [];
  const oral = oralCavityWaypoints(L.pose?.jawDrop ?? 0.12, L.pose?.mouthOpen ?? 0.12)
    .map(([x, y]) => sagittalToFigure(L, x, y));
  const nasal = nasalCavityWaypoints().map(([x, y]) => sagittalToFigure(L, x, y));
  const at = (pts, u) => pts[Math.min(pts.length - 1, Math.max(0, Math.round(u * (pts.length - 1))))];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (chambers.oral > 0.04) {
    fillCavityWaves(
      ctx, L.cx, L.lungs.y + L.S(6),
      L.ribs.rx * 0.62, L.lungs.ry * 0.7,
      CHEST_CHAMBER_RGB, chambers.oral, timeMs, 0.08, formants[0],
    );
    const pt = at(oral, 0.62);
    fillCavityWaves(
      ctx, pt.x, pt.y, L.S(24 + (L.pose?.mouthOpen || 0) * 20), L.S(16 + (L.pose?.mouthOpen || 0) * 18),
      CHEST_CHAMBER_RGB, chambers.oral, timeMs, 0.22, formants[0],
    );
  }
  if (chambers.pharynx > 0.04) {
    fillCavityWaves(
      ctx, L.cx, L.pharynx.y0, L.S(16), L.S(22),
      THROAT_CHAMBER_RGB, chambers.pharynx, timeMs, 0.16, formants[1],
    );
  }
  if (chambers.nasal > 0.04) {
    const pt = at(nasal, 0.72);
    fillCavityWaves(
      ctx, pt.x, pt.y, L.S(10), L.S(8),
      SKULL_CHAMBER_RGB, chambers.nasal * 0.35, timeMs, 0.3, formants[2] || formants[1],
    );
    fillCavityWaves(
      ctx, L.brain.x, L.brain.stemY, L.S(20), L.S(26),
      SKULL_CHAMBER_RGB, chambers.nasal, timeMs, 0.42, formants[2] || formants[1],
    );
  }
  ctx.restore();
}

function drawMixedArchitectureVibration(ctx, L, plan) {
  const vib = plan.mixedVibration;
  if (!vib || !(vib.amount > 0.08) || !(vib.visualHz > 0)) return;
  const rgb = registerVoiceAmounts(plan.inferredRegistration || {}).mixedRgb;
  const phase = (((plan.timeMs || 0) / 1000) * vib.visualHz) % 1;
  const pulse = 0.55 + 0.45 * Math.sin(phase * Math.PI * 2);
  const path = oralCavityWaypoints(L.pose?.jawDrop ?? 0.12, L.pose?.mouthOpen ?? 0.12)
    .map(([x, y]) => sagittalToFigure(L, x, y));
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.16 + vib.amount * 0.4 * pulse})`;
  ctx.lineWidth = 2.4 + vib.amount * 5 * pulse;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
  if (vib.chestCoupling > 0.08) {
    const chestPulse = 1 + 0.08 * pulse * vib.chestCoupling;
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.12 + vib.chestCoupling * 0.35})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(
      L.cx,
      L.lungs.y + L.S(8),
      L.ribs.rx * 0.62 * chestPulse,
      L.lungs.ry * 0.7 * chestPulse,
      0, 0, Math.PI * 2,
    );
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const t = (phase + i / 6) % 1;
    const idx = t * (path.length - 1);
    const a = Math.floor(idx);
    const u = idx - a;
    const p0 = path[a];
    const p1 = path[Math.min(path.length - 1, a + 1)];
    const x = p0.x + (p1.x - p0.x) * u;
    const y = p0.y + (p1.y - p0.y) * u;
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.2 + vib.amount * 0.55 * (1 - t)})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(x, y, 10 + vib.amount * 18 * (0.65 + t), 7 + vib.amount * 12, 0.15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function strokeBreathLight(ctx, alpha, width) {
  ctx.strokeStyle = rgbaVoice(STRUCTURE_VIBRATION_RGB, alpha);
  ctx.lineWidth = width;
}

function drawStructureVibration(ctx, L, plan) {
  const vib = plan.structureVibration;
  if (!vib || !(vib.amount > 0.06) || !(vib.visualHz > 0)) return;
  const timeMs = plan.timeMs || 0;
  const phase = ((timeMs / 1000) * vib.visualHz) % 1;
  const pulse = 0.55 + 0.45 * Math.sin(phase * Math.PI * 2);
  const wobble = (amount) => 1 + 0.018 * pulse * amount;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (vib.skullRim > 0.08) {
    const a = 0.72 + 0.28 * vib.skullRim * pulse;
    const rx = L.skull.rx * 1.015 * wobble(vib.skullRim);
    const ry = L.skull.ry * 1.02 * wobble(vib.skullRim);
    strokeBreathLight(ctx, a * 0.35, 2.4);
    ctx.beginPath();
    ctx.ellipse(L.skull.x, L.skull.y - L.S(6), rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    strokeBreathLight(ctx, a, 0.85 + 0.35 * pulse);
    ctx.beginPath();
    ctx.ellipse(L.skull.x, L.skull.y - L.S(6), rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (vib.chestBones > 0.08) {
    const a = 0.7 + 0.3 * vib.chestBones * pulse;
    const scale = wobble(vib.chestBones);
    const hair = 0.7 + 0.28 * pulse;
    for (const rib of L.ribs.pairs) {
      if (rib.kind === 'floating') continue;
      const drop = rib.obliquity * L.S(18);
      for (const side of [-1, 1]) {
        strokeBreathLight(ctx, a, hair);
        ctx.beginPath();
        ctx.moveTo(L.cx + side * L.S(11), rib.y - L.S(3));
        ctx.bezierCurveTo(
          L.cx + side * rib.rx * 0.42 * scale,
          rib.y - L.S(2),
          L.cx + side * rib.rx * scale,
          rib.y + drop * 0.35,
          L.cx + side * rib.rx * rib.anterior * scale,
          rib.y + drop,
        );
        ctx.stroke();
      }
    }
    strokeBreathLight(ctx, a, hair);
    ctx.beginPath();
    ctx.moveTo(L.cx - L.S(10) * scale, L.sternum.y0);
    ctx.lineTo(L.cx + L.S(10) * scale, L.sternum.y0);
    ctx.lineTo(L.cx + L.S(6) * scale, L.xiphoid.y - L.S(8));
    ctx.lineTo(L.cx, L.xiphoid.y + L.S(10));
    ctx.lineTo(L.cx - L.S(6) * scale, L.xiphoid.y - L.S(8));
    ctx.closePath();
    ctx.stroke();
    const cage = L.ribs.pairs.filter((rib) => rib.kind !== 'floating');
    if (cage.length) {
      strokeBreathLight(ctx, a * 0.95, 0.9 + 0.25 * pulse);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        cage.forEach((rib, i) => {
          const drop = rib.obliquity * L.S(18);
          const x = L.cx + side * rib.rx * scale;
          const y = rib.y + drop * 0.35;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawAirwayColumn(ctx, L, plan = {}) {
  const topY = L.brain?.stemY ?? L.spine.y0;
  const xiphoidY = L.xiphoid.y + L.S(8);
  const left = [
    { x: L.cx - L.S(7), y: xiphoidY },
    { x: L.trachea.x - L.trachea.w * 0.62, y: L.bronchi.y },
    { x: L.trachea.x - L.trachea.w * 0.58, y: L.trachea.y0 },
    { x: L.larynx.x - L.S(16), y: L.larynx.y + L.S(10) },
    { x: L.pharynx.x - L.pharynx.w * 0.48, y: L.pharynx.y1 },
    { x: L.pharynx.x - L.pharynx.w * 0.4, y: L.pharynx.y0 },
    { x: L.cx - L.S(9), y: topY },
  ];
  const right = left.map((pt) => ({ x: L.cx * 2 - pt.x, y: pt.y }));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgbaVoice(AIRWAY_COLUMN_RGB, 0.38);
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(L.cx, xiphoidY);
  ctx.lineTo(L.cx, topY);
  ctx.stroke();
  ctx.strokeStyle = rgbaVoice(AIRWAY_COLUMN_RGB, 0.96);
  ctx.lineWidth = 1.55;
  for (const side of [left, right]) {
    ctx.beginPath();
    side.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.stroke();
  }
  ctx.strokeStyle = rgbaVoice(AIRWAY_COLUMN_RGB, 0.88);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  ctx.lineTo(right[0].x, right[0].y);
  ctx.moveTo(left[left.length - 1].x, left[left.length - 1].y);
  ctx.lineTo(right[right.length - 1].x, right[right.length - 1].y);
  ctx.stroke();
  ctx.restore();
}

function fillCavityWaves(ctx, cx, cy, rx, ry, rgb, energy, timeMs, phase, formantHertz = 0) {
  const a = 0.32 + energy * 0.58;
  const g = ctx.createRadialGradient(cx, cy, 3, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`);
  g.addColorStop(0.55, `rgba(${Math.min(255, rgb.r + 40)},${Math.min(255, rgb.g + 24)},${Math.min(255, rgb.b + 30)},${a * 0.55})`);
  g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  const visualHz = formantHertz > 0 ? Math.min(7.5, Math.max(0.45, formantHertz / 90)) : 0.55;
  for (let i = 0; i < 7; i++) {
    const t = ((i / 7) + (timeMs / 1000) * visualHz + phase) % 1;
    const y = cy - ry + t * ry * 2;
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.38 + energy * 0.55})`;
    ctx.lineWidth = 3.4 + energy * 6.2;
    ctx.beginPath();
    ctx.ellipse(cx, y, rx * (0.82 + 0.1 * Math.sin(t * Math.PI)), Math.max(5, ry * 0.14), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAbdomen(ctx, L, alpha) {
  const p = L.pose;
  const cy = (L.diaphragm.y + L.abdomen.y1) * 0.5;
  const ry = (L.abdomen.y1 - L.diaphragm.y) * 0.34;
  const rx = L.abdomen.rx * (0.72 + p.abdominalExpansion * 0.08);
  const tissue = ctx.createRadialGradient(L.cx, cy, L.S(8), L.cx, cy, Math.max(rx, ry));
  tissue.addColorStop(0, `rgba(150,82,72,${0.1 + 0.1 * p.abdominalExpansion})`);
  tissue.addColorStop(1, `rgba(74,44,48,${0.04 + 0.04 * alpha})`);
  ctx.fillStyle = tissue;
  ctx.beginPath();
  ctx.ellipse(L.cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Linea alba and paired rectus abdominis compartments.
  ctx.strokeStyle = `rgba(224,148,132,${0.25 + 0.28 * p.abdominalExpansion})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(L.cx, L.diaphragm.y + L.S(14));
  ctx.lineTo(L.cx, L.abdomen.y1 - L.S(10));
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.strokeStyle = 'rgba(205,126,116,0.24)';
    ctx.beginPath();
    ctx.moveTo(L.cx + side * L.S(8), L.diaphragm.y + L.S(18));
    ctx.quadraticCurveTo(
      L.cx + side * L.S(17),
      cy,
      L.cx + side * L.S(11),
      L.abdomen.y1 - L.S(14),
    );
    ctx.stroke();

    // External oblique fiber direction.
    for (let i = 0; i < 4; i++) {
      const y = L.diaphragm.y + L.S(25 + i * 24);
      ctx.beginPath();
      ctx.moveTo(L.cx + side * rx * 0.86, y);
      ctx.lineTo(L.cx + side * L.S(22), y + L.S(18));
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(232,158,142,0.2)';
  for (let i = 1; i <= 3; i++) {
    const y = L.diaphragm.y + (L.abdomen.y1 - L.diaphragm.y) * (i / 4);
    ctx.beginPath();
    ctx.moveTo(L.cx - L.S(16), y);
    ctx.quadraticCurveTo(L.cx, y + L.S(2), L.cx + L.S(16), y);
    ctx.stroke();
  }

  // Umbilicus.
  ctx.fillStyle = 'rgba(48,24,28,0.72)';
  ctx.beginPath();
  ctx.ellipse(L.cx, cy + L.S(12), L.S(2.4), L.S(1.6), 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawClavicles(ctx, L) {
  ctx.strokeStyle = rgbaVoice(BONE_RGB, 0.88);
  ctx.lineWidth = 2.6;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(L.cx + side * L.S(8), L.clavicle.y + L.S(4));
    ctx.quadraticCurveTo(
      L.cx + side * L.clavicle.span * 0.55,
      L.clavicle.y - L.S(6),
      L.cx + side * L.clavicle.span,
      L.shoulders.y + L.S(2),
    );
    ctx.stroke();
  }
}

function drawRibCage(ctx, L) {
  const p = L.pose;
  for (const rib of L.ribs.pairs) {
    const baseWidth = rib.kind === 'true' ? 2.35 : rib.kind === 'false' ? 1.95 : 1.55;
    for (const side of [-1, 1]) {
      const posteriorX = L.cx + side * L.S(11);
      const lateralX = L.cx + side * rib.rx;
      const anteriorX = L.cx + side * rib.rx * rib.anterior;
      const drop = rib.obliquity * L.S(18);
      const strokeRib = (color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(posteriorX, rib.y - L.S(3));
        ctx.bezierCurveTo(
          L.cx + side * rib.rx * 0.42,
          rib.y - L.S(2),
          lateralX,
          rib.y + drop * 0.35,
          anteriorX,
          rib.y + drop,
        );
        ctx.stroke();
      };
      strokeRib('rgba(8,16,22,0.82)', baseWidth + 1.7);
      strokeRib(`rgba(${BONE_RGB.r},${BONE_RGB.g},${BONE_RGB.b},${0.88 + 0.1 * p.ribExpansion})`, baseWidth);
    }
    if (rib.kind === 'true') {
      ctx.strokeStyle = rgbaVoice(BONE_RGB, 0.7);
      ctx.lineWidth = 1.35;
      for (const side of [-1, 1]) {
        const startX = L.cx + side * rib.rx * rib.anterior;
        const startY = rib.y + rib.obliquity * L.S(18);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(
          L.cx + side * L.S(14 + rib.index),
          startY + L.S(5),
          L.cx + side * L.S(7),
          L.sternum.y0 + (rib.index - 1) / 6 * (L.xiphoid.y - L.sternum.y0 - L.S(10)),
        );
        ctx.stroke();
      }
    } else if (rib.kind === 'false') {
      ctx.strokeStyle = rgbaVoice(BONE_RGB, 0.62);
      ctx.lineWidth = 1.15;
      for (const side of [-1, 1]) {
        const startX = L.cx + side * rib.rx * rib.anterior;
        const startY = rib.y + rib.obliquity * L.S(18);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(
          L.cx + side * L.S(28),
          startY - L.S(8),
          L.cx + side * L.S(12),
          L.xiphoid.y - L.S(6),
        );
        ctx.stroke();
      }
    }
  }
}

function drawSternum(ctx, L) {
  ctx.fillStyle = rgbaVoice(BONE_RGB, 0.18);
  ctx.strokeStyle = rgbaVoice(BONE_RGB, 0.92);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(L.cx - L.S(10), L.sternum.y0);
  ctx.lineTo(L.cx + L.S(10), L.sternum.y0);
  ctx.lineTo(L.cx + L.S(7), L.sternum.y0 + L.S(12));
  ctx.lineTo(L.cx + L.S(6), L.xiphoid.y - L.S(8));
  ctx.lineTo(L.cx, L.xiphoid.y + L.S(10));
  ctx.lineTo(L.cx - L.S(6), L.xiphoid.y - L.S(8));
  ctx.lineTo(L.cx - L.S(7), L.sternum.y0 + L.S(12));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawLungs(ctx, L, transparent) {
  const p = L.pose;
  const a = (transparent ? 0.16 : 0.36) + 0.22 * p.lungVolume;
  drawOneLung(ctx, L, L.lungs.right, a, p);
  drawOneLung(ctx, L, L.lungs.left, a, p);
}

function drawOneLung(ctx, L, lung, a, p) {
  const side = lung.side;
  const g = ctx.createRadialGradient(lung.x, lung.y, L.S(10), lung.x, lung.y, Math.max(lung.rx, lung.ry));
  g.addColorStop(0, `rgba(132,210,214,${a + 0.14})`);
  g.addColorStop(0.55, `rgba(${LUNG_RGB.r},${LUNG_RGB.g},${LUNG_RGB.b},${a + 0.08})`);
  g.addColorStop(1, `rgba(28,70,92,${a})`);
  ctx.fillStyle = g;
  ctx.strokeStyle = `rgba(150,210,220,${0.4 + 0.32 * p.lungVolume})`;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  traceLungOutline(ctx, L, lung);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(188,228,232,0.32)';
  ctx.lineWidth = 1;
  if (lung.lobes === 3) {
    ctx.beginPath();
    ctx.moveTo(lung.x + side * lung.rx * 0.08, lung.y - lung.ry * 0.12);
    ctx.quadraticCurveTo(lung.x + side * lung.rx * 0.7, lung.y - lung.ry * 0.02, lung.x + side * lung.rx * 0.92, lung.y + lung.ry * 0.02);
    ctx.moveTo(lung.x + side * lung.rx * 0.02, lung.apexY + L.S(28));
    ctx.quadraticCurveTo(lung.x + side * lung.rx * 0.35, lung.y + lung.ry * 0.08, lung.x + side * lung.rx * 0.2, lung.baseY - L.S(8));
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(lung.x - side * lung.rx * 0.12, lung.y - lung.ry * 0.08);
    ctx.quadraticCurveTo(lung.x + side * lung.rx * 0.45, lung.y + lung.ry * 0.12, lung.x + side * lung.rx * 0.82, lung.y + lung.ry * 0.28);
    ctx.stroke();
  }
}

function traceLungOutline(ctx, L, lung) {
  const side = lung.side;
  const apexX = lung.x + side * L.S(4);
  const lateralX = lung.x + side * lung.rx;
  const medialX = side < 0 ? lung.x - side * lung.rx * 0.55 : (lung.notchX ?? lung.x - side * lung.rx * 0.2);
  ctx.moveTo(apexX, lung.apexY);
  ctx.bezierCurveTo(
    lung.x + side * lung.rx * 0.55, lung.apexY + L.S(4),
    lateralX, lung.y - lung.ry * 0.45,
    lateralX, lung.y,
  );
  ctx.bezierCurveTo(
    lateralX, lung.y + lung.ry * 0.55,
    lung.x + side * lung.rx * 0.62, lung.baseY,
    lung.x + side * L.S(8), lung.baseY,
  );
  if (side > 0 && lung.notchX != null) {
    ctx.bezierCurveTo(
      lung.x - L.S(6), lung.baseY - L.S(8),
      lung.notchX + L.S(8), lung.notchY + L.S(16),
      lung.notchX, lung.notchY,
    );
    ctx.bezierCurveTo(
      lung.notchX + L.S(6), lung.y - lung.ry * 0.15,
      lung.x, lung.apexY + L.S(22),
      apexX, lung.apexY,
    );
  } else {
    ctx.bezierCurveTo(
      lung.x - side * lung.rx * 0.15, lung.baseY - L.S(18),
      medialX, lung.y + L.S(8),
      medialX, lung.y - lung.ry * 0.15,
    );
    ctx.bezierCurveTo(
      medialX, lung.apexY + L.S(28),
      lung.x, lung.apexY + L.S(10),
      apexX, lung.apexY,
    );
  }
}

function drawCirculatorySystem(ctx, L, circulation) {
  const arterial = 'rgba(248,76,91,0.92)';
  const arterialSoft = 'rgba(255,126,118,0.64)';
  const venous = 'rgba(70,129,228,0.92)';
  const venousSoft = 'rgba(102,164,239,0.62)';

  // Major systemic, pulmonary, and cervical vessels.
  for (const path of ['aorta', 'carotidL', 'carotidR']) {
    drawVesselPath(ctx, L, path, arterial, path === 'aorta' ? 5.2 : 2.8);
  }
  for (const path of ['venaCava', 'jugularL', 'jugularR']) {
    drawVesselPath(ctx, L, path, venous, path === 'venaCava' ? 5 : 2.8);
  }
  for (const path of ['pulmonaryArteryL', 'pulmonaryArteryR']) {
    drawVesselPath(ctx, L, path, venous, 3.6);
  }
  for (const path of ['pulmonaryVeinL', 'pulmonaryVeinR']) {
    drawVesselPath(ctx, L, path, arterial, 3.3);
  }

  // Pulmonary capillary fans show the gas-exchange circuit without claiming
  // measured perfusion.
  for (const lung of [L.lungs.right, L.lungs.left]) {
    for (let branch = -2; branch <= 2; branch++) {
      const y = lung.y + branch * L.S(14);
      ctx.strokeStyle = branch % 2 ? venousSoft : arterialSoft;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(L.cx + lung.side * L.S(16), L.bronchi.y + L.S(15));
      ctx.quadraticCurveTo(
        lung.x,
        lung.y + branch * L.S(6),
        lung.x + lung.side * lung.rx * 0.72,
        y,
      );
      ctx.stroke();
    }
  }

  drawDetailedHeart(ctx, L, circulation, { arterial, venous });

  for (const particle of circulation.particles) {
    const point = circulationPathPoint(L, particle.t, particle.path);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    ctx.fillStyle = particle.kind === 'arterial'
      ? `rgba(255,154,132,${particle.alpha * (0.78 + circulation.respiratoryCoupling * 0.22)})`
      : `rgba(126,184,255,${particle.alpha * (0.78 + circulation.respiratoryCoupling * 0.22)})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVesselPath(ctx, L, path, color, width) {
  const points = circulationWaypoints(L, path);
  if (!points.length) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width * L.scale;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
}

function drawDetailedHeart(ctx, L, circulation, colors) {
  const h = L.heart;
  const rx = h.rx * circulation.pulseScale;
  const ry = h.ry * circulation.pulseScale;
  const glow = ctx.createRadialGradient(h.x, h.y, L.S(4), h.x, h.y, ry * 1.3);
  glow.addColorStop(0, 'rgba(245,72,91,0.2)');
  glow.addColorStop(1, 'rgba(245,72,91,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(h.x, h.y, rx * 1.35, ry * 1.35, 0, 0, Math.PI * 2);
  ctx.fill();
  const tissue = ctx.createRadialGradient(h.x - rx * 0.22, h.y - ry * 0.24, L.S(2), h.x, h.y, ry);
  tissue.addColorStop(0, 'rgba(242,118,126,0.92)');
  tissue.addColorStop(0.55, 'rgba(173,52,73,0.9)');
  tissue.addColorStop(1, 'rgba(82,25,45,0.88)');
  ctx.fillStyle = tissue;
  ctx.strokeStyle = 'rgba(255,164,168,0.82)';
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(h.x, h.y + ry);
  ctx.bezierCurveTo(h.x - rx * 1.15, h.y + ry * 0.22, h.x - rx, h.y - ry * 0.72, h.x - rx * 0.36, h.y - ry * 0.72);
  ctx.bezierCurveTo(h.x - rx * 0.08, h.y - ry * 0.72, h.x, h.y - ry * 0.47, h.x, h.y - ry * 0.38);
  ctx.bezierCurveTo(h.x + rx * 0.08, h.y - ry * 0.52, h.x + rx * 0.22, h.y - ry * 0.78, h.x + rx * 0.48, h.y - ry * 0.76);
  ctx.bezierCurveTo(h.x + rx * 1.06, h.y - ry * 0.72, h.x + rx * 1.13, h.y + ry * 0.22, h.x, h.y + ry);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Four chamber fields and the interventricular septum.
  const chamberAlpha = 0.34 + (circulation.pulseScale - 1) * 2;
  ctx.fillStyle = `rgba(82,130,210,${chamberAlpha})`;
  ctx.beginPath();
  ctx.ellipse(h.x - rx * 0.34, h.y - ry * 0.3, rx * 0.27, ry * 0.22, -0.15, 0, Math.PI * 2);
  ctx.ellipse(h.x - rx * 0.3, h.y + ry * 0.28, rx * 0.34, ry * 0.43, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(235,92,102,${chamberAlpha})`;
  ctx.beginPath();
  ctx.ellipse(h.x + rx * 0.3, h.y - ry * 0.28, rx * 0.25, ry * 0.2, 0.15, 0, Math.PI * 2);
  ctx.ellipse(h.x + rx * 0.3, h.y + ry * 0.25, rx * 0.32, ry * 0.46, -0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,204,196,0.58)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(h.x, h.y - ry * 0.5);
  ctx.quadraticCurveTo(h.x - rx * 0.05, h.y + ry * 0.2, h.x, h.y + ry * 0.72);
  ctx.stroke();

  // Atrioventricular valve planes.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(h.x + side * rx * 0.27, h.y - ry * 0.02, rx * 0.17, ry * 0.07, side * 0.12, 0, Math.PI);
    ctx.stroke();
  }

  // Coronary vessels over the myocardium.
  ctx.strokeStyle = colors.arterial;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(h.x + rx * 0.08, h.y - ry * 0.62);
  ctx.quadraticCurveTo(h.x + rx * 0.45, h.y - ry * 0.05, h.x + rx * 0.18, h.y + ry * 0.72);
  ctx.moveTo(h.x + rx * 0.2, h.y - ry * 0.08);
  ctx.quadraticCurveTo(h.x + rx * 0.62, h.y + ry * 0.08, h.x + rx * 0.72, h.y + ry * 0.34);
  ctx.stroke();
  ctx.strokeStyle = colors.venous;
  ctx.beginPath();
  ctx.moveTo(h.x - rx * 0.02, h.y - ry * 0.56);
  ctx.quadraticCurveTo(h.x - rx * 0.5, h.y + ry * 0.04, h.x - rx * 0.18, h.y + ry * 0.68);
  ctx.stroke();
}

function drawDiaphragm(ctx, L) {
  const { y, span, dome } = L.diaphragm;
  ctx.strokeStyle = 'rgba(210, 130, 140, 0.88)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(L.cx - span, y + L.S(10));
  ctx.bezierCurveTo(
    L.cx - span * 0.55, y + L.S(4),
    L.cx - L.S(18), y - dome,
    L.cx, y - dome * 0.35,
  );
  ctx.bezierCurveTo(
    L.cx + L.S(18), y - dome,
    L.cx + span * 0.55, y + L.S(4),
    L.cx + span, y + L.S(10),
  );
  ctx.stroke();
  ctx.fillStyle = 'rgba(180, 110, 120, 0.14)';
  ctx.lineTo(L.cx + span, y + L.S(22));
  ctx.quadraticCurveTo(L.cx, y + L.S(14), L.cx - span, y + L.S(22));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(232, 176, 182, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(L.cx - L.S(16), y - dome * 0.1);
  ctx.quadraticCurveTo(L.cx, y - dome * 0.55, L.cx + L.S(16), y - dome * 0.1);
  ctx.stroke();
}

function drawTrachea(ctx, L) {
  const rings = 8;
  ctx.fillStyle = rgbaVoice(TRACT_RGB, 0.08);
  ctx.fillRect(L.trachea.x - L.trachea.w / 2, L.trachea.y0, L.trachea.w, L.trachea.y1 - L.trachea.y0);
  ctx.strokeStyle = rgbaVoice(TRACT_RGB, 0.42);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < rings; i++) {
    const y = L.trachea.y0 + (i / (rings - 1)) * (L.bronchi.y - L.trachea.y0);
    ctx.beginPath();
    ctx.ellipse(L.trachea.x, y, L.trachea.w * 0.62, L.S(2.2), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(L.trachea.x, L.bronchi.y);
  ctx.quadraticCurveTo(L.cx - L.S(18), L.bronchi.y + L.S(14), L.lungs.right.x + L.S(8), L.lungs.right.y - L.lungs.right.ry * 0.2);
  ctx.moveTo(L.trachea.x, L.bronchi.y);
  ctx.quadraticCurveTo(L.cx + L.S(18), L.bronchi.y + L.S(14), L.lungs.left.x - L.S(8), L.lungs.left.y - L.lungs.left.ry * 0.2);
  ctx.stroke();
}

function drawNeck(ctx, L, alpha, plan = {}) {
  const a = Math.min(0.55, alpha + 0.08);
  for (const side of [-1, 1]) {
    ctx.fillStyle = `rgba(28, 38, 50,${a})`;
    ctx.strokeStyle = rgbaVoice(OUTLINE_RGB, 0.35);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(L.neck.x + side * L.neck.w * 0.18, L.neck.y0);
    ctx.lineTo(L.neck.x + side * L.neck.w * 0.58, L.neck.y0 + L.S(4));
    ctx.quadraticCurveTo(
      L.neck.x + side * L.neck.w * 0.78, (L.neck.y0 + L.neck.y1) / 2,
      L.neck.x + side * L.neck.w * 0.7, L.neck.y1,
    );
    ctx.lineTo(L.neck.x + side * L.neck.w * 0.22, L.neck.y1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  drawNeckMuscles(ctx, L, plan);
}

function muscleColor(amount, relaxed) {
  if (amount > 0.08) {
    const g = Math.round(150 - 90 * amount);
    const b = Math.round(48 - 24 * amount);
    return {
      fill: `rgba(255,${g},${b},${0.22 + 0.5 * amount})`,
      stroke: `rgba(255,${Math.round(g + 40)},${b},${0.55 + 0.35 * amount})`,
    };
  }
  if (relaxed > 0.2) {
    return {
      fill: `rgba(90, 196, 150,${0.12 + 0.28 * relaxed})`,
      stroke: `rgba(160, 230, 190,${0.45 + 0.35 * relaxed})`,
    };
  }
  return {
    fill: rgbaVoice(MUSCLE_RGB, 0.1),
    stroke: rgbaVoice(MUSCLE_RGB, 0.26),
  };
}

function strokeMuscle(ctx, points, width, color) {
  ctx.strokeStyle = color.fill;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.stroke();
  ctx.strokeStyle = color.stroke;
  ctx.lineWidth = Math.max(1.2, width * 0.28);
  ctx.beginPath();
  points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.stroke();
}

function drawNeckMuscles(ctx, L, plan) {
  const throat = plan.tension?.throat || 0;
  const torso = plan.tension?.torso || 0;
  const support = plan.support?.evidenceClass !== 'unknown' ? (plan.support?.value || 0) : 0;
  const organized = support > 0.35 ? clamp(support * (1 - throat * 0.7)) : 0;
  const scm = muscleColor(throat, organized);
  const trap = muscleColor(torso, organized);
  const strap = muscleColor(throat * 0.45, organized);

  for (const side of [-1, 1]) {
    const mastoid = { x: L.cx + side * (L.skull.rx * 0.72), y: L.skull.y + L.skull.ry * 0.42 };
    const sternal = { x: L.cx + side * L.S(9), y: L.clavicle.y + L.S(4) };
    const clavicular = { x: L.cx + side * L.clavicle.span * 0.42, y: L.clavicle.y + L.S(2) };
    const mid = { x: L.cx + side * L.neck.w * 0.38, y: (L.neck.y0 + L.neck.y1) * 0.52 };
    strokeMuscle(ctx, [mastoid, mid, sternal], L.S(2.6 + throat * 2.4), scm);
    strokeMuscle(ctx, [mastoid, { x: L.cx + side * L.neck.w * 0.48, y: L.neck.y1 - L.S(8) }, clavicular], L.S(2.1 + throat * 1.8), scm);

    const occiput = { x: L.cx + side * L.S(16), y: L.skull.y + L.skull.ry * 0.55 };
    const acromion = { x: L.cx + side * L.shoulders.span * 0.92, y: L.shoulders.y + L.S(8) };
    strokeMuscle(ctx, [occiput, { x: L.cx + side * L.S(48), y: L.shoulders.y - L.S(4) }, acromion], L.S(3.2 + torso * 2.4), trap);

    const scaleTop = { x: L.cx + side * L.S(11), y: L.hyoid.y - L.S(6) };
    const firstRib = { x: L.cx + side * L.S(28), y: L.ribs.y0 + L.S(6) };
    strokeMuscle(ctx, [scaleTop, firstRib], L.S(2.2), strap);

    const hyoid = { x: L.cx + side * L.S(7), y: L.hyoid.y };
    const sternum = { x: L.cx + side * L.S(6), y: L.sternum.y0 + L.S(8) };
    strokeMuscle(ctx, [hyoid, sternum], L.S(1.8), strap);
  }
}

function drawPharynx(ctx, L, plan) {
  const a = plan.transparent ? 0.16 : 0.28;
  ctx.fillStyle = rgbaVoice(TRACT_RGB, a);
  ctx.beginPath();
  ctx.moveTo(L.pharynx.x - L.pharynx.w / 2, L.pharynx.y0);
  ctx.lineTo(L.pharynx.x + L.pharynx.w / 2, L.pharynx.y0);
  ctx.lineTo(L.pharynx.x + L.pharynx.w * 0.7, L.pharynx.y1);
  ctx.lineTo(L.pharynx.x - L.pharynx.w * 0.7, L.pharynx.y1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgbaVoice(TRACT_RGB, 0.55);
  ctx.lineWidth = 2.4;
  ctx.stroke();
}

function drawLarynx(ctx, L, plan = {}) {
  const open = L.larynx.glottisOpen;
  const vib = plan.structureVibration || {};
  const timeMs = plan.timeMs || 0;
  const pulse = vib.throatCartilage > 0.08 && vib.visualHz > 0
    ? 0.55 + 0.45 * Math.sin(((timeMs / 1000) * vib.visualHz) % 1 * Math.PI * 2)
    : 1;
  const scale = 1 + 0.02 * (vib.throatCartilage || 0) * pulse;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = rgbaVoice(LARYNX_RGB, 0.42);
  ctx.beginPath();
  ctx.moveTo(L.larynx.x, L.larynx.y - L.S(12) * scale);
  ctx.lineTo(L.larynx.x + L.S(16) * scale, L.larynx.y + L.S(5));
  ctx.lineTo(L.larynx.x + L.S(10) * scale, L.larynx.y + L.S(14) * scale);
  ctx.lineTo(L.larynx.x - L.S(10) * scale, L.larynx.y + L.S(14) * scale);
  ctx.lineTo(L.larynx.x - L.S(16) * scale, L.larynx.y + L.S(5));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgbaVoice(LARYNX_RGB, 0.98);
  ctx.lineWidth = 2.35;
  ctx.stroke();

  ctx.strokeStyle = rgbaVoice(LARYNX_RGB, 0.9);
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(L.cx - L.S(15) * scale, L.hyoid.y);
  ctx.quadraticCurveTo(L.cx, L.hyoid.y - L.S(5) * scale, L.cx + L.S(15) * scale, L.hyoid.y);
  ctx.stroke();

  ctx.strokeStyle = rgbaVoice(LARYNX_RGB, 0.7);
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.ellipse(L.larynx.x, L.larynx.y + L.S(16) * scale, L.S(9) * scale, L.S(3.2), 0, 0, Math.PI * 2);
  ctx.stroke();

  const f = plan.actualPitch?.frequencyHertz;
  const phon = plan.airflow?.phonated && f;
  const wiggle = phon ? Math.sin(timeMs * 0.001 * Math.min(f, 14) * 0.55) * 1.8 : 0;
  const gap = L.S(1.2 + open * 7);
  ctx.strokeStyle = 'rgba(255, 248, 255, 0.96)';
  ctx.lineWidth = 1.85;
  ctx.beginPath();
  ctx.moveTo(L.larynx.x - L.S(7), L.larynx.y - gap + wiggle);
  ctx.quadraticCurveTo(L.larynx.x, L.larynx.y - gap * 0.2 + wiggle, L.larynx.x + L.S(7), L.larynx.y - gap - wiggle);
  ctx.moveTo(L.larynx.x - L.S(7), L.larynx.y + gap - wiggle);
  ctx.quadraticCurveTo(L.larynx.x, L.larynx.y + gap * 0.2 - wiggle, L.larynx.x + L.S(7), L.larynx.y + gap + wiggle);
  ctx.stroke();
  ctx.restore();
}

function drawEmbeddedSagittalHead(ctx, L, plan) {
  const cam = sagittalCameraForFigure(L);
  const pad = L.S(10);
  const box = {
    x: cam.cx + SAGITTAL_LOCAL.occiputX * cam.S - pad,
    y: cam.cy + SAGITTAL_LOCAL.vaultY * cam.S - pad,
    w: (SAGITTAL_LOCAL.faceX - SAGITTAL_LOCAL.occiputX) * cam.S + pad * 2,
    h: (SAGITTAL_LOCAL.larynxY - SAGITTAL_LOCAL.vaultY) * cam.S + pad * 2,
  };
  const state = skullCloseupState(null, plan);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  drawSagittalHead(ctx, L.W, L.H, state, plan.timeMs || 0, {
    yaw: 0,
    compact: true,
    originX: 0,
    originY: 0,
    camera: cam,
  });
  ctx.restore();
}

function drawSkull(ctx, L, plan) {
  const { x, y, rx, ry } = L.skull;
  const vagus = Boolean(plan.vagus?.active);
  const a = plan.transparent ? 0.22 : (vagus ? 0.14 : 0.58);
  ctx.fillStyle = vagus ? `rgba(72, 24, 42, ${a})` : `rgba(32,44,56,${a})`;
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.7, y + ry * 0.28);
  ctx.bezierCurveTo(x - rx * 1.08, y + ry * 0.02, x - rx * 1.02, y - ry * 0.55, x - rx * 0.4, y - ry * 0.98);
  ctx.bezierCurveTo(x, y - ry * 1.12, x + rx * 0.4, y - ry * 0.98, x + rx * 0.4, y - ry * 0.98);
  ctx.bezierCurveTo(x + rx * 1.02, y - ry * 0.55, x + rx * 1.08, y + ry * 0.02, x + rx * 0.7, y + ry * 0.28);
  ctx.quadraticCurveTo(x, y + ry * 0.12, x - rx * 0.7, y + ry * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgbaVoice(OUTLINE_RGB, 0.88);
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(190,205,218,0.28)';
  ctx.beginPath();
  ctx.moveTo(x, y - ry * 0.95);
  ctx.lineTo(x, y + ry * 0.08);
  ctx.moveTo(x - rx * 0.55, y - ry * 0.15);
  ctx.quadraticCurveTo(x, y - ry * 0.05, x + rx * 0.55, y - ry * 0.15);
  ctx.stroke();

  ctx.fillStyle = 'rgba(8,12,16,0.55)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + side * L.orbit.gap / 2, L.orbit.y, L.orbit.rx, L.orbit.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawEyes(ctx, L, plan);
  drawMouthOpening(ctx, L);
}

function drawMouthOpening(ctx, L) {
  const m = L.mouth;
  if (!m) return;
  ctx.fillStyle = `rgba(18,4,8,${0.62 + m.open * 0.32})`;
  ctx.strokeStyle = 'rgba(196,92,92,0.78)';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (m.open > 0.12) {
    ctx.fillStyle = `rgba(120,42,48,${0.35 + m.open * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y + m.ry * 0.15, m.rx * 0.72, m.ry * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEyes(ctx, L, plan) {
  const timeMs = plan.timeMs || 0;
  const cycle = timeMs % 4200;
  const lid = cycle < 90 ? cycle / 90 : cycle < 150 ? 1 - (cycle - 90) / 60 : 0;
  const gazeX = Math.sin(timeMs * 0.00062) * 0.28;
  const gazeY = Math.cos(timeMs * 0.00048) * 0.1;
  for (const side of [-1, 1]) {
    const ox = L.skull.x + side * L.orbit.gap / 2;
    const oy = L.orbit.y + L.S(1);
    const rx = L.orbit.rx * 1.08;
    const ry = L.orbit.ry * 1.18;
    ctx.fillStyle = 'rgba(236,232,224,0.96)';
    ctx.strokeStyle = 'rgba(48,36,40,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const irisX = ox + gazeX * rx * 0.42 + side * rx * 0.04;
    const irisY = oy + gazeY * ry * 0.35;
    const irisR = Math.min(rx, ry) * 0.58;
    const iris = ctx.createRadialGradient(irisX - irisR * 0.2, irisY - irisR * 0.25, irisR * 0.08, irisX, irisY, irisR);
    iris.addColorStop(0, 'rgba(186,214,196,1)');
    iris.addColorStop(0.35, 'rgba(58,122,118,1)');
    iris.addColorStop(0.72, 'rgba(18,62,78,1)');
    iris.addColorStop(1, 'rgba(8,24,32,1)');
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(irisX, irisY, irisR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(210,236,228,0.28)';
    ctx.lineWidth = 0.7;
    for (let fiber = 0; fiber < 10; fiber++) {
      const a = fiber * Math.PI / 5;
      ctx.beginPath();
      ctx.moveTo(irisX, irisY);
      ctx.lineTo(irisX + Math.cos(a) * irisR, irisY + Math.sin(a) * irisR);
      ctx.stroke();
    }

    const pupilR = irisR * 0.42;
    ctx.fillStyle = 'rgba(4,6,10,0.96)';
    ctx.beginPath();
    ctx.arc(irisX, irisY, pupilR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.ellipse(irisX - pupilR * 0.35, irisY - pupilR * 0.4, pupilR * 0.28, pupilR * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(irisX + pupilR * 0.38, irisY + pupilR * 0.22, pupilR * 0.1, 0, Math.PI * 2);
    ctx.fill();

    if (lid > 0.04) {
      ctx.fillStyle = `rgba(42,32,36,${0.88 * lid})`;
      ctx.beginPath();
      ctx.ellipse(ox, oy - ry * (1 - lid), rx * 1.05, ry * lid * 1.15, 0, Math.PI, 0, true);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ox, oy + ry * (1 - lid), rx * 1.05, ry * lid * 0.85, 0, 0, Math.PI, false);
      ctx.fill();
    }
  }
}

function drawRegisterVoiceFields(ctx, L, plan = {}, options = {}) {
  const amounts = registerVoiceAmounts(plan.inferredRegistration || {});
  const { chest, head, mixed, mixedRgb } = amounts;
  if (chest < 0.04 && head < 0.04 && mixed < 0.04) return;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  if (chest > 0.04) {
    const a = 0.22 + 0.42 * chest;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(L.cx, L.lungs.y + L.S(6), L.ribs.rx * 0.82, L.lungs.ry * 0.96, 0, 0, Math.PI * 2);
    ctx.clip();
    const g = ctx.createRadialGradient(
      L.cx, L.lungs.y + L.S(10), L.S(6),
      L.cx, L.lungs.y + L.S(8), L.ribs.rx * 0.82,
    );
    g.addColorStop(0, rgbaVoice(CHEST_VOICE_RGB, a));
    g.addColorStop(0.72, rgbaVoice(CHEST_VOICE_RGB, a * 0.32));
    g.addColorStop(1, rgbaVoice(CHEST_VOICE_RGB, 0));
    ctx.fillStyle = g;
    ctx.fillRect(L.cx - L.ribs.rx, L.ribs.y0 - L.S(8), L.ribs.rx * 2, L.ribs.y1 - L.ribs.y0 + L.S(16));
    ctx.restore();
    ctx.strokeStyle = rgbaVoice(CHEST_VOICE_RGB, 0.55 + 0.35 * chest);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(L.cx, L.lungs.y + L.S(8), L.ribs.rx * 0.72, L.lungs.ry * 0.82, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Head and mixed live on the shared sagittal skull so zoom-in matches zoom-out.
  const transition = plan.inferredRegistration?.transition;
  if (transition) {
    const pulse = ((plan.timeMs || 0) * 0.001) % 1;
    const y0 = L.pharynx.y0;
    const y1 = L.larynx.y + L.S(8);
    const y = y0 + (y1 - y0) * (transition.abrupt ? Math.min(1, pulse * 2.2) : pulse);
    ctx.fillStyle = rgbaVoice(mixedRgb, 0.85);
    ctx.beginPath();
    ctx.arc(L.cx, y, transition.abrupt ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (options.legend !== false) drawRegisterVoiceLegend(ctx, L, amounts);
}

function drawChamberResonanceLegend(ctx, L, chambers = {}, origin = null) {
  const x = origin?.x ?? (L.W - L.S(118));
  const y0 = origin?.y ?? (L.H - L.S(70));
  const swatch = (rgb, label, amount, y) => {
    ctx.fillStyle = rgbaVoice(rgb, 0.28 + 0.7 * Math.max(0.18, amount));
    ctx.fillRect(x, y - 7, 10, 10);
    ctx.fillStyle = amount > 0.12
      ? rgbaVoice(rgb, 0.98)
      : 'rgba(150,162,178,0.45)';
    ctx.fillText(`${label} ${Math.round(amount * 100)}%`, x + 16, y);
  };
  ctx.save();
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(174,194,207,0.78)';
  ctx.fillText('resonance · filter', x, y0);
  ctx.font = '9px "JetBrains Mono", monospace';
  swatch(CHEST_CHAMBER_RGB, 'chest', Number(chambers.oral) || 0, y0 + 16);
  swatch(THROAT_CHAMBER_RGB, 'throat', Number(chambers.pharynx) || 0, y0 + 30);
  swatch(SKULL_CHAMBER_RGB, 'head', Number(chambers.nasal) || 0, y0 + 44);
  ctx.restore();
}

function drawRegisterVoiceLegend(ctx, L, amounts, origin = null) {
  const x = origin?.x ?? L.S(14);
  const y0 = origin?.y ?? (L.H - L.S(70));
  const swatch = (rgb, label, amount, y) => {
    ctx.fillStyle = rgbaVoice(rgb, 0.22 + 0.7 * Math.max(0.18, amount));
    ctx.fillRect(x, y - 7, 10, 10);
    ctx.fillStyle = amount > 0.12
      ? rgbaVoice(rgb, 0.95)
      : 'rgba(150,162,178,0.45)';
    ctx.fillText(`${label} ${Math.round(amount * 100)}%`, x + 16, y);
  };
  ctx.save();
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(174,194,207,0.78)';
  ctx.fillText('register · source', x, y0);
  ctx.font = '9px "JetBrains Mono", monospace';
  swatch(CHEST_VOICE_RGB, 'chest', amounts.chest, y0 + 16);
  swatch(amounts.mixedRgb, 'mixed', amounts.mixed, y0 + 30);
  swatch(HEAD_VOICE_RGB, 'head', amounts.head, y0 + 44);
  ctx.restore();
}

function drawNasalCavity(ctx, L, plan) {
  const res = plan.breathResonance?.chambers?.nasal || 0;
  const rgb = res > 0.04 ? SKULL_CHAMBER_RGB : TRACT_RGB;
  ctx.strokeStyle = rgbaVoice(rgb, 0.5 + res * 0.35);
  ctx.fillStyle = rgbaVoice(rgb, (plan.transparent ? 0.06 : 0.12) + res * 0.42);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(L.nasal.x, L.nasal.y - L.nasal.ry);
  ctx.bezierCurveTo(
    L.nasal.x + L.nasal.rx, L.nasal.y - L.nasal.ry * 0.3,
    L.nasal.x + L.nasal.rx * 0.8, L.nasal.y + L.nasal.ry * 0.5,
    L.nasal.x + L.S(4), L.nasal.y + L.nasal.ry,
  );
  ctx.lineTo(L.nasal.x - L.S(4), L.nasal.y + L.nasal.ry);
  ctx.bezierCurveTo(
    L.nasal.x - L.nasal.rx * 0.8, L.nasal.y + L.nasal.ry * 0.5,
    L.nasal.x - L.nasal.rx, L.nasal.y - L.nasal.ry * 0.3,
    L.nasal.x, L.nasal.y - L.nasal.ry,
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(L.nasal.x, L.nasal.y - L.nasal.ry * 0.7);
  ctx.lineTo(L.nasal.x, L.nasal.y + L.nasal.ry * 0.75);
  ctx.stroke();
}

function drawOralCavity(ctx, L, plan) {
  const res = plan.breathResonance?.chambers?.oral || 0;
  const rgb = res > 0.04 ? CHEST_CHAMBER_RGB : TRACT_RGB;
  ctx.strokeStyle = rgbaVoice(rgb, 0.55 + res * 0.3);
  ctx.fillStyle = rgbaVoice(rgb, (plan.transparent ? 0.07 : 0.14) + res * 0.42);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(L.oral.x, L.oral.y, L.oral.rx, L.oral.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,160,140,0.4)';
  ctx.beginPath();
  ctx.ellipse(L.oral.x, L.oral.y + L.S(3), L.oral.rx * 0.7, L.oral.ry * 0.35, 0, 0, Math.PI);
  ctx.stroke();
}

function drawJaw(ctx, L) {
  ctx.strokeStyle = rgbaVoice(OUTLINE_RGB, 0.8);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(L.cx - L.jaw.w, L.skull.y + L.skull.ry * 0.22);
  ctx.lineTo(L.cx - L.jaw.w * 0.92, L.jaw.y - L.S(6));
  ctx.quadraticCurveTo(L.cx, L.jaw.y + L.S(16), L.cx + L.jaw.w * 0.92, L.jaw.y - L.S(6));
  ctx.lineTo(L.cx + L.jaw.w, L.skull.y + L.skull.ry * 0.22);
  ctx.stroke();
}

function drawVowelSensation(ctx, L, vowel = {}) {
  if (!vowel || vowel.evidenceClass === 'unknown' || !(vowel.confidence > 0.18)) return;
  drawVowelMeter(ctx, L, vowel);
}

function drawVowelMeter(ctx, L, vowel) {
  const x = L.S(14);
  const y = L.skull.y - L.skull.ry + L.S(78);
  const barW = L.S(46);
  const rows = [
    { label: 'chest', color: 'rgba(255,122,60,0.95)', value: vowel.chest || 0 },
    { label: 'mixed', color: 'rgba(180,210,140,0.95)', value: vowel.mixed || 0 },
    { label: 'head', color: 'rgba(186,150,255,0.95)', value: vowel.head || 0 },
  ];
  ctx.textAlign = 'left';
  ctx.font = `${Math.max(8, 9)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = vowel.significant ? 'rgba(210,170,255,0.92)' : 'rgba(170,184,198,0.7)';
  ctx.fillText(`${vowel.label} sensation`, x, y - L.S(12));
  ctx.fillStyle = 'rgba(150,162,178,0.7)';
  ctx.fillText(vowel.significant ? 'not register' : 'not significant', x, y - L.S(2));
  rows.forEach((row, i) => {
    const ry = y + i * L.S(12);
    ctx.fillStyle = 'rgba(150,162,178,0.75)';
    ctx.fillText(row.label, x, ry + 7);
    ctx.fillStyle = 'rgba(20,28,36,0.7)';
    ctx.fillRect(x + L.S(36), ry, barW, L.S(7));
    ctx.fillStyle = row.color;
    ctx.globalAlpha = 0.35 + 0.65 * row.value;
    ctx.fillRect(x + L.S(36), ry, barW * row.value, L.S(7));
    ctx.globalAlpha = 1;
  });
}

function drawTension(ctx, L, tension) {
  drawTensionNode(ctx, L.jaw.x - L.S(20), L.jaw.y - L.S(4), tension.jaw, L.S(22));
  drawTensionNode(ctx, L.jaw.x + L.S(20), L.jaw.y - L.S(4), tension.jaw, L.S(22));
  drawTensionNode(ctx, L.larynx.x, L.hyoid.y, tension.throat, L.S(20));
  drawTensionNode(ctx, L.cx, L.shoulders.y + L.S(6), tension.torso, L.S(30));
}

function drawTensionNode(ctx, x, y, amount, radius) {
  if (!(amount > 0.04)) return;
  const r = 255;
  const g = Math.round(150 - 90 * amount);
  const b = Math.round(48 - 24 * amount);
  const grad = ctx.createRadialGradient(x, y, 2, x, y, radius);
  grad.addColorStop(0, `rgba(${r},${g},${b},${0.18 + 0.55 * amount})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.35 * amount})`;
  ctx.lineWidth = 1;
  const rings = 1 + Math.round(amount * 3);
  for (let i = 1; i <= rings; i++) {
    ctx.beginPath();
    ctx.arc(x, y, (radius * i) / (rings + 1), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBackgroundCurrents(ctx, L, plan) {
  const direction = plan.airflow?.direction ?? plan.simulatedBreath?.pose?.flowDirection ?? 0;
  const flowRate = plan.airflow?.flowRate || plan.simulatedBreath?.pose?.flowRate || 0;
  if (!(plan.airflow?.evidenceClass === 'simulated')) return;
  const particles = backgroundCurrentParticles(L, {
    timeMs: plan.timeMs,
    direction,
    flowRate: Math.max(flowRate, 0.16),
    phonated: plan.airflow?.phonated,
    count: 480,
    frequencyHertz: plan.airflow?.frequencyHertz || 0,
  });
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const glow = Math.min(0.85, p.alpha * (0.7 + (p.blink ?? 1) * 0.45));
    ctx.strokeStyle = rgbaVoice(AIRFLOW_RGB, glow);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = p.radius * 0.9;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.dx, p.y + p.dy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * (0.7 + (p.blink ?? 1) * 0.55), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawExteriorBreathJets(ctx, L, plan) {
  const pose = plan.simulatedBreath?.pose || {};
  const view = plan.view || {};
  const direction = plan.airflow?.direction ?? pose.flowDirection ?? 0;
  const flowRate = plan.airflow?.flowRate || pose.flowRate || 0;
  const particles = exteriorBreathJetParticles(L, {
    timeMs: plan.timeMs,
    direction,
    flowRate,
    nasalShare: plan.airflow?.nasalShare ?? pose.nasalShare ?? 0.2,
    yawRadians: view.yawRadians,
    mouthOpen: pose.mouthOpen ?? L.mouth?.open ?? 0.12,
    phonated: plan.airflow?.phonated,
    frequencyHertz: plan.airflow?.frequencyHertz || 0,
  });
  if (!particles.length) return;
  const mouth = projectedAnatomyPoint(L, view, L.mouth.x, L.mouth.y);
  const naris = projectedAnatomyPoint(L, view, L.nasal.x, L.nasal.y + L.nasal.ry * 0.55);
  const drive = clamp(Math.max(flowRate, 0.18));
  const travel = Math.max(L.W * 0.94, L.S(560));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (Math.abs(direction) > 0.12) {
    const inbound = direction < 0;
    const origin = mouth;
    const facing = jetFacingX(view.yawRadians);
    const farX = origin.x + facing * travel;
    const fromX = inbound ? farX : origin.x;
    const toX = inbound ? origin.x : farX;
    const mist = ctx.createLinearGradient(fromX, origin.y, toX, origin.y);
    mist.addColorStop(0, rgbaVoice(AIRFLOW_RGB, inbound ? 0.04 : 0.28 + drive * 0.22));
    mist.addColorStop(0.35, rgbaVoice(AIRFLOW_RGB, inbound ? 0.1 : 0.1));
    mist.addColorStop(1, rgbaVoice(AIRFLOW_RGB, inbound ? 0.22 + drive * 0.18 : 0));
    ctx.fillStyle = mist;
    const fan = 56 + drive * 110;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y - 8);
    ctx.lineTo(farX, origin.y - fan);
    ctx.lineTo(farX, origin.y + fan * 0.85);
    ctx.lineTo(origin.x, origin.y + 10);
    ctx.closePath();
    ctx.fill();
  }
  for (const p of particles) {
    const origin = p.path === 'nasalJet' ? naris : mouth;
    const facing = p.facing;
    const plume = breathPlumeScale(p.t);
    const spread = p.lane * (28 + p.t * 170);
    const lift = p.path === 'nasalJet' ? -18 - p.t * 56 : 8 + p.t * 38;
    const x = origin.x + facing * p.t * travel;
    const y = origin.y + lift + spread;
    const r = p.radius * plume;
    ctx.fillStyle = rgbaVoice(AIRFLOW_RGB, Math.min(0.95, p.alpha));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgbaVoice(AIRFLOW_RGB, Math.min(0.55, p.alpha * 0.45));
    ctx.beginPath();
    ctx.arc(x, y, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAirflow(ctx, L, plan) {
  if (plan.airflow.evidenceClass !== 'simulated') return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const phonated = plan.airflow.phonated;
  const ribbon = rgbaVoice(AIRFLOW_RGB, phonated ? 0.38 : 0.28);
  drawAirwayRibbon(ctx, L, 'oral', ribbon, 5.2);
  drawAirwayRibbon(ctx, L, 'nasal', ribbon, 4.2);
  for (const p of plan.airflow.particles) {
    const pt = airflowPathPoint(L, p.t, p.path);
    const next = airflowPathPoint(L, clamp(p.t + (p.inbound ? 0.06 : -0.06)), p.path);
    const glow = Math.min(0.95, p.alpha * (0.7 + (p.blink ?? 1) * 0.4));
    ctx.strokeStyle = rgbaVoice(AIRFLOW_RGB, glow);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = p.radius * 1.25;
    ctx.lineCap = 'round';
    if (p.streak > 0) {
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, p.radius * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgbaVoice(AIRFLOW_RGB, glow * 0.55);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, p.radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAirwayRibbon(ctx, L, path, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const pt = airflowPathPoint(L, i / 20, path);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
}

function drawFormants(ctx, L, resonance) {
  if (resonance.evidenceClass !== 'derived' || !resonance.formantsHertz?.length) return;
  const usable = resonance.formantsHertz.filter((f) => f > 0);
  const tract = oralCavityWaypoints(L.pose?.jawDrop ?? 0.12, L.pose?.mouthOpen ?? 0.12)
    .map(([x, y]) => sagittalToFigure(L, x, y));
  usable.forEach((hz, i) => {
    const pt = polylinePoint(tract, i / Math.max(1, usable.length - 1));
    ctx.fillStyle = 'rgba(232,196,88,0.9)';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`F${i + 1} ${Math.round(hz)}`, pt.x + L.S(8), pt.y + 3);
  });
}

function drawBreathVagusSystem(ctx, L, plan) {
  const anatomy = vagusAnatomyPaths(L.W, L.H, plan.simulatedBreath);
  const vagusColor = 'rgba(255,205,92,0.92)';
  const phrenicColor = 'rgba(87,226,224,0.94)';

  ctx.fillStyle = 'rgba(255,168,196,0.28)';
  ctx.strokeStyle = vagusColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(L.brain.x, L.brain.stemY, L.S(11), L.S(14), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  for (const branch of anatomy.branches) {
    const color = branch.system === 'phrenic' ? phrenicColor : vagusColor;
    const isTrunk = branch.id.endsWith('VagusTrunk');
    const isPlexus = branch.id.includes('Plexus') || branch.id.includes('cardiac');

    ctx.strokeStyle = branch.system === 'phrenic'
      ? 'rgba(87,226,224,0.14)'
      : 'rgba(255,205,92,0.13)';
    ctx.lineWidth = isTrunk ? L.S(7) : L.S(4);
    traceNerve(ctx, branch.points);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = isTrunk ? L.S(1.9) : L.S(1.15);
    traceNerve(ctx, branch.points);
    ctx.stroke();

    if (isPlexus) {
      const end = branch.points[branch.points.length - 1];
      ctx.fillStyle = color;
      for (let spoke = 0; spoke < 5; spoke++) {
        const angle = spoke * Math.PI * 0.4 + 0.2;
        const r = L.S(4 + spoke * 1.1);
        ctx.beginPath();
        ctx.arc(end.x + Math.cos(angle) * r, end.y + Math.sin(angle) * r, L.S(1.1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Slow orientation markers distinguish the nerve paths. They are simulated
  // and do not represent measured neural firing or vagal tone.
  const phase = ((plan.timeMs * 0.00008) % 1 + 1) % 1;
  for (const branch of anatomy.branches.filter((item) => item.id.endsWith('VagusTrunk'))) {
    for (let marker = 0; marker < 3; marker++) {
      const point = polylinePoint(branch.points, (phase + marker / 3) % 1);
      ctx.fillStyle = 'rgba(255,239,171,0.9)';
      ctx.beginPath();
      ctx.arc(point.x, point.y, L.S(2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The diaphragm termini belong to the phrenic, not the vagus, nerves.
  for (const branch of anatomy.branches.filter((item) => item.system === 'phrenic')) {
    const end = branch.points[branch.points.length - 1];
    ctx.strokeStyle = phrenicColor;
    ctx.lineWidth = L.S(1.1);
    for (let fan = -2; fan <= 2; fan++) {
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x + fan * L.S(7), end.y + L.S(7 + Math.abs(fan) * 2));
      ctx.stroke();
    }
  }
}

function traceNerve(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const mx = (previous.x + current.x) * 0.5;
    const my = (previous.y + current.y) * 0.5;
    ctx.quadraticCurveTo(previous.x, previous.y, mx, my);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawSupportOrganization(ctx, L, plan) {
  const support = plan.support || {};
  const known = support.evidenceClass && support.evidenceClass !== 'unknown' && support.value > 0.05;
  if (!known) return;
  const amount = support.value;
  const tense = Math.max(plan.tension?.throat || 0, plan.tension?.torso || 0);
  const organized = clamp(amount * (1 - tense * 0.55));
  const hips = { x: L.cx, y: L.abdomen.y1 - L.S(6) };
  const lowAbs = { x: L.cx, y: (L.diaphragm.y + L.abdomen.y1) * 0.5 };
  const chest = { x: L.cx, y: L.lungs.y + L.S(8) };
  const throat = { x: L.cx, y: L.larynx.y };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = organized > 0.2
    ? `rgba(120, 220, 170,${0.28 + 0.55 * organized})`
    : known
      ? `rgba(255, 170, 90,${0.22 + 0.4 * amount})`
      : 'rgba(160, 188, 176, 0.28)';
  ctx.lineWidth = known ? 3.4 + organized * 3 : 2.2;
  ctx.beginPath();
  ctx.moveTo(hips.x, hips.y);
  ctx.quadraticCurveTo(L.cx - L.S(10), lowAbs.y + L.S(8), lowAbs.x, lowAbs.y);
  ctx.quadraticCurveTo(L.cx + L.S(6), L.diaphragm.y + L.S(4), chest.x, chest.y);
  ctx.quadraticCurveTo(L.cx - L.S(4), L.shoulders.y, throat.x, throat.y);
  ctx.stroke();
  for (const pt of [hips, lowAbs, chest, throat]) {
    ctx.fillStyle = organized > 0.2 ? 'rgba(150,230,190,0.85)' : 'rgba(210, 222, 228, 0.7)';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, L.S(3.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSupportBand(ctx, L, support) {
  drawSupportOrganization(ctx, L, { support, tension: {} });
}

function drawOutlinedLabel(ctx, text, x, y, {
  align = 'left',
  fill = 'rgba(248, 252, 255, 1)',
  font = 'bold 13px "JetBrains Mono", monospace',
} = {}) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = 'rgba(5, 8, 12, 0.95)';
  ctx.lineWidth = 5.2;
  if (typeof ctx.strokeText === 'function') ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function spreadCalloutYs(items, minGap, minY, maxY) {
  const sorted = items
    .map((item, index) => ({ ...item, labelY: item.y, index }))
    .sort((a, b) => a.y - b.y || a.index - b.index);
  for (let i = 1; i < sorted.length; i++) {
    sorted[i].labelY = Math.max(sorted[i].labelY, sorted[i - 1].labelY + minGap);
  }
  if (sorted.length && sorted[sorted.length - 1].labelY > maxY) {
    sorted[sorted.length - 1].labelY = maxY;
    for (let i = sorted.length - 2; i >= 0; i--) {
      sorted[i].labelY = Math.min(sorted[i].labelY, sorted[i + 1].labelY - minGap);
    }
  }
  if (sorted.length && sorted[0].labelY < minY) {
    sorted[0].labelY = minY;
    for (let i = 1; i < sorted.length; i++) {
      sorted[i].labelY = Math.max(sorted[i].labelY, sorted[i - 1].labelY + minGap);
    }
  }
  return sorted;
}

function drawRegionCallouts(ctx, L, plan = {}) {
  const view = plan.view || {};
  const rightX = L.W - L.S(12);
  const leftX = L.S(12);
  const right = [
    { text: 'skull', x: L.skull.x + L.skull.rx * 0.7, y: L.skull.y - L.skull.ry * 0.2 },
    { text: 'throat', x: L.pharynx.x + L.S(18), y: (L.pharynx.y0 + L.larynx.y) * 0.5 },
    { text: 'larynx', x: L.larynx.x + L.S(16), y: L.larynx.y },
    { text: 'chest', x: L.cx + L.ribs.rx * 0.82, y: L.lungs.y },
    { text: 'diaphragm', x: L.cx + L.diaphragm.span * 0.5, y: L.diaphragm.y + L.S(4) },
  ];
  const left = [
    { text: 'lungs', x: L.cx - L.lungs.gap - L.lungs.rx * 0.2, y: L.lungs.y },
  ];
  if (plan.transparent) {
    left.push({ text: 'heart', x: L.heart.x, y: L.heart.y });
    left.push({ text: 'trachea', x: L.trachea.x - L.S(10), y: (L.trachea.y0 + L.bronchi.y) / 2 });
    right.push({ text: 'abdomen', x: L.cx + L.S(12), y: (L.diaphragm.y + L.abdomen.y1) / 2 });
  }
  if (plan.vagus?.active) {
    left.push({ text: 'brain', x: L.brain.x - L.S(8), y: L.brain.y });
    left.push({ text: 'spine', x: L.cx - L.S(16), y: (L.spine.y0 + L.larynx.y) * 0.5 });
    left.push({ text: 'heart', x: L.heart.x, y: L.heart.y });
  }
  const minGap = Math.max(22, L.S(20));
  const placedRight = spreadCalloutYs(right, minGap, L.S(28), L.H - L.S(36));
  const placedLeft = spreadCalloutYs(left, minGap, L.S(36), L.H - L.S(48));
  const drawSide = (items, labelX, align) => {
    for (const item of items) {
      const origin = projectedAnatomyPoint(L, view, item.x, item.y);
      const elbowX = labelX + (align === 'left' ? -10 : 10);
      ctx.strokeStyle = 'rgba(230, 240, 248, 0.55)';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(elbowX, item.labelY);
      ctx.stroke();
      ctx.fillStyle = 'rgba(248, 252, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      drawOutlinedLabel(ctx, item.text, labelX, item.labelY + 4, {
        align,
        fill: 'rgba(248, 252, 255, 1)',
        font: 'bold 13px "JetBrains Mono", monospace',
      });
    }
  };
  ctx.save();
  drawSide(placedRight, rightX, 'right');
  drawSide(placedLeft, leftX, 'left');
  ctx.restore();
}

function drawStructureLabels(ctx, L, plan) {
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(170,190,206,0.55)';
  ctx.textAlign = 'right';
  ctx.fillText('nasal cavity', L.nasal.x - L.S(16), L.nasal.y);
  ctx.fillText('oral cavity', L.oral.x - L.S(16), L.oral.y + L.S(4));
  if (plan.vagus?.active) {
    ctx.fillStyle = 'rgba(255,176,196,0.72)';
    ctx.fillText('brain', L.brain.x - L.S(22), L.brain.y);
  }
  ctx.fillText('pharynx', L.pharynx.x - L.S(16), (L.pharynx.y0 + L.pharynx.y1) / 2);
  ctx.fillText('larynx', L.larynx.x - L.S(20), L.larynx.y);
  ctx.fillText('trachea', L.trachea.x - L.S(16), (L.trachea.y0 + L.bronchi.y) / 2);
  ctx.textAlign = 'left';
  ctx.fillText('lungs', L.cx + L.lungs.gap + L.lungs.rx, L.lungs.y);
  ctx.fillText('diaphragm', L.cx + L.diaphragm.span * 0.2, L.diaphragm.y + L.S(6));
  ctx.fillText('abdomen', L.cx + L.S(8), (L.diaphragm.y + L.abdomen.y1) / 2);
  if (plan.circulatory?.active) {
    ctx.fillStyle = 'rgba(235,130,140,0.68)';
    ctx.fillText('heart', L.heart.x + L.heart.rx + L.S(5), L.heart.y);
    ctx.fillText('aorta', L.aorta.descendingX + L.S(6), L.aorta.archY);
    ctx.fillStyle = 'rgba(116,168,230,0.68)';
    ctx.textAlign = 'right';
    ctx.fillText('vena cava', L.venaCava.x - L.S(5), L.heart.y + L.S(7));
  }
}

function drawCaptions(ctx, L, W, plan) {
  if (plan.actualPitch.frequencyHertz != null) {
    drawOutlinedLabel(
      ctx,
      `${plan.actualPitch.frequencyHertz.toFixed(1)} Hz`,
      L.cx,
      Math.max(L.S(22), L.skull.y - L.skull.ry - L.S(28)),
      {
        align: 'center',
        fill: plan.actualPitch.color || 'rgba(248, 252, 255, 1)',
        font: 'bold 14px "JetBrains Mono", monospace',
      },
    );
  }
  const facts = [];
  const p = plan.simulatedBreath.pose;
  if (plan.airflow.evidenceClass === 'simulated' && (plan.airflow.direction != null || p.flowRate > 0.04)) {
    const dir = p.flowDirection < -0.2 ? 'inhale' : p.flowDirection > 0.2 ? 'exhale' : 'pause';
    facts.push(`airflow ${dir} · simulated`);
  }
  if (plan.circulatory?.active) {
    facts.push(`heartbeat ~${plan.circulatory.simulatedRateBeatsPerMinute} bpm · simulated`);
  }
  if (plan.breathResonance?.active && plan.breathResonance.energy > 0.05) {
    facts.push(plan.breathResonance.label || 'tract resonance · derived formants');
  }
  if (plan.tension.jaw + plan.tension.throat + plan.tension.torso > 0.05) {
    facts.push(plan.tension.accessibilityCue);
  }
  if (plan.support?.evidenceClass && plan.support.evidenceClass !== 'unknown' && plan.support.value > 0.05) {
    facts.push('support evidence · personal, not diaphragm truth');
  }
  if (plan.vagus?.active) {
    facts.push(`breath + vagus + spine + head/brain + heart · ${plan.vagus.respiratoryPhase} · simulated`);
  }
  if (!facts.length) return;
  ctx.save();
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(198, 214, 226, 0.82)';
  let y = L.H - L.S(26);
  for (const text of facts.slice(0, 3).reverse()) {
    ctx.fillText(text, W - L.S(14), y);
    y -= 12;
  }
  ctx.restore();
}

function drawLanes(ctx, W, H, lanes) {
  if (!lanes) return;
  const y = H - 36;
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(107,122,136,0.95)';
  ctx.fillText(`singer breath: ${lanes.user ?? 'unknown'}`, 16, y);
  ctx.fillText(`reference breath: ${lanes.reference ?? 'unknown'}`, 16, y + 14);
}

function drawEvidenceFooter(ctx, W, H, plan) {
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(107,122,136,0.85)';
  const circulation = plan.circulatory?.active ? ' · circulation simulated' : '';
  const vagus = plan.vagus?.active ? ' · breath + vagus + spine + head/brain + heart simulated' : '';
  ctx.fillText(`registration inferred · breath anatomy simulated${circulation}${vagus} · tension = evidence not diagnosis`, W - 14, H - 12);
}

function drawChestCloseupStructureLabels(ctx, L) {
  ctx.save();
  ctx.font = `${Math.max(9, L.S(7.5))}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(150,210,220,0.92)';
  ctx.fillText('right lung', L.lungs.right.x - L.lungs.right.rx * 0.2, L.lungs.right.apexY - L.S(6));
  ctx.fillStyle = 'rgba(150,210,220,0.92)';
  ctx.textAlign = 'right';
  ctx.fillText('left lung', L.lungs.left.x + L.lungs.left.rx * 0.15, L.lungs.left.apexY - L.S(6));
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(220,228,236,0.88)';
  ctx.fillText('sternum', L.cx, L.sternum.y0 - L.S(8));
  ctx.fillStyle = 'rgba(255,150,96,0.92)';
  ctx.fillText('diaphragm', L.cx, L.diaphragm.y + L.S(28));
  ctx.fillStyle = 'rgba(245,120,130,0.92)';
  ctx.textAlign = 'left';
  ctx.fillText('heart', L.heart.x + L.heart.rx + L.S(6), L.heart.y);
  ctx.fillStyle = 'rgba(176,198,214,0.82)';
  ctx.textAlign = 'right';
  ctx.fillText('ribs', L.cx - L.ribs.rx - L.S(4), L.ribs.y0 + L.S(18));
  ctx.fillStyle = 'rgba(224,148,132,0.86)';
  ctx.textAlign = 'center';
  ctx.fillText('abdomen', L.cx, (L.diaphragm.y + L.abdomen.y1) * 0.5 + L.S(18));
  ctx.restore();
}

function drawChestCloseupHud(ctx, W, H, plan, pose) {
  const cls = plan.simulatedBreath?.class
    || (pose.flowDirection < -0.2 ? 'inhale' : pose.flowDirection > 0.2 ? 'phonated_exhale' : 'pause');
  const dir = pose.flowDirection < -0.2 ? 'in' : pose.flowDirection > 0.2 ? 'out' : 'none';
  ctx.save();
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,176,122,0.95)';
  ctx.fillText(`${String(cls).replaceAll('_', ' ')} · heard acoustic class`, 16, 22);
  ctx.fillStyle = 'rgba(174,194,207,0.78)';
  ctx.fillText(`lung fill ${Math.round(clamp(pose.lungVolume) * 100)}% · diaphragm ${Math.round(clamp(pose.diaphragmDescent) * 100)}% · simulated`, 16, 40);
  ctx.fillText(`airflow ${dir} · mirrors what the mic/song hears · not spirometry`, 16, 56);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(107,122,136,0.85)';
  ctx.fillText('scroll to zoom · click the chest on the main figure', W - 16, H - 16);
  ctx.restore();
}
