/**
 * anatomy.js — Anatomical drawing primitives
 *
 * Draws the body silhouette, vagus nerve pathway with traveling
 * particles, vocal fold oscillation, and heart-shaped core.
 * All drawing is relative to canvas dimensions W, H passed in.
 */

import { hexA } from './physics.js';


// ─── Vagus nerve waypoints ─────────────────────────────────────
// Hand-tuned path from brainstem down through neck into chest.
// Normalized coordinates in [0,1].

export const nervePts = [
  { nx: 0.49, ny: 0.18 },
  { nx: 0.50, ny: 0.24 },
  { nx: 0.48, ny: 0.32 },
  { nx: 0.51, ny: 0.40 },
  { nx: 0.47, ny: 0.48 },
  { nx: 0.52, ny: 0.56 },
  { nx: 0.49, ny: 0.64 },
  { nx: 0.54, ny: 0.72 },
  { nx: 0.50, ny: 0.80 },
  { nx: 0.46, ny: 0.86 },
];


// ─── Vagus nerve particles ─────────────────────────────────────

export function createParticles(count = 18) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({ s: i / count, v: 0.05 });
  }
  return particles;
}


// ─── Body silhouette ───────────────────────────────────────────

export function drawSilhouette(ctx, W, H, breathEnv = 1) {
  ctx.save();
  ctx.strokeStyle = 'rgba(120,150,180,0.18)';
  ctx.lineWidth = 1;

  // §5b: subtle chest sway tied to breath. Exhale-mid pushes the chest
  // wall outward by ~1.5%; inhale-top pulls it slightly inward. Not
  // anatomically accurate (chest moves outward on *inhale* in reality)
  // — this is phenomenological: "voice expands the chest on the held note."
  const swayX = 0.015 * (breathEnv - 0.5) * 2;  // [-0.015, +0.015]
  const swayY = 0.008 * (breathEnv - 0.5) * 2;

  // Skull outline
  ctx.beginPath();
  ctx.ellipse(W * 0.50, H * 0.20, W * 0.085, H * 0.115, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Jaw / face
  ctx.beginPath();
  ctx.moveTo(W * 0.585, H * 0.225);
  ctx.quadraticCurveTo(W * 0.61, H * 0.31, W * 0.575, H * 0.38);
  ctx.quadraticCurveTo(W * 0.55, H * 0.41, W * 0.51, H * 0.41);
  ctx.stroke();

  // Neck
  ctx.beginPath();
  ctx.moveTo(W * 0.465, H * 0.30);
  ctx.lineTo(W * 0.455, H * 0.46);
  ctx.moveTo(W * 0.540, H * 0.31);
  ctx.lineTo(W * 0.555, H * 0.46);
  ctx.stroke();

  // Chest cavity — outer wall sways with breath
  ctx.beginPath();
  ctx.moveTo(W * (0.36 - swayX), H * 0.50);
  ctx.quadraticCurveTo(W * (0.32 - swayX), H * (0.78 + swayY), W * 0.40, H * 0.92);
  ctx.lineTo(W * 0.60, H * 0.92);
  ctx.quadraticCurveTo(W * (0.68 + swayX), H * (0.78 + swayY), W * (0.64 + swayX), H * 0.50);
  ctx.stroke();

  // Ribs hint — track the sway proportionally
  ctx.strokeStyle = 'rgba(120,150,180,0.09)';
  for (let i = 0; i < 6; i++) {
    const y = H * 0.56 + i * H * 0.045;
    ctx.beginPath();
    ctx.moveTo(W * (0.37 - swayX * 0.6), y);
    ctx.quadraticCurveTo(W * 0.50, y + H * 0.012, W * (0.63 + swayX * 0.6), y);
    ctx.stroke();
  }

  // Cross-hair tick marks
  ctx.strokeStyle = 'rgba(120,150,180,0.12)';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const x = W * 0.06 + i * W * 0.005;
    ctx.moveTo(x, H * 0.5);
    ctx.lineTo(x, H * 0.5 + 4);
  }
  ctx.stroke();
  ctx.restore();
}


// ─── Heartbeat rhythm ──────────────────────────────────────────
// Independent ~1 Hz lub-dub (S1 + S2), decoupled from the drive.

export function heartbeat(time) {
  const phase = ((time * 0.001) % 0.95) / 0.95;
  const lub = Math.exp(-Math.pow((phase - 0.05) / 0.035, 2));
  const dub = Math.exp(-Math.pow((phase - 0.34) / 0.045, 2)) * 0.7;
  return Math.min(1, lub + dub);
}


// ─── Heart-shaped core ─────────────────────────────────────────

export function drawHeartShape(ctx, x, y, size, color, amp, time) {
  const beat = heartbeat(time);
  const s = size * (0.85 + 0.18 * beat + 0.12 * amp);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 12, s / 12);
  ctx.fillStyle = hexA(color, 0.28 + amp * 0.55 + 0.18 * beat);
  ctx.shadowColor = color;
  ctx.shadowBlur = 8 + beat * 10 + amp * 14;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.bezierCurveTo(-11, -4, -11, -12, -5.5, -12);
  ctx.bezierCurveTo(-2, -12, 0, -9, 0, -6);
  ctx.bezierCurveTo(0, -9, 2, -12, 5.5, -12);
  ctx.bezierCurveTo(11, -12, 11, -4, 0, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
}


