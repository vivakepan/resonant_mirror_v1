/**
 * dynamics_verify.js
 * ─────────────────────────────────────────────────────────────
 * MEASUREMENT harness for the EMERGENT register core (register_dynamics.js).
 *
 * The Phase 0 harness (physics_verify.js) asserts that a PRESCRIBED encoding
 * matches the theory. This harness is stronger: it MEASURES the bifurcations of
 * an integrated dynamical system and checks that the phenomena EMERGE.
 *
 *   · Hysteresis: sweep pitch up, then down; the measured jump frequencies must
 *     DIFFER (not asserted by an if — observed from where a branch loses stability).
 *   · Crossed-by-subtraction: get stuck on chest at high effort, drop effort with
 *     pitch unchanged, and observe the chest cycle destabilize into head.
 *   · Barrier cannot be out-run: at effort=1, head is unreachable across the range.
 *   · Beat/lock: near unison the internal↔external phase LOCKS; far, it beats.
 *   · SOVT: occlusion turns a decaying (silent) configuration into a sustained one.
 *
 * Also emits GOLDEN VECTORS (tools/register_dynamics_golden.json): reference
 * trajectories a future C++ (Unreal) port must reproduce. See
 * docs/VR_EMBODIMENT_HANDOFF.md §1.
 *
 * Run:  node tools/dynamics_verify.js
 * Exit: 0 = all emergent conditions hold, 1 = at least one failed.
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  DYN_P, growthRates, createState, step, settle,
  dominantRegister, amplitude, isSustained, outputGain, isLocked
} from '../src/register_dynamics.js';

let failures = 0;
const results = [];
function assert(name, cond, detail) {
  const pass = !!cond;
  if (!pass) failures++;
  results.push({ name, pass, detail });
  console.log(`${pass ? '  \x1b[32mPASS\x1b[0m' : '  \x1b[31mFAIL\x1b[0m'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}
function section(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); console.log('─'.repeat(64)); }

// Sweep pitch while carrying state forward; return the first f whose settled
// dominant register equals `target`, or null. History is preserved across steps
// (that is what makes the loop hysteretic).
function sweepToBreak(state, from, to, target, effort, occlusion) {
  const dir = from <= to ? 1 : -1;
  for (let f = from; dir > 0 ? f <= to : f >= to; f += dir) {
    settle(state, { f, effort, occlusion }, 220);
    if (dominantRegister(state) === target) return f;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
section('E1 — HYSTERESIS EMERGES (measured jump frequencies differ)');

const st = createState('CHEST');
settle(st, { f: DYN_P.F_MIN, effort: 0, occlusion: 0 });   // relax onto chest branch
const upBreak = sweepToBreak(st, DYN_P.F_MIN, DYN_P.F_MAX, 'HEAD', 0, 0);
// state is now in HEAD near the top; sweep back down to find the descending break
const downBreak = sweepToBreak(st, DYN_P.F_MAX, DYN_P.F_MIN, 'CHEST', 0, 0);

assert('Ascending jump (chest→head) exists in range', upBreak !== null,
  `up-break = ${upBreak} Hz`);
assert('Descending jump (head→chest) exists in range', downBreak !== null,
  `down-break = ${downBreak} Hz`);
assert('Up and down jumps DIFFER — hysteresis is emergent, not asserted',
  upBreak !== null && downBreak !== null && upBreak > downBreak,
  `up=${upBreak} Hz  down=${downBreak} Hz  bistable width=${upBreak - downBreak} Hz`);

// Inside the bistable band both branches are attractors — history decides.
const mid = Math.round((upBreak + downBreak) / 2);
const fromChest = createState('CHEST'); settle(fromChest, { f: mid, effort: 0, occlusion: 0 });
const fromHead  = createState('HEAD');  settle(fromHead,  { f: mid, effort: 0, occlusion: 0 });
assert('Inside the bistable band BOTH registers are stable (history decides)',
  dominantRegister(fromChest) === 'CHEST' && dominantRegister(fromHead) === 'HEAD',
  `at ${mid} Hz: from chest → ${dominantRegister(fromChest)};  from head → ${dominantRegister(fromHead)}`);

// ═══════════════════════════════════════════════════════════════
section('E2 — CROSSED BY SUBTRACTION (release destabilizes the chest cycle)');

// A pitch above the ascending break, so at effort 0 head wins, but where high
// effort keeps chest stuck (the barrier is raised out of reach).
const fStuck = Math.min(DYN_P.F_MAX - 20, upBreak + 40);

const sub = createState('CHEST');
settle(sub, { f: fStuck, effort: 1.0, occlusion: 0 }, 1200);
const stuck = dominantRegister(sub);
const stuckAmp = amplitude(sub);

settle(sub, { f: fStuck, effort: 0.0, occlusion: 0 }, 1200);   // pitch UNCHANGED, only effort released
const released = dominantRegister(sub);
const releasedAmp = amplitude(sub);

assert('At effort=1.0, chest is STUCK at a pitch above the break (barrier raised)',
  stuck === 'CHEST', `f=${fStuck} Hz, effort=1.0 → ${stuck} (amp ${stuckAmp.toFixed(3)})`);
assert('Releasing effort (pitch unchanged) crosses to HEAD — by subtraction',
  stuck === 'CHEST' && released === 'HEAD',
  `f=${fStuck} Hz: effort 1.0 → ${stuck}, then effort 0.0 → ${released} (amp ${releasedAmp.toFixed(3)})`);

// Barrier cannot be out-run: at full effort, sweep the whole range — never HEAD.
const push = createState('CHEST');
settle(push, { f: DYN_P.F_MIN, effort: 1.0, occlusion: 0 });
const crossedByPushing = sweepToBreak(push, DYN_P.F_MIN, DYN_P.F_MAX, 'HEAD', 1.0, 0);
assert('At effort=1.0, HEAD is UNREACHABLE across the whole drive range',
  crossedByPushing === null,
  `swept ${DYN_P.F_MIN}→${DYN_P.F_MAX} Hz at full effort; register = ${dominantRegister(push)}`);

// Effort damps acoustic output (more work, less sound).
assert('Effort damps output loudness', outputGain(1, 0) < outputGain(0, 0),
  `gain: effort 0 → ${outputGain(0,0).toFixed(3)},  effort 1 → ${outputGain(1,0).toFixed(3)}`);

// ═══════════════════════════════════════════════════════════════
section('E3 — BEAT / LOCK EMERGES (Adler entrainment, no epsilon cutoff)');

function phaseAdvance(f, f2, steps = 4000) {
  const s = createState('CHEST'); s.psi = 0.6;
  for (let i = 0; i < steps; i++) step(s, DYN_P.DT, { f, effort: 0, occlusion: 0, f2 });
  const before = s.psi;
  for (let i = 0; i < 400; i++) step(s, DYN_P.DT, { f, effort: 0, occlusion: 0, f2 });
  return Math.abs(s.psi - before);   // ~0 when locked, grows when beating
}

const nearLock = phaseAdvance(220, 220.2);   // |Δf|=0.2 Hz → inside Arnold tongue
const farBeat  = phaseAdvance(220, 235);     // |Δf|=15 Hz → outside → beating

assert('Near unison the internal↔external phase LOCKS (Δψ → 0)', nearLock < 1e-2,
  `|Δf|=0.2 Hz → residual phase drift ${nearLock.toExponential(2)}`);
assert('Far from unison the phase keeps advancing (beating)', farBeat > 1.0,
  `|Δf|=15 Hz → phase advance ${farBeat.toFixed(2)} rad`);
assert('Analytic Adler lock band agrees: locked near, unlocked far',
  isLocked(220, 220.2) && !isLocked(220, 235),
  `lock(0.2Hz)=${isLocked(220,220.2)}  lock(15Hz)=${isLocked(220,235)}  K=${DYN_P.K_LOCK}`);

// ═══════════════════════════════════════════════════════════════
section('E4 — SOVT BACK-PRESSURE EMERGES (occlusion lowers sustain threshold)');

// A pitch + effort where BOTH growth rates are clearly negative → decays to silence.
const fDead = 430, eDead = 0.6;
const g0 = growthRates(fDead, eDead, 0);
const gOcc = growthRates(fDead, eDead, 1);

const dry = createState('CHEST'); settle(dry, { f: fDead, effort: eDead, occlusion: 0 }, 2500);
const wet = createState('CHEST'); settle(wet, { f: fDead, effort: eDead, occlusion: 1 }, 2500);

assert('Without occlusion the configuration DECAYS to silence',
  !isSustained(dry) && g0.mu_c < 0 && g0.mu_h < 0,
  `f=${fDead}, effort=${eDead}: μ_c=${g0.mu_c.toFixed(3)}, μ_h=${g0.mu_h.toFixed(3)}, amp=${amplitude(dry).toExponential(2)}`);
assert('With occlusion the SAME configuration SUSTAINS (PTP relieved)',
  isSustained(wet) && amplitude(wet) > 10 * amplitude(dry),
  `occlusion=1: μ_c=${gOcc.mu_c.toFixed(3)}, amp=${amplitude(wet).toFixed(3)}`);

// ═══════════════════════════════════════════════════════════════
//  GOLDEN VECTORS — reference trajectories for the C++ (Unreal) port
// ═══════════════════════════════════════════════════════════════
section('GOLDEN VECTORS');

function trajectory(label, inputs, sampleEvery = 200) {
  const s = createState('CHEST');
  const samples = [];
  let n = 0;
  for (const inp of inputs) {
    for (let i = 0; i < DYN_P.SETTLE_STEPS; i++) {
      step(s, DYN_P.DT, inp);
      if (n++ % sampleEvery === 0)
        samples.push({ rc: +s.rc.toFixed(6), rh: +s.rh.toFixed(6), psi: +s.psi.toFixed(6) });
    }
  }
  return { label, dt: DYN_P.DT, settleSteps: DYN_P.SETTLE_STEPS, sampleEvery, inputs, samples };
}

const ramp = [];
for (let f = DYN_P.F_MIN; f <= DYN_P.F_MAX; f += 40) ramp.push({ f, effort: 0, occlusion: 0 });
const golden = {
  note: 'Reference trajectories emitted by src/register_dynamics.js. A C++/Unreal port MUST reproduce these within tolerance (see docs/VR_EMBODIMENT_HANDOFF.md §1).',
  params: DYN_P,
  trajectories: [
    trajectory('ascending_ramp_effort0', ramp),
    trajectory('stuck_then_release', [
      { f: fStuck, effort: 1.0, occlusion: 0 },
      { f: fStuck, effort: 0.0, occlusion: 0 }
    ]),
    trajectory('sovt_relief', [
      { f: fDead, effort: eDead, occlusion: 0 },
      { f: fDead, effort: eDead, occlusion: 1 }
    ])
  ]
};
const outPath = join(dirname(fileURLToPath(import.meta.url)), 'register_dynamics_golden.json');
writeFileSync(outPath, JSON.stringify(golden, null, 2));
console.log(`  wrote ${outPath}`);
console.log(`  ${golden.trajectories.length} trajectories, ` +
  `${golden.trajectories.reduce((n, t) => n + t.samples.length, 0)} samples`);

// ═══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(64));
const total = results.length, passed = total - failures;
if (failures === 0) {
  console.log(`\x1b[32m✓  ALL ${total} EMERGENT CONDITIONS HOLD\x1b[0m`);
  console.log('   Hysteresis, release, lock, and SOVT emerge from the dynamics.');
  console.log(`   Measured passaggio: up-break ${upBreak} Hz, down-break ${downBreak} Hz, ` +
    `width ${upBreak - downBreak} Hz.`);
} else {
  console.log(`\x1b[31m✗  ${failures} of ${total} EMERGENT CONDITIONS FAILED\x1b[0m`);
  console.log('   The dynamics do not (yet) produce the theory. Tune the model, not the test.');
  results.filter(r => !r.pass).forEach(r => console.log(`     · ${r.name}`));
}
console.log('═'.repeat(64) + '\n');
process.exit(failures === 0 ? 0 : 1);
