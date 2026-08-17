/**
 * main.js — Application entry point and animation loop
 *
 * Sets up the canvas, initializes shared state, wires UI controls,
 * and runs the requestAnimationFrame loop that orchestrates
 * physics computation → rendering → UI updates each frame.
 */

import { zones, zoneResponse, applyCoupling, activeAntiResonance, primaryF } from './physics.js';
import { createParticles, drawSilhouette, drawVocalFolds, drawVagus, drawBreathTrace } from './anatomy.js';
import { drawZone, drawSystemAura, drawAntiResonance, drawRegions, updateBadge } from './renderer.js';
import { createZoneBars, updateZoneBars, wireControls } from './ui.js';
import { computeField, drawField, sampleField } from './field.js';
import { AudioEngine } from './audio.js';
import { BreathEngine } from './breath.js';
import { applyViewScale } from './views.js';
import { envDriver, applyEnvFloor } from './env.js';
import { createSessionRecorder } from './sessions.js';
import { loadArticulation, articulationHint } from './articulation.js';
import { NoticeEngine } from './notices.js';


// ─── Canvas setup ──────────────────────────────────────────────

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d', { alpha: false });

let W = 0, H = 0;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

function resize() {
  const r = canvas.getBoundingClientRect();
  W = r.width;
  H = r.height;
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);


// ─── Shared state ──────────────────────────────────────────────
// Mutated by UI handlers and the animation loop.
// Physics reads drivers[]; rendering reads vt (visual time).
//
// Driver shape (AIN-RS-005): { f: Hz, amp: 0..1, phase: rad, origin: string }.
// The first driver with origin='internal' is the singer's slider — the
// "primary" driver that visual elements like vocal folds key off of.
// Additional drivers (external song peaks, pinned chord stacks) get
// appended to state.drivers and contribute to zoneResponse linearly.

const state = {
  drivers:   [{ f: 220, amp: 1, phase: 0, origin: 'internal' }],
  t:         0,       // wall-clock time (ms)
  vt:        0,       // visual time (scaled by timeScale)
  lastT:     0,
  timeScale: 1,       // visualization speed multiplier (NOT physics)
  sweeping:  false,
  sweepDir:  1,
  // AIN-RS-006: per-zone dynamic amplitudes. First-order low-pass
  // envelope on the steady-state target. Buildup/decay timescale
  // is Q-dependent: narrow-band zones (small Q field, e.g., larynx)
  // ring longer; broad-band zones (large Q field, e.g., ears) settle
  // quickly. Coupling is applied on the dynamic state at render time.
  zoneAmpsDyn: zones.map(() => 0),
  // §5a: external/song state. externalDrivers is rebuilt each frame
  // from the audio engine's peak extraction. externalBalance scales
  // the external contribution into both the field and zone responses.
  externalDrivers: [],
  externalBalance: 0.7,
  fieldEnabled: true,
  viewMode: 'organs',
  envType: 'none',
  multiMode: false,
  pinnedDrivers: [],
  breathEnabled: true,
  sessionRecorder: null,
  articulationDoc: null,
};

// Per-zone envelope time constants (seconds). Capped to a sensible
// visible range — too long and the visualization lags the slider,
// too short and beats / buildup aren't perceptible.
const ZONE_TAU = zones.map(z => Math.max(0.04, Math.min(0.30, 0.06 / Math.max(0.2, z.Q))));


// ─── Initialize components ─────────────────────────────────────

const particles = createParticles(18);
const rowEls    = createZoneBars();
const audio     = new AudioEngine();
const breath    = new BreathEngine();
const ui        = wireControls(state, audio, breath);

state.sessionRecorder = createSessionRecorder(state, zones);
loadArticulation().then(doc => { state.articulationDoc = doc; });
const notices = new NoticeEngine();


// ─── Animation loop ────────────────────────────────────────────

