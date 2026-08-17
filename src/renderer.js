/**
 * renderer.js — Visual rendering of resonance state
 *
 * Draws zone glows, wave rings, the whole-system aura,
 * anti-resonance node visuals, and updates the system badge.
 * Receives computed amplitudes from physics; does no physics itself.
 */

import { hexA } from './physics.js';
import { drawHeartShape } from './anatomy.js';


// ─── Zone drawing ──────────────────────────────────────────────
// Each zone: radial glow, expanding wave rings when active,
// core dot (or heart shape), and a label with frequency + amplitude.

export function drawZone(ctx, W, H, z, amp, driveF, time) {
  const x = W * z.nx, y = H * z.ny;
  const beat = (Math.sin(time * 2 * Math.PI * Math.min(driveF, 12) * 0.001 + z.freq) * 0.5 + 0.5);
  const pulseR = z.r * (0.55 + 0.35 * amp + 0.08 * beat * amp);

  // Outer glow
  const g = ctx.createRadialGradient(x, y, 0, x, y, z.r * 1.8);
  g.addColorStop(0,   hexA(z.color, 0.55 * amp));
  g.addColorStop(0.4, hexA(z.color, 0.18 * amp));
  g.addColorStop(1,   hexA(z.color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, z.r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Wave rings
  if (amp > 0.1) {
    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
      const phase = ((time * 0.0006 * (1 + amp * 2)) + i / ringCount) % 1;
      const ringR = pulseR + phase * z.r * 2.5;
      ctx.strokeStyle = hexA(z.color, (1 - phase) * amp * 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Core
  if (z.id === 'heart') {
    drawHeartShape(ctx, x, y, pulseR * 0.55, z.color, amp, time);
  } else {
    ctx.fillStyle = hexA(z.color, 0.25 + amp * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, pulseR * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label (only when significantly active)
  if (amp > 0.15) {
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.fillStyle = hexA(z.color, 0.7 + amp * 0.3);
    ctx.textAlign = 'left';
    const off = z.r * 0.9 + 6;
    ctx.fillText(z.name.toUpperCase(), x + off, y - 2);
    ctx.fillStyle = hexA(z.color, 0.45);
    ctx.fillText(`${z.freq}Hz · ${(amp * 100 | 0)}%`, x + off, y + 10);
    ctx.strokeStyle = hexA(z.color, 0.3);
    ctx.beginPath();
    ctx.moveTo(x + z.r * 0.55, y);
    ctx.lineTo(x + off - 4, y);
    ctx.stroke();
  }
}


// ─── Large-cavity region rendering (§12.6) ────────────────────
// Skull and chest span physical areas, not single points. When active they
// get a region-fill glow matching the anatomy outlines, drawn behind vagus
// and zone dots so those still read on top.

export function drawRegions(ctx, W, H, zones, amps) {
  zones.forEach((z, i) => {
    const amp = amps[i];
    if (amp < 0.08) return;
    if (z.id === 'skull') {
      // Cranial ellipse glow — matches anatomy.js skull stroke exactly.
      const cx = W * 0.50, cy = H * 0.205;
      const rx = W * 0.085, ry = H * 0.115;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.9, ry * 1.9, 0, 0, Math.PI * 2);
      const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry) * 1.9);
      eg.addColorStop(0,   hexA(z.color, 0.22 * amp));
      eg.addColorStop(0.55, hexA(z.color, 0.10 * amp));
      eg.addColorStop(1,   hexA(z.color, 0));
      ctx.fillStyle = eg;
      ctx.fill();
      ctx.restore();
    } else if (z.id === 'chest') {
      // Ribcage bezier region fill — matches anatomy.js chest cavity path.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(W * 0.36, H * 0.50);
      ctx.quadraticCurveTo(W * 0.32, H * 0.78, W * 0.40, H * 0.92);
      ctx.lineTo(W * 0.60, H * 0.92);
      ctx.quadraticCurveTo(W * 0.68, H * 0.78, W * 0.64, H * 0.50);
      ctx.closePath();
      const eg = ctx.createRadialGradient(W * 0.50, H * 0.71, 0, W * 0.50, H * 0.71, H * 0.22);
      eg.addColorStop(0,   hexA(z.color, 0.18 * amp));
      eg.addColorStop(0.6, hexA(z.color, 0.07 * amp));
      eg.addColorStop(1,   hexA(z.color, 0));
      ctx.fillStyle = eg;
      ctx.fill();
      ctx.restore();
    }
  });
}


// ─── Whole-system aura ─────────────────────────────────────────
// Golden glow that fills the canvas when system amplitude exceeds
// the coupling threshold.

export function drawSystemAura(ctx, W, H, systemAmp) {
  if (systemAmp < 0.35) return;
  const cx = W * 0.5, cy = H * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
  const a = (systemAmp - 0.35) * 0.5;
  g.addColorStop(0,   `rgba(255,224,122,${a * 0.10})`);
  g.addColorStop(0.5, `rgba(255,224,122,${a * 0.04})`);
  g.addColorStop(1,   'rgba(255,224,122,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}


// ─── Anti-resonance node visual ────────────────────────────────
// Violet line connecting two paired zones with opposite-phase
// wavelets meeting at the midpoint (the cancellation node).

export function drawAntiResonance(ctx, W, H, ar, strength, time) {
  const a = ar.a, b = ar.b;
  const ax = W * a.nx, ay = H * a.ny;
  const bx = W * b.nx, by = H * b.ny;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 5) return;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;

  ctx.save();
  const phase = time * 0.003;

  // Opposite-phase wavelets
  ctx.strokeStyle = `rgba(180,140,255,${0.5 * strength})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let s = 0; s <= 1; s += 0.012) {
    const env = Math.sin(s * Math.PI);
    const sign = s < 0.5 ? 1 : -1;
    const localS = s < 0.5 ? s : (1 - s);
    const wave = Math.sin(localS * 26 - phase) * env * 8 * sign;
    const px = ax + ux * s * len + nx * wave;
    const py = ay + uy * s * len + ny * wave;
    if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Cancellation node
  ctx.fillStyle = `rgba(180,140,255,${0.85 * strength})`;
  ctx.shadowColor = '#b48cff';
  ctx.shadowBlur = 14 * strength;
  ctx.beginPath();
  ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Pulsing ring
  ctx.strokeStyle = `rgba(180,140,255,${0.45 * strength})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(mx, my, 9 + 4 * Math.sin(phase * 1.5), 0, Math.PI * 2);
  ctx.stroke();

  // Label
  ctx.font = "9px 'JetBrains Mono', monospace";
  ctx.textAlign = 'left';
  const lx = mx + 24, ly = my - 4;
  ctx.fillStyle = `rgba(200,170,255,${0.95 * strength})`;
  ctx.fillText('◊ SPECTRAL NULL', lx, ly);
  ctx.fillStyle = `rgba(180,140,255,${0.65 * strength})`;
  ctx.fillText(`${a.name.toUpperCase()} ⇌ ${b.name.toUpperCase()}`, lx, ly + 11);
  ctx.fillText(`${ar.f.toFixed(0)} Hz · phase π`, lx, ly + 22);
  ctx.strokeStyle = `rgba(180,140,255,${0.4 * strength})`;
  ctx.beginPath();
  ctx.moveTo(mx + 5, my);
  ctx.lineTo(lx - 4, my);
  ctx.stroke();
  ctx.restore();
}


// ─── Badge + system state update ───────────────────────────────

export function updateBadge(sysAmp, activeCount, arActive, spatialNode = false) {
  const badge = document.getElementById('badge');
  const sysStateEl = document.getElementById('sysState');
  if (badge) {
    delete badge.dataset.evidenceClass;
  }

  if (arActive && arActive.strength > 0.45) {
    const aName = arActive.ar.a.name.split(' ')[0].toUpperCase();
    const bName = arActive.ar.b.name.split(' ')[0].toUpperCase();
    badge.textContent = `◊ SPECTRAL NULL · ${aName} ⇌ ${bName}`;
    badge.className = 'resonance-badge anti';
    sysStateEl.textContent = 'PHASE CANCELLATION';
    sysStateEl.style.color = '#b48cff';
  } else if (sysAmp > 0.55 && activeCount >= 5) {
    // Legacy hypothesis only (AIN-RS-003 / v2 REQ-026, REQ-092).
    // Arithmetic threshold, not a validated physiological measurement.
    // Isolated from Resonant Mirror v2 inference and must not feed coaching.
    badge.textContent = 'WHOLE-SYSTEM RESONANCE';
    badge.className = 'resonance-badge full';
    badge.dataset.evidenceClass = 'legacy_hypothesis';
    badge.title = 'Legacy prototype rule: mean zone amplitude > 0.55 with 5+ active zones. Not a validated bodily resonance measurement.';
    sysStateEl.textContent = 'FULL HARMONIC LOCK';
    sysStateEl.style.color = '#ffe07a';
  } else if (spatialNode) {
    badge.textContent = '◊ SPATIAL NODE';
    badge.className = 'resonance-badge spatial';
    sysStateEl.textContent = 'FIELD CANCELLATION';
    sysStateEl.style.color = '#8cc8ff';
  } else if (sysAmp > 0.35 || activeCount >= 3) {
    badge.textContent = 'HARMONIC COUPLING';
    badge.className = 'resonance-badge high';
    sysStateEl.textContent = 'COUPLED MODES';
    sysStateEl.style.color = '#4fd6c4';
  } else if (sysAmp > 0.15) {
    badge.textContent = 'SUBTLE TUNING';
    badge.className = 'resonance-badge';
    sysStateEl.textContent = 'PARTIAL COUPLING';
    sysStateEl.style.color = '#b48cff';
  } else {
    badge.textContent = 'OFF-RESONANCE';
    badge.className = 'resonance-badge';
    sysStateEl.textContent = 'SCANNING';
    sysStateEl.style.color = '#6b7a88';
  }
}
