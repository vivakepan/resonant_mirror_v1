/**
 * Deterministic anatomy drawing from provenance-tagged visual states.
 * The renderer MUST NOT invent physiological state from raw audio.
 */

import { ANATOMY_STRUCTURES } from './structures.js';
import { frequencyToColor } from '../audio/piano.js';

function stateMap(visualStates) {
  const map = new Map();
  for (const s of visualStates) map.set(s.visualName, s);
  return map;
}

function assertiveness(state) {
  if (!state || state.evidenceClass === 'unknown' || state.value == null) return 0;
  return state.assertiveness ?? state.confidence ?? 1;
}

export function anatomyDrawPlan(visualStates, { transparent = false, showPitch = true } = {}) {
  const states = stateMap(visualStates);
  const diaphragm = states.get('diaphragmMotion');
  const ribs = states.get('ribMotion');
  const skullRim = states.get('skullRimUpperProduction');
  const chest = states.get('chestRegionGlow');
  const mixed = states.get('mixedCoordinationField');
  const jaw = states.get('jawTensionGlow');
  const throat = states.get('throatTensionGlow');
  const pitch = states.get('actualPitchLayer');
  const airflow = states.get('airflowParticles');

  const structures = ANATOMY_STRUCTURES.map((s) => ({
    id: s.id,
    label: s.label,
    fillAlpha: transparent ? 0.18 : 0.55,
  }));

  return {
    transparent,
    structures,
    simulatedBreath: {
      diaphragmOffset: diaphragm?.evidenceClass === 'simulated' ? Number(diaphragm.value) || 0 : 0,
      ribExpansion: ribs?.evidenceClass === 'simulated' ? Number(ribs.value) || 0 : 0,
      evidenceClass: 'simulated',
      active: assertiveness(diaphragm) > 0 || assertiveness(ribs) > 0,
      label: 'simulated anatomy driven by inferred respiratory state',
    },
    inferredRegistration: {
      skullRim: assertiveness(skullRim),
      chestGlow: assertiveness(chest),
      mixedField: assertiveness(mixed),
      evidenceClass: 'inferred',
      label: 'inferred registration/resonance-pattern mapping, not cavity proof',
    },
    tension: {
      jaw: assertiveness(jaw),
      throat: assertiveness(throat),
      evidenceClass: 'inferred',
      label: 'tension evidence',
    },
    airflow: {
      direction: airflow?.evidenceClass === 'simulated' ? airflow.value : null,
      evidenceClass: 'simulated',
      label: 'simulated airflow direction, not measured velocity',
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

export function drawAnatomyV2(ctx, W, H, plan) {
  const cx = W * 0.5;
  ctx.save();
  ctx.strokeStyle = 'rgba(212,223,232,0.45)';
  ctx.lineWidth = 1.2;

  // Torso
  ctx.fillStyle = `rgba(30,42,54,${plan.transparent ? 0.25 : 0.55})`;
  ctx.beginPath();
  ctx.ellipse(cx, H * 0.62, W * 0.16, H * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Rib cage
  ctx.strokeStyle = 'rgba(110,140,160,0.55)';
  for (let i = 0; i < 6; i++) {
    const y = H * (0.50 + i * 0.03);
    const spread = W * (0.10 + i * 0.008) * (1 + 0.08 * plan.simulatedBreath.ribExpansion);
    ctx.beginPath();
    ctx.ellipse(cx, y, spread, H * 0.012, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Sternum + xiphoid
  ctx.strokeStyle = 'rgba(200,210,220,0.6)';
  ctx.beginPath();
  ctx.moveTo(cx, H * 0.48);
  ctx.lineTo(cx, H * 0.68);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, H * 0.68);
  ctx.lineTo(cx + 6, H * 0.705);
  ctx.lineTo(cx - 6, H * 0.705);
  ctx.closePath();
  ctx.stroke();

  // Diaphragm (simulated dome)
  const dOff = plan.simulatedBreath.diaphragmOffset * H * 0.03;
  ctx.strokeStyle = 'rgba(255,160,90,0.55)';
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.13, H * 0.72 + dOff);
  ctx.quadraticCurveTo(cx, H * 0.66 + dOff, cx + W * 0.13, H * 0.72 + dOff);
  ctx.stroke();

  // Lungs
  ctx.fillStyle = `rgba(90,160,190,${plan.transparent ? 0.12 : 0.2})`;
  ctx.beginPath();
  ctx.ellipse(cx - W * 0.06, H * 0.60, W * 0.05, H * 0.09, -0.15, 0, Math.PI * 2);
  ctx.ellipse(cx + W * 0.06, H * 0.60, W * 0.05, H * 0.09, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillStyle = `rgba(40,50,60,${plan.transparent ? 0.3 : 0.6})`;
  ctx.fillRect(cx - 16, H * 0.36, 32, H * 0.12);

  // Head / skull
  ctx.fillStyle = `rgba(36,46,58,${plan.transparent ? 0.28 : 0.62})`;
  ctx.beginPath();
  ctx.ellipse(cx, H * 0.24, W * 0.09, H * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(212,223,232,0.45)';
  ctx.stroke();

  // Jaw
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.05, H * 0.28);
  ctx.quadraticCurveTo(cx, H * 0.36, cx + W * 0.05, H * 0.28);
  ctx.stroke();

  // Skull-rim (inferred upper/head-dominant mapping)
  if (plan.inferredRegistration.skullRim > 0) {
    const a = 0.15 + 0.55 * plan.inferredRegistration.skullRim;
    ctx.strokeStyle = `rgba(106,215,255,${a})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, H * 0.22, W * 0.11, H * 0.13, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }

  // Chest-region glow (inferred, not cavity proof)
  if (plan.inferredRegistration.chestGlow > 0) {
    const a = 0.08 + 0.28 * plan.inferredRegistration.chestGlow;
    const g = ctx.createRadialGradient(cx, H * 0.64, 10, cx, H * 0.64, W * 0.14);
    g.addColorStop(0, `rgba(255,122,60,${a})`);
    g.addColorStop(1, 'rgba(255,122,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, H * 0.64, W * 0.14, H * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tension orange-red (evidence, not diagnosis)
  drawTensionGlow(ctx, cx - W * 0.03, H * 0.31, plan.tension.jaw, 28);
  drawTensionGlow(ctx, cx, H * 0.40, plan.tension.throat, 22);

  if (plan.actualPitch.frequencyHertz != null) {
    ctx.fillStyle = plan.actualPitch.color;
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${plan.actualPitch.frequencyHertz.toFixed(1)} Hz`, cx, H * 0.08);
  }

  ctx.restore();
}

function drawTensionGlow(ctx, x, y, amount, radius) {
  if (!(amount > 0)) return;
  const r = Math.round(255);
  const g = Math.round(140 - 80 * amount);
  const b = Math.round(40 - 20 * amount);
  const grad = ctx.createRadialGradient(x, y, 2, x, y, radius);
  grad.addColorStop(0, `rgba(${r},${g},${b},${0.15 + 0.55 * amount})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