function frame(now) {
  // Time tracking
  const dt = state.lastT ? (now - state.lastT) : 16;
  state.lastT = now;
  state.t     = now;
  state.vt   += dt * state.timeScale;

  // Sweep — mutate the primary (internal) driver's frequency
  if (state.sweeping) {
    const pd = state.drivers[0];
    pd.f += state.sweepDir * 0.9 * state.timeScale;
    if (pd.f > 900) state.sweepDir = -1;
    if (pd.f < 70)  state.sweepDir = 1;
    ui.updateSweepDisplay();
  }

  // ── §5b: breath envelope modulates the internal driver amplitude ──
  // Voice rides on breath. At inhale-top, internal amp ≈ 0 (silence);
  // at exhale-mid, internal amp ≈ 1. Zones receive the modulated signal
  // and their AIN-RS-006 envelopes naturally smooth the in/out transitions
  // so the visualization "breathes" instead of clicking on and off.
  const breathEnv = breath.enabled ? breath.envelope(state.vt) : 1;

  // Mic → internal driver frequency (FFT peak; see docs/AUDIO_PIPELINE_DESIGN.md)
  const micInternal = audio.stepMicInternal();
  if (micInternal.length) {
    state.drivers[0].f = micInternal[0].f;
    state.drivers[0].amp = breathEnv;
    if (state.sweeping) state.sweeping = false;
    ui.updateSweepDisplay();
  } else {
    state.drivers[0].amp = breathEnv;
  }

  // ── §5a: rebuild external drivers from audio peaks each frame ──
  // External amplitudes are scaled by externalBalance so the user can
  // bias the internal/external mix. The audio engine handles smoothing
  // and density-adaptive K; we just fold the result into state.drivers.
  const audioPeaks = audio.step();
  state.externalDrivers = audioPeaks.map(p => ({ ...p, amp: p.amp * state.externalBalance }));
  const envD = envDriver(state.envType);
  const pinned = state.pinnedDrivers.map(d => ({ ...d, origin: d.origin || 'preset' }));
  const allDrivers = [
    state.drivers[0],
    ...pinned.filter(d => Math.abs(d.f - state.drivers[0].f) > 0.5),
    ...state.externalDrivers,
    ...(envD ? [envD] : []),
  ];

  // ── §5a: interference field (computed before zones so they can sample it) ──
  // Internal driver is positioned at the larynx; external drivers all radiate
  // from the skull-top. Per AIN-RS-013, this is visualization geometry, not
  // anatomy — surfaced in the UI as a footnote tooltip.
  //
  // Field is only meaningful when 2+ sources exist (interference requires
  // superposition). With a single source, the field is a uniform radial
  // wave with no node/antinode structure — drawing it adds visual noise
  // without information. The "no externals → field is a no-op" rule from
  // the plan is honored here.
  const hasInterference = state.externalDrivers.length > 0;
  const field = (state.fieldEnabled && hasInterference)
    ? computeField(state.drivers[0], state.externalDrivers, state.vt)
    : null;

  // ── Physics (AIN-RS-006: time-dependent envelope) ──
  // 1. Compute per-zone steady-state target from all drivers.
  // 2. Augment each zone's target by the field's local |A| at its position.
  //    (Zones become reporters of the field — AIN-RS-004 spatial-node half.)
  // 3. First-order low-pass each zone toward its target (per-zone tau).
  // 4. Apply coupling on the dynamic state for the rendered amplitudes.
  const pf      = primaryF(state.drivers);
  let spatialNodeActive = false;
  const target  = zones.map(z => {
    let t = zoneResponse(z, allDrivers);
    t = applyViewScale(z, t, state.viewMode);
    if (field && field.maxA > 0.04) {
      // §5a step 5 / AIN-RS-004 (spatial-node half): the field is the truth,
      // zones report it. The local sample modulates the zone bidirectionally —
      // an antinode brightens (up to +35%), a spatial node dims (down to −35%)
      // *even if the zone's raw response would otherwise fire*. Modulation is
      // centered on the cell's |A| relative to the field's current maxA, so
      // the no-externals → field-is-no-op invariant from computeField (maxA=0
      // → guard above) is preserved exactly.
      const sNorm = Math.abs(sampleField(field, z.nx, z.ny)) / field.maxA;  // 0..1
      const mod   = 0.65 + 0.70 * sNorm;  // 0.65 at a node, 1.35 at an antinode
      // AIN-RS-004 (β): a zone with strong raw response sitting at a field node
      // (sNorm < 0.25) is a spatial-node suppression event — badge it distinctly.
      if (t > 0.4 && sNorm < 0.25) spatialNodeActive = true;
      t = Math.min(1, t * mod);
    }
    return t;
  });
  const dt_s = Math.min(dt, 100) / 1000;  // clamp huge dt (tab-blur)
  for (let i = 0; i < zones.length; i++) {
    const alpha = 1 - Math.exp(-dt_s / ZONE_TAU[i]);
    state.zoneAmpsDyn[i] += alpha * (target[i] - state.zoneAmpsDyn[i]);
  }
  let amps          = applyCoupling(state.zoneAmpsDyn);
  amps              = applyEnvFloor(amps, state.envType);
  const sysAmp      = amps.reduce((s, a) => s + a, 0) / amps.length;
  const activeCount = amps.filter(a => a > 0.4).length;
  const arActive    = activeAntiResonance(allDrivers);

  // ── Rendering (uses visual time + primary driver for visual beat) ──
  // Background fade (motion trails)
  ctx.fillStyle = 'rgba(7,9,12,0.32)';
  ctx.fillRect(0, 0, W, H);

  drawSilhouette(ctx, W, H, breathEnv);
  drawSystemAura(ctx, W, H, sysAmp * (0.6 + 0.4 * breathEnv));

  // Field layer: drawn after aura, before vagus/zones. Composite='lighter',
  // body-mask clipped, antinode-threshold emphasized.
  if (field) drawField(ctx, W, H, field);

  drawRegions(ctx, W, H, zones, amps);

  // Vagus particles slow at inhale-top, speed at exhale-mid.
  const vagusGain = 0.35 + 0.65 * breathEnv;
  drawVagus(ctx, W, H, state.vt, sysAmp, particles, state.timeScale * vagusGain);

  zones.forEach((z, i) => drawZone(ctx, W, H, z, amps[i], pf, state.vt));

  if (arActive) {
    drawAntiResonance(ctx, W, H, arActive.ar, arActive.strength, state.vt);
  }

  drawVocalFolds(ctx, W, H, pf, state.vt);
  drawBreathTrace(ctx, W, H, breathEnv, breath.mode, state.breathEnabled, state.vt, breath.periodMs);

  // ── UI updates ──
  updateZoneBars(rowEls, amps);
  updateBadge(sysAmp, activeCount, arActive, spatialNodeActive);
  const badge = document.getElementById('badge');
  const hint = articulationHint(state.articulationDoc, sysAmp, activeCount);
  if (hint) badge.title = hint;
  const noticeText = notices.tick({ realT: Date.now(), sysAmp, activeCount, arActive, spatialNode: spatialNodeActive });
  const noticeEl = document.getElementById('notice');
  if (noticeEl) noticeEl.textContent = noticeText || '';
  const externalFs = state.externalDrivers.map(d => d.f);
  state.sessionRecorder.sample(sysAmp, activeCount, arActive, pf, amps, externalFs);
  ui.updateBreathDisplay(state.vt);

  requestAnimationFrame(frame);
}


// ─── Boot ──────────────────────────────────────────────────────

resize();
requestAnimationFrame(frame);

// Dev hook: expose state + audio for manual verification (§9). Safe to keep —
// the artifact is a single-file static page and the hook is opt-in.
if (typeof window !== 'undefined') {
  window.__rs = { state, audio, zones };
}