// ─── Vocal folds ───────────────────────────────────────────────
// Two opposing flaps that open/close at a slowed-down visual rate,
// plus an air-puff waveform above the glottis.

export function drawVocalFolds(ctx, W, H, driveF, time) {
  const cx = W * 0.50, cy = H * 0.52;
  const visualHz = Math.min(driveF, 14);
  const open = (Math.sin(time * 0.001 * visualHz * Math.PI * 2) * 0.5 + 0.5);
  const gap = 2 + open * 8;

  ctx.save();
  ctx.translate(cx, cy);
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#ffc14a';
    ctx.shadowColor = '#ffc14a';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(-16, s * gap);
    ctx.quadraticCurveTo(0, s * (gap + 5 * s), 16, s * gap);
    ctx.quadraticCurveTo(0, s * (gap + 1), -16, s * gap);
    ctx.fill();
  }
  ctx.restore();

  // Air-puff waveform
  ctx.save();
  ctx.translate(cx, cy - 2);
  ctx.strokeStyle = 'rgba(255,193,74,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -40; i <= 40; i++) {
    const px = i * 1.2;
    const wave = Math.sin((i * 0.4) - time * 0.002 * driveF) * (3 + open * 3);
    if (i === -40) ctx.moveTo(px, wave - 26); else ctx.lineTo(px, wave - 26);
  }
  ctx.stroke();
  ctx.restore();
}


// ─── Breath phase trace (§5b) ─────────────────────────────────
// Lower-left corner micro-indicator. Sine mode shows a full cycle as a dim
// path with a moving dot at the current phase; tap/mic modes show a level bar.
// Tap mode adds a SPACE hint so the user knows the keyboard gesture.

export function drawBreathTrace(ctx, W, H, breathEnv, mode, enabled, vt = 0, periodMs = 5000) {
  if (!enabled) return;
  ctx.save();
  const bx = W * 0.04;
  const by = H * 0.905;
  const bw = W * 0.088;
  const bh = H * 0.016;

  if (mode === 'sine') {
    ctx.strokeStyle = 'rgba(120,160,180,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const px = bx + (i / 64) * bw;
      const py = by - Math.sin((i / 64) * Math.PI * 2) * bh;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const phaseRatio = (vt % periodMs) / periodMs;
    const dotX = bx + phaseRatio * bw;
    const dotY = by - Math.sin(phaseRatio * Math.PI * 2) * bh;
    ctx.fillStyle = 'rgba(140,200,255,0.75)';
    ctx.shadowColor = '#8cc8ff';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    ctx.strokeStyle = 'rgba(120,160,180,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by - bh, bw, bh * 2);
    ctx.fillStyle = 'rgba(140,200,255,0.28)';
    ctx.fillRect(bx, by - bh, bw * breathEnv, bh * 2);
  }

  ctx.font = "7px 'JetBrains Mono', monospace";
  ctx.fillStyle = 'rgba(100,140,170,0.42)';
  ctx.fillText('BREATH', bx, by + bh + 8);
  if (mode === 'tap') {
    ctx.fillStyle = 'rgba(140,200,255,0.55)';
    ctx.fillText('SPACE · hold=inhale', bx, by + bh + 17);
  }
  ctx.restore();
}


// ─── Vagus nerve + traveling particles ─────────────────────────

export function drawVagus(ctx, W, H, time, systemAmp, particles, timeScale) {
  // Nerve path
  ctx.save();
  ctx.strokeStyle = `rgba(139,229,143,${0.18 + systemAmp * 0.35})`;
  ctx.lineWidth = 1.2;
  ctx.shadowColor = '#8be58f';
  ctx.shadowBlur = 6 + systemAmp * 14;
  ctx.beginPath();
  for (let i = 0; i < nervePts.length; i++) {
    const p = nervePts[i];
    const wob = Math.sin(time * 0.001 + i) * 4 * (0.3 + systemAmp);
    const x = W * p.nx + wob;
    const y = H * p.ny;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Particles
  particles.forEach(p => {
    p.s += p.v * (0.002 + systemAmp * 0.012) * timeScale;
    if (p.s > 1) p.s -= 1;
    const idx = p.s * (nervePts.length - 1);
    const i0 = Math.floor(idx), i1 = Math.min(i0 + 1, nervePts.length - 1);
    const f = idx - i0;
    const a = nervePts[i0], b = nervePts[i1];
    const wob = Math.sin(time * 0.001 + p.s * 6) * 4 * (0.3 + systemAmp);
    const x = (W * a.nx + (W * b.nx - W * a.nx) * f) + wob;
    const y = (H * a.ny + (H * b.ny - H * a.ny) * f);
    ctx.fillStyle = `rgba(180,255,200,${0.4 + systemAmp * 0.5})`;
    ctx.shadowColor = '#aaffbb';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, 2 + systemAmp * 2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
}
