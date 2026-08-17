/**
 * register_dynamics.js — EMERGENT register physics (engine-agnostic core)
 * ─────────────────────────────────────────────────────────────
 * This is the successor to the PRESCRIBED register layer in physics.js.
 *
 * physics.js models the passaggio with a two-threshold state machine: a
 * stored `_register` label flips when frequency crosses a hardwired barrier.
 * Hysteresis, crossing-by-subtraction, and beat-lock are ASSERTED there.
 *
 * Here they EMERGE from dynamics. The register is not stored — it is an
 * OBSERVABLE of two competing limit-cycle oscillators:
 *
 *     A_c = chest-dominant fold mode      A_h = head-dominant fold mode
 *
 * Real-amplitude (averaged Stuart–Landau) form, with cross-saturation β>1
 * giving winner-take-all competition:
 *
 *     dr_c/dt = (μ_c − r_c² − β·r_h²)·r_c
 *     dr_h/dt = (μ_h − r_h² − β·r_c²)·r_h
 *
 *   · Register = which limit cycle is active (r_c vs r_h) — an observable.
 *   · HYSTERESIS emerges from the saddle-node folds: the jump-up frequency
 *     (chest→head) and jump-down frequency (head→chest) differ, because in a
 *     band BOTH single-mode states are stable and history decides.
 *   · CROSS-BY-SUBTRACTION emerges: effort SUPPRESSES μ_h (raises the barrier).
 *     Releasing effort lets μ_h cross zero, the chest cycle LOSES STABILITY,
 *     and the trajectory falls into head. Subtraction, not push.
 *   · SOVT emerges: occlusion RAISES growth (lowers the sustain threshold),
 *     so a configuration that decays to silence can be made to phonate.
 *   · BEAT / LOCK emerges from Adler entrainment of the internal oscillator by
 *     an external tone: phase-locks inside an Arnold tongue |2π·Δf| ≤ K,
 *     beats outside it. No LOCK_EPS cutoff.
 *
 * ENGINE-AGNOSTIC: pure math, no DOM, no renderer, no engine types. It is the
 * single source of truth. tools/dynamics_verify.js MEASURES its bifurcations
 * and emits golden vectors; a future C++ (Unreal) port validates against them.
 * See docs/VR_EMBODIMENT_HANDOFF.md §1.
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

export const DYN_P = {
  F_MIN: 80, F_MAX: 520,   // Hz — register drive range (barrier ceiling at F_MAX)

  BETA: 2.0,               // cross-saturation (>1 → winner-take-all bistability)

  // Growth rates (linear in normalized pitch xn = (f−F_MIN)/(F_MAX−F_MIN)):
  //   μ_c = AC − BC·xn + OCC_GAIN·occlusion        (chest: strong low, dies high)
  //   μ_h = AH + BH·xn − EFFORT_SUPPRESS·effort + OCC_GAIN·occlusion
  //                                                 (head: dies low, strong high)
  AC: 0.541, BC: 1.0,
  AH: -0.152, BH: 1.0,

  EFFORT_SUPPRESS: 2.0,    // C — effort suppresses head growth → RAISES the barrier.
                           //     Invariant: large enough that head is UNREACHABLE
                           //     across [F_MIN,F_MAX] at effort=1 (barrier cannot be
                           //     out-run). With AH,BH above → xn_up(effort=1) > 1.
  OCC_GAIN: 0.40,          // D — occlusion raises growth → lowers sustain threshold (SOVT)

  K_LOCK: 3.1416,          // Adler coupling; lock band is |2π·(f2−f)| ≤ K_LOCK
  DAMP_GAIN: 0.72,         // output loudness lost per unit effort (more work, less sound)
  REACT: 0.55,             // output loudness relief per unit occlusion

  FLOOR: 1e-4,             // amplitude floor so a dead mode can revive when μ turns positive
  DT: 0.02,                // integration step (slow-envelope time units)
  SETTLE_STEPS: 400        // steps to relax onto the current stable branch
};

export const xnorm = (f) => (f - DYN_P.F_MIN) / (DYN_P.F_MAX - DYN_P.F_MIN);

export function growthRates(f, effort = 0, occlusion = 0) {
  const xn = xnorm(f);
  const mu_c = DYN_P.AC - DYN_P.BC * xn + DYN_P.OCC_GAIN * occlusion;
  const mu_h = DYN_P.AH + DYN_P.BH * xn
             - DYN_P.EFFORT_SUPPRESS * effort + DYN_P.OCC_GAIN * occlusion;
  return { mu_c, mu_h };
}

export function createState(register = 'CHEST') {
  return {
    rc: register === 'CHEST' ? 0.7 : DYN_P.FLOOR,
    rh: register === 'HEAD' ? 0.7 : DYN_P.FLOOR,
    psi: 0   // internal↔external relative phase (Adler); drives beat/lock
  };
}

function deriv(rc, rh, mu_c, mu_h) {
  const b = DYN_P.BETA;
  return [
    (mu_c - rc * rc - b * rh * rh) * rc,
    (mu_h - rh * rh - b * rc * rc) * rh
  ];
}

/** One RK4 step of the amplitude dynamics + one Euler step of the Adler phase. */
export function step(state, dt, inp) {
  const { f, effort = 0, occlusion = 0, f2 = null } = inp;
  const { mu_c, mu_h } = growthRates(f, effort, occlusion);

  let { rc, rh } = state;
  const k1 = deriv(rc, rh, mu_c, mu_h);
  const k2 = deriv(rc + 0.5 * dt * k1[0], rh + 0.5 * dt * k1[1], mu_c, mu_h);
  const k3 = deriv(rc + 0.5 * dt * k2[0], rh + 0.5 * dt * k2[1], mu_c, mu_h);
  const k4 = deriv(rc + dt * k3[0], rh + dt * k3[1], mu_c, mu_h);
  rc += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  rh += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  state.rc = Math.max(DYN_P.FLOOR, rc);
  state.rh = Math.max(DYN_P.FLOOR, rh);

  if (f2 !== null) {
    const dOmega = 2 * Math.PI * (f2 - f);
    state.psi += dt * (dOmega - DYN_P.K_LOCK * Math.sin(state.psi));
  }
  return state;
}

export function settle(state, inp, steps = DYN_P.SETTLE_STEPS, dt = DYN_P.DT) {
  for (let i = 0; i < steps; i++) step(state, dt, inp);
  return state;
}

// ── Observables (the register is READ, never stored) ──────────────
export const dominantRegister = (state) => (state.rc >= state.rh ? 'CHEST' : 'HEAD');
export const amplitude        = (state) => Math.max(state.rc, state.rh);
export const isSustained      = (state) => amplitude(state) > 10 * DYN_P.FLOOR;

/** Output loudness gain — effort damps, occlusion relieves (SOVT). Not the oscillator growth. */
export const outputGain = (effort, occlusion) =>
  Math.min(1, (1 - effort * DYN_P.DAMP_GAIN) + occlusion * DYN_P.REACT);

/** Adler lock condition — the emergent replacement for a fixed LOCK_EPS. */
export const isLocked = (f, f2) => Math.abs(2 * Math.PI * (f2 - f)) <= DYN_P.K_LOCK;
