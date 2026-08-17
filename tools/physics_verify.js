/**
 * physics_verify.js
 * ─────────────────────────────────────────────────────────────
 * FALSIFICATION HARNESS for the Release Principle physics.
 *
 * This is not a unit test suite. It is a set of falsification
 * conditions derived from the theory. If any of these fail, the
 * simulation is asserting something the theory does not claim —
 * or worse, the OPPOSITE of what it claims.
 *
 * The §4.2 release test FAILED on the first implementation. It is
 * the reason this file exists. Do not assume it passes.
 *
 * This harness imports the register/release/beat core DIRECTLY from
 * src/physics.js — it does NOT re-declare the constants. That way it
 * tests the SHIPPED numbers; the app and the harness cannot drift.
 *
 * Run:  node tools/physics_verify.js
 * Exit: 0 = all pass, 1 = at least one falsification condition failed
 *
 * MUST PASS BEFORE ANY COMMIT THAT TOUCHES REGISTER PARAMETERS.
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

import {
  REGISTER_P as P,
  effectiveFUp, updateRegister, netDamping,
  beatFreq, beatPeriod, setRegister, getRegister
} from '../src/physics.js';

// ═══════════════════════════════════════════════════════════════
//  HARNESS
// ═══════════════════════════════════════════════════════════════

let failures = 0;
const results = [];

function assert(name, condition, detail) {
  const pass = !!condition;
  if (!pass) failures++;
  results.push({ name, pass, detail });
  const mark = pass ? '  \x1b[32mPASS\x1b[0m' : '  \x1b[31mFAIL\x1b[0m';
  console.log(`${mark}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

function section(title) {
  console.log('\n\x1b[1m' + title + '\x1b[0m');
  console.log('─'.repeat(64));
}

// ═══════════════════════════════════════════════════════════════
//  F2 — HYSTERESIS MUST EXIST
//  Falsifies: §3.3 of THE_RELEASE_PRINCIPLE.md
//  "Register transition shows no hysteresis — up-sweep and
//   down-sweep thresholds are identical"
// ═══════════════════════════════════════════════════════════════

section('F2 — HYSTERESIS');

setRegister('CHEST');
let upBreak = null;
for (let f = P.F_MIN; f <= P.F_MAX; f++) {
  if (updateRegister(f, 0) === 'HEAD' && upBreak === null) upBreak = f;
}

let downBreak = null;
for (let f = P.F_MAX; f >= P.F_MIN; f--) {
  if (updateRegister(f, 0) === 'CHEST' && downBreak === null) downBreak = f;
}

assert(
  'Ascending break exists within playable range',
  upBreak !== null,
  `up-break = ${upBreak} Hz`
);

assert(
  'Descending break exists within playable range',
  downBreak !== null,
  `down-break = ${downBreak} Hz`
);

assert(
  'Up-sweep and down-sweep do NOT retrace (hysteresis present)',
  upBreak !== downBreak,
  `up=${upBreak} Hz  down=${downBreak} Hz  bistable width=${upBreak - downBreak} Hz`
);

assert(
  'Bistable zone is non-degenerate (f_down < f_up)',
  P.F_DOWN < P.F_UP_BASE,
  `[${P.F_DOWN}, ${P.F_UP_BASE}] — width ${P.F_UP_BASE - P.F_DOWN} Hz`
);

// Register must NOT change inside the bistable zone
setRegister('CHEST');
const midZone = (P.F_DOWN + P.F_UP_BASE) / 2;
updateRegister(midZone, 0);
const chestHeldInZone = (getRegister() === 'CHEST');

setRegister('HEAD');
updateRegister(midZone, 0);
const headHeldInZone = (getRegister() === 'HEAD');

assert(
  'Inside the bistable zone, BOTH registers are stable (history decides)',
  chestHeldInZone && headHeldInZone,
  `at ${midZone} Hz: entering from chest → CHEST; entering from head → HEAD`
);

// ═══════════════════════════════════════════════════════════════
//  §4.2 — THE RELEASE PRINCIPLE
//  THIS IS THE TEST THAT FAILED ON THE FIRST IMPLEMENTATION.
//
//  Claim: you CANNOT reach HEAD register by increasing EFFORT.
//  If BARRIER_GAIN <= (F_MAX - F_UP_BASE), the user can simply
//  out-run the barrier by cranking the drive — and the simulation
//  asserts the OPPOSITE of the theory it exists to demonstrate.
// ═══════════════════════════════════════════════════════════════

section('§4.2 — THE RELEASE PRINCIPLE  (this one failed once)');

const requiredGain = P.F_MAX - P.F_UP_BASE;

assert(
  'BARRIER_GAIN exceeds (F_MAX - F_UP_BASE) — barrier cannot be out-run',
  P.BARRIER_GAIN > requiredGain,
  `BARRIER_GAIN=${P.BARRIER_GAIN}  required > ${requiredGain}  ` +
  `(barrier at max effort = ${effectiveFUp(1.0)} Hz vs F_MAX = ${P.F_MAX} Hz)`
);

// At max effort, sweeping the full drive range must NOT cross.
setRegister('CHEST');
let crossedUnderMaxEffort = false;
for (let f = P.F_MIN; f <= P.F_MAX; f++) {
  if (updateRegister(f, 1.0) === 'HEAD') { crossedUnderMaxEffort = true; break; }
}

assert(
  'At effort=1.0, HEAD is UNREACHABLE across the entire drive range',
  !crossedUnderMaxEffort,
  `swept ${P.F_MIN}→${P.F_MAX} Hz at full clutch; register = ${getRegister()}`
);

// The barrier must RECEDE monotonically with effort.
let recedes = true;
let prev = -Infinity;
for (let e = 0; e <= 1.0; e += 0.1) {
  const b = effectiveFUp(e);
  if (b <= prev) recedes = false;
  prev = b;
}

assert(
  'Barrier recedes monotonically as effort increases',
  recedes,
  `effort 0.0 → ${effectiveFUp(0).toFixed(0)} Hz   ` +
  `effort 1.0 → ${effectiveFUp(1).toFixed(0)} Hz`
);

// ── THE CENTRAL DEMONSTRATION ──
// Stuck at max drive under max effort. Change NOTHING but effort.
// Dropping it must cross. This is subtraction, and nothing else.
setRegister('CHEST');
for (let f = P.F_MIN; f <= P.F_MAX; f++) updateRegister(f, 1.0);
const stuckAtMax = getRegister();

updateRegister(P.F_MAX, 0.0);   // drive UNCHANGED. Only effort released.
const afterRelease = getRegister();

assert(
  'CROSSED BY SUBTRACTION: releasing effort (drive unchanged) reaches HEAD',
  stuckAtMax === 'CHEST' && afterRelease === 'HEAD',
  `at f=${P.F_MAX} Hz:  effort=1.0 → ${stuckAtMax}   ` +
  `then effort=0.0 → ${afterRelease}   ← the theorem, in one line`
);

// Effort must also DAMP output — more work, less sound.
assert(
  'Effort damps acoustic output (EMG finding: more work, less result)',
  netDamping(1.0, 0) < netDamping(0.0, 0),
  `effort=0.0 → damping ${netDamping(0,0).toFixed(3)}   ` +
  `effort=1.0 → damping ${netDamping(1,0).toFixed(3)}`
);

// ═══════════════════════════════════════════════════════════════
//  §2.4 — BEAT FREQUENCY → 0 AT UNISON
// ═══════════════════════════════════════════════════════════════

section('§2.4 — BEAT FREQUENCY (the lock indicator)');

assert(
  'Beat frequency → 0 as f1 → f2',
  beatFreq(219.9, 220) < beatFreq(210, 220) &&
  beatFreq(210, 220) < beatFreq(200, 220),
  `f1=200 → ${beatFreq(200,220)} Hz   ` +
  `f1=210 → ${beatFreq(210,220)} Hz   ` +
  `f1=219.9 → ${beatFreq(219.9,220).toFixed(2)} Hz`
);

assert(
  'Beat period → infinity at unison (pulsing STOPS)',
  beatPeriod(220, 220) === Infinity,
  `T_beat at unison = ${beatPeriod(220, 220)}`
);

assert(
  'Beat period lengthens monotonically as f1 approaches f2',
  beatPeriod(200, 220) < beatPeriod(210, 220) &&
  beatPeriod(210, 220) < beatPeriod(218, 220),
  `f1=200 → ${beatPeriod(200,220).toFixed(3)}s   ` +
  `f1=210 → ${beatPeriod(210,220).toFixed(3)}s   ` +
  `f1=218 → ${beatPeriod(218,220).toFixed(3)}s`
);

// ═══════════════════════════════════════════════════════════════
//  §2.5 — SOVT BACK-PRESSURE
//  Occlusion must LOWER the effort required to phonate.
// ═══════════════════════════════════════════════════════════════

section('§2.5 — SOVT BACK-PRESSURE');

assert(
  'Occlusion relieves the damping cost of effort (PTP is lowered)',
  netDamping(0.5, 1.0) > netDamping(0.5, 0.0),
  `effort=0.5, occlusion=0.0 → ${netDamping(0.5,0).toFixed(3)}   ` +
  `effort=0.5, occlusion=1.0 → ${netDamping(0.5,1).toFixed(3)}`
);

assert(
  'Damping is clamped at 1.0 (occlusion cannot create energy)',
  netDamping(0, 1.0) <= 1.0,
  `effort=0, occlusion=1.0 → ${netDamping(0,1).toFixed(3)}`
);

// ═══════════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(64));
const total = results.length;
const passed = total - failures;

if (failures === 0) {
  console.log(`\x1b[32m✓  ALL ${total} FALSIFICATION CONDITIONS PASS\x1b[0m`);
  console.log('   The physics asserts what the theory claims.');
} else {
  console.log(`\x1b[31m✗  ${failures} of ${total} FALSIFICATION CONDITIONS FAILED\x1b[0m`);
  console.log('\n   The simulation does not assert the theory it exists to');
  console.log('   demonstrate. DO NOT COMMIT. Fix the physics, not the test.');
  console.log('\n   Failed:');
  results.filter(r => !r.pass).forEach(r => console.log(`     · ${r.name}`));
}
console.log('═'.repeat(64) + '\n');

process.exit(failures === 0 ? 0 : 1);
