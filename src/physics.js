/**
 * physics.js — Coupled-oscillator resonance model
 *
 * Defines the 10 resonant zones of the vocal/cranial system,
 * computes harmonic response curves, inter-zone coupling,
 * and anti-resonance notches at geometric-mean frequencies.
 *
 * Physics is deterministic and time-independent (AIN-RS-006 queues a
 * time-dependent refactor; see docs/methodology/active_ignorance_nodes.md).
 *
 * Driver model (AIN-RS-005 resolved):
 *   A Driver is { f: Hz, amp: 0..1, phase: rad, origin: string }.
 *   zoneResponse and activeAntiResonance accept arrays of drivers.
 *   origin tags: 'internal' (the singer/slider), 'external' (an uploaded
 *   song peak), 'preset' (a pinned chord stack). Single-driver callers
 *   pass a 1-element array.
 */

// ─── Zone definitions ──────────────────────────────────────────
// Each zone: anatomical id, display name, normalized canvas position (nx, ny),
// visual radius, natural resonant frequency (Hz), Q factor (sharpness), color.
// Positions are in [0,1] relative to the canvas viewport.

// AIN-RS-012 discipline: any `modes[]` entry MUST carry an `evidence` field.
// `cited` is the gold standard; `phenomenological` admits hand-tuning and
// flags the mode for citation hunting; `pending` means a literature range
// is known but a specific source isn't pinned yet.
//
// The primary `freq`/`Q` on each zone is also the first mode and is used
// for anti-resonance pair geometry, envelope tau, and visual rendering.
// Additional `modes[]` entries respond independently to drivers
// (zoneResponse sums per-driver contributions across modes).

// AIN-RS-001 discipline (extended 2026-05-28): every zone — single- or multi-modal
// — carries an `evidence` field on each mode declaring whether the frequency is
// `cited` (literature URL/DOI), `pending` (range known, source not yet pinned),
// or `phenomenological` (hand-tuned, flagged for citation hunting). Single-mode
// zones now expose a 1-element `modes` array so the discipline is uniform across
// all zones; `zoneResponse` already handled both shapes transparently. The
// top-level `freq`/`Q` is preserved for anti-resonance pair geometry, envelope
// tau, and visual rendering — they read mode[0] semantics by construction.
export const zones = [
  { id: 'chest',    name: 'Chest cavity',    nx: 0.50, ny: 0.78, r: 90,  freq: 120, Q: 0.35, color: '#ff7a3c',
    modes: [
      { f: 120, Q: 0.35, evidence: 'phenomenological — low-frequency tissue conduction in the sternum and anterior thoracic wall' },
      { f: 600, Q: 0.50, evidence: 'pending — subglottal F1 (trachea + bronchi + lungs); literature places it in the 500–700 Hz range' },
    ],
  },
  { id: 'heart',    name: 'Heart',           nx: 0.45, ny: 0.69, r: 30,  freq: 105, Q: 0.28, color: '#ff4d6d',
    note: 'Tracks the low-frequency tissue vibration felt NEAR the heart (anterior thoracic wall), not heart-muscle resonance. The heart pumps; it does not acoustically resonate at vocal frequencies.',
    modes: [
      { f: 105, Q: 0.28, evidence: 'phenomenological — felt low-frequency vibration in the anterior thoracic wall near the heart; not heart-muscle resonance' },
    ],
  },
  { id: 'tracheal', name: 'Tracheal column', nx: 0.50, ny: 0.62, r: 24,  freq: 180, Q: 0.45, color: '#ff9550',
    modes: [
      { f: 180, Q: 0.45, evidence: 'phenomenological — open-tube first mode of the adult trachea (literature ranges roughly 150–250 Hz depending on length and termination)' },
    ],
  },
  { id: 'larynx',   name: 'Larynx · folds',  nx: 0.50, ny: 0.52, r: 18,  freq: 220, Q: 0.20, color: '#ffc14a', isDriver: true,
    modes: [
      { f: 220, Q: 0.20, evidence: 'phenomenological — chosen as the comfortable adult phonation fundamental (≈A3); the larynx is the *driver* in this model, not a passive resonator, so Q is intentionally broad' },
    ],
  },
  { id: 'pharynx',  name: 'Pharynx',         nx: 0.50, ny: 0.45, r: 26,  freq: 300, Q: 0.50, color: '#ffe07a',
    modes: [
      { f: 300, Q: 0.50, evidence: 'phenomenological — pharyngeal F1 region; published Story/Titze vocal-tract data places it in the 250–400 Hz range depending on vowel shape' },
    ],
  },
  { id: 'mouth',    name: 'Oral cavity',      nx: 0.56, ny: 0.36, r: 32,  freq: 420, Q: 0.55, color: '#8be58f',
    modes: [
      { f: 420, Q: 0.55, evidence: 'phenomenological — oral F2 region for open vowels; literature ranges 400–800 Hz depending on tongue position' },
    ],
  },
  { id: 'nasal',    name: 'Nasal / sinuses',  nx: 0.51, ny: 0.30, r: 24,  freq: 580, Q: 0.60, color: '#6ad7ff',
    modes: [
      { f: 580, Q: 0.60, evidence: 'phenomenological — paranasal Helmholtz region; maxillary sinus measurements place a primary mode near 500–800 Hz with substantial individual variation' },
    ],
  },
  { id: 'skull',    name: 'Cranial bone',     nx: 0.50, ny: 0.20, r: 65,  freq: 520, Q: 0.40, color: '#4fd6c4',
    modes: [
      { f: 520,  Q: 0.40, evidence: 'phenomenological — cranial vault first mode region (literature ~500 Hz)' },
      { f: 1200, Q: 0.35, evidence: 'pending — cranial vault second mode region' },
      { f: 2800, Q: 0.30, evidence: "pending — singer's formant cluster (~2.8 kHz); bone-conduction resonance contribution; commonly cited in voice science literature but specific skull values vary" },
    ],
  },
  { id: 'eyes',     name: 'Orbital cavities', nx: 0.56, ny: 0.26, r: 12,  freq: 680, Q: 0.70, color: '#7ee0ff',
    modes: [
      { f: 680, Q: 0.70, evidence: 'phenomenological — small bony cavity behind the orbit; treated as a sharp narrow-band responder in the upper formant region. No specific literature citation pinned' },
    ],
  },
  { id: 'ears',     name: 'Inner ear',        nx: 0.42, ny: 0.26, r: 11,  freq: 760, Q: 0.80, color: '#b48cff',
    modes: [
      { f: 760, Q: 0.80, evidence: 'phenomenological — proxy for outer ear / ear canal coupling. Real ear-canal first mode is closer to 3 kHz; this 760 Hz is a stylization to keep the zone in the slider range' },
    ],
  },
];

/** Canonical zone ids for session export / graph ingest (amps[] index order). */
export const ZONE_IDS = zones.map(z => z.id);


// ─── Anti-resonance pairs ──────────────────────────────────────
// For each adjacent pair of zones (sorted by natural frequency),
// the geometric mean √(f₁·f₂) is the canonical anti-resonance
// notch frequency for two coupled oscillators.
//
// Stylization note: real anti-resonance requires complex-amplitude
// phase math. This model uses a Gaussian subtraction at the notch
// frequency — qualitatively correct, not phase-derived.

export const antiResonances = (() => {
  const sorted = [...zones].sort((a, b) => a.freq - b.freq);
  const pairs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (b.freq / a.freq > 2.2) continue;  // too far apart → coupling negligible
    const f     = Math.sqrt(a.freq * b.freq);
    const gap   = b.freq - a.freq;
    const width = Math.max(6, gap * 0.13);  // narrow notch
    const depth = 0.85;                     // deep notch
    pairs.push({ a, b, f, width, depth });
  }
  return pairs;
})();


// ─── Anti-resonance factor for a single zone ───────────────────
// Returns a multiplier in [0, 1] that suppresses a zone's response
// when the drive frequency lands in a notch it participates in.

export function antiResonanceFactor(zone, driveF) {
  let factor = 1.0;
  for (const ar of antiResonances) {
    if (ar.a !== zone && ar.b !== zone) continue;
    const d = Math.abs(driveF - ar.f);
    if (d > ar.width * 3) continue;
    const dip = ar.depth * Math.exp(-Math.pow(d / ar.width, 2));
    factor *= (1 - dip);
  }
  return factor;
}


// ─── Active anti-resonance detection ───────────────────────────
// Returns the strongest anti-resonance pair currently excited
// across the given drivers, or null if none is near any notch.
// Each driver is checked against every notch; the strongest
// (driver, notch) hit wins, weighted by the driver's amplitude
// (since a quiet driver in a notch is a quiet null).

export function activeAntiResonance(drivers) {
  let best = null, bestScore = 0;
  for (const drv of drivers) {
    if (drv.amp <= 0.01) continue;
    for (const ar of antiResonances) {
      const d = Math.abs(drv.f - ar.f);
      if (d > ar.width * 2.2) continue;
      const score = Math.exp(-Math.pow(d / ar.width, 2)) * drv.amp;
      if (score > bestScore) { bestScore = score; best = ar; }
    }
  }
  return best ? { ar: best, strength: bestScore } : null;
}


// ─── Zone response to a set of drivers ─────────────────────────
// Sums per-driver responses (amplitude-weighted, anti-resonance
// applied per driver since notches are a property of the driver's
// frequency, not the system's). Final response is clamped to [0,1].
//
// Multi-modal zones (§12.6): each mode is an independent responder
// at its own (f, Q). Per driver, we compute the best-harmonic-hit
// per mode and SUM across modes (a richer cavity is, by definition,
// reachable at multiple bands). Per-mode the harmonic stack rule is
// unchanged — h=1..8, cents-space Gaussian, h^0.55 falloff. Zones
// without a `modes` array fall back to a single mode at zone.freq/Q,
// preserving backward compatibility exactly.

export function zoneResponse(zone, drivers) {
  const modes = zone.modes || [{ f: zone.freq, Q: zone.Q }];
  let total = 0;
  for (const drv of drivers) {
    if (drv.amp <= 0.01) continue;
    let driverResp = 0;
    for (const mode of modes) {
      let bestH = 0;
      for (let h = 1; h <= 8; h++) {
        const hf    = drv.f * h;
        const ratio = hf / mode.f;
        if (ratio < 0.25 || ratio > 4) continue;
        const cents = Math.abs(Math.log2(ratio)) * 1200;
        const bw    = mode.Q * 600;  // bandwidth in cents
        const g     = Math.exp(-Math.pow(cents / bw, 2));
        const r     = g / Math.pow(h, 0.55);
        if (r > bestH) bestH = r;
      }
      driverResp += bestH;
    }
    total += driverResp * drv.amp * antiResonanceFactor(zone, drv.f);
  }
  return Math.min(1, total);
}


// ─── Driver helpers ────────────────────────────────────────────
// Single point of truth for "which driver is the user singing?"
// The primary driver is the first 'internal' origin driver, falling
// back to the first driver in the list. Used by visual functions
// that still need a single frequency (vocal folds, beat phase).

export function primaryDriver(drivers) {
  return drivers.find(d => d.origin === 'internal') || drivers[0];
}

export function primaryF(drivers) {
  const d = primaryDriver(drivers);
  return d ? d.f : 0;
}


// ─── Inter-zone coupling (AIN-RS-002 resolved) ─────────────────
// Coupling is now an explicit anatomical adjacency graph, NOT
// Euclidean canvas-pixel distance. Each edge names a physical
// pathway by which one zone biases another:
//   - Air column: continuous vocal tract from chest → larynx → lips.
//   - Tissue conduction: chest wall, mediastinal adjacency.
//   - Bone conduction: cranial vault, temporal bone, paranasal sinuses.
// Weights in [0,1] are subjective coupling strengths; the discipline
// is that *each edge has a named anatomical justification* — no
// silent edges. Weights are tunable; the topology is the claim.
//
// AIN-RS-002 resolution note: pixel distance was not anatomical
// distance. This adjacency graph is also a small morphism graph
// and is the natural seed for AIN-RS-014's relational ML layer.

export const adjacency = [
  // Vocal-tract air column (strongest coupling — continuous medium)
  { a: 'chest',    b: 'tracheal', w: 0.50, kind: 'air',    note: 'subglottal pressure drives the column' },
  { a: 'tracheal', b: 'larynx',   w: 0.70, kind: 'air',    note: 'continuous tract' },
  { a: 'larynx',   b: 'pharynx',  w: 0.70, kind: 'air',    note: 'continuous tract above the folds' },
  { a: 'pharynx',  b: 'mouth',    w: 0.60, kind: 'air',    note: 'oral branch of the supraglottal tract' },
  { a: 'pharynx',  b: 'nasal',    w: 0.45, kind: 'air',    note: 'velopharyngeal port' },
  { a: 'mouth',    b: 'nasal',    w: 0.30, kind: 'air',    note: 'coupling via the soft palate' },

  // Thoracic tissue conduction
  { a: 'chest',    b: 'heart',    w: 0.55, kind: 'tissue', note: 'anterior thoracic wall vibrates the cardiac region' },
  { a: 'chest',    b: 'larynx',   w: 0.40, kind: 'tissue', note: 'subglottal pressure couples upward through tissue' },
  { a: 'heart',    b: 'tracheal', w: 0.30, kind: 'tissue', note: 'mediastinal adjacency' },

  // Cranial bone-borne conduction
  { a: 'nasal',    b: 'skull',    w: 0.45, kind: 'bone',   note: 'paranasal sinuses are cavities inside cranial bone' },
  { a: 'skull',    b: 'eyes',     w: 0.50, kind: 'bone',   note: 'orbital cavities are within the skull vault' },
  { a: 'skull',    b: 'ears',     w: 0.55, kind: 'bone',   note: 'temporal bone houses the inner ear' },
  { a: 'nasal',    b: 'eyes',     w: 0.30, kind: 'bone',   note: 'orbital floor is the sinus roof' },
];

// Build a symmetric adjacency matrix once at module load.
const ZONE_INDEX = Object.fromEntries(zones.map((z, i) => [z.id, i]));
const ADJACENCY_MATRIX = (() => {
  const m = zones.map(() => Array(zones.length).fill(0));
  for (const e of adjacency) {
    const ai = ZONE_INDEX[e.a], bi = ZONE_INDEX[e.b];
    if (ai === undefined || bi === undefined) continue;
    m[ai][bi] = Math.max(m[ai][bi], e.w);
    m[bi][ai] = Math.max(m[bi][ai], e.w);
  }
  return m;
})();

// Gain calibrated so peak edge (w=0.70) contributes about the same
// fraction as the old Gaussian-pixel kernel did at its closest neighbor.
const COUPLING_GAIN = 0.10;

export function applyCoupling(rawAmps) {
  const coupled = rawAmps.slice();
  for (let i = 0; i < zones.length; i++) {
    for (let j = 0; j < zones.length; j++) {
      if (i === j) continue;
      coupled[i] += rawAmps[j] * ADJACENCY_MATRIX[i][j] * COUPLING_GAIN;
    }
    coupled[i] = Math.min(1, coupled[i]);
  }
  return coupled;
}


// ═══════════════════════════════════════════════════════════════
//  THE RELEASE PRINCIPLE — register state machine (hysteresis),
//  release control, SOVT back-pressure, and beat frequency.
//
//  These are the FALSIFIABLE CORE. tools/physics_verify.js imports
//  them directly (single source of truth — do not duplicate).
//
//  ⚠ BARRIER_GAIN MUST exceed (F_MAX - F_UP_BASE). See §4.2.
//     With F_MAX=520, F_UP_BASE=260 → required > 260. Currently 300.
//     The first implementation used 190 and SHIPPED THE OPPOSITE OF
//     THE THEORY. If you change F_MAX, F_UP_BASE, or BARRIER_GAIN,
//     re-run: node tools/physics_verify.js
//
//  Consumed only by pages/release_principle.html — the main tuner
//  (index.html / main.js) does not import these, so its 70–3000 Hz
//  spectral behaviour is unchanged. The register machine must only
//  ever be fed a drive clamped to [F_MIN, F_MAX]; feeding it the
//  main app's 70–3000 slider would let a user out-run the barrier
//  and assert the opposite of the theory.
// ═══════════════════════════════════════════════════════════════
export const REGISTER_P = {
  F_UP_BASE:    260,   // Hz — chest→head, ascending  [illustrative; calibrated per user later]
  F_DOWN:       205,   // Hz — head→chest, descending [illustrative]
  BARRIER_GAIN: 300,   // Hz of barrier added at effort = 1.0
  DAMPING_GAIN: 0.72,  // fraction of amplitude lost at effort = 1.0
  REACTANCE:    0.55,  // effort-requirement reduction at occlusion = 1.0
  F_MIN:         80,   // Hz — bottom of the register drive range
  F_MAX:        520,   // Hz — top of the register drive range (barrier ceiling)
  LOCK_EPS:     0.35   // Hz — below this, |f1-f2| counts as locked
};

// Register-dependent zone weighting, indexed to `zones` order (chest…ears).
// CHEST loads the lower body; HEAD loads the cranium.
export const CHEST_W = [1.00, 0.92, 0.85, 0.80, 0.55, 0.35, 0.20, 0.15, 0.12, 0.12];
export const HEAD_W  = [0.22, 0.18, 0.30, 0.55, 0.80, 0.90, 1.00, 0.95, 0.85, 0.85];

// Persistent register state. THIS IS THE MEMORY / THE HYSTERESIS.
let _register = 'CHEST';
export function getRegister()  { return _register; }
export function setRegister(r) { _register = r; }   // reset hook (harness + view)

export function effectiveFUp(effort) {
  return REGISTER_P.F_UP_BASE + effort * REGISTER_P.BARRIER_GAIN;
}

export function updateRegister(f, effort) {
  const fUp = effectiveFUp(effort);
  if (_register === 'CHEST' && f > fUp)                    _register = 'HEAD';
  else if (_register === 'HEAD' && f < REGISTER_P.F_DOWN)  _register = 'CHEST';
  // Inside [F_DOWN, fUp] the register does NOT change. Both states stable.
  // History decides. THAT IS THE BARRIER.
  return _register;
}

export function netDamping(effort, occlusion) {
  const damping = 1 - effort * REGISTER_P.DAMPING_GAIN;   // effort costs output
  const relief  = occlusion * REGISTER_P.REACTANCE;       // SOVT lowers PTP
  return Math.min(1, damping + relief);                   // clamp: occlusion can't create energy
}

export const beatFreq   = (f1, f2) => Math.abs(f1 - f2);
export const beatPeriod = (f1, f2) => {
  const fb = beatFreq(f1, f2);
  return fb < REGISTER_P.LOCK_EPS ? Infinity : 1 / fb;
};
export function beatEnvelope(f1, f2, t) {
  const fb = beatFreq(f1, f2);
  if (fb < REGISTER_P.LOCK_EPS) return 1;                 // locked — no beating
  const rate = Math.min(fb, 26) * 0.34;
  return 0.30 + 0.70 * Math.abs(Math.cos(Math.PI * rate * t));
}


// ─── Utility: frequency → note name ────────────────────────────

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export function freqToNote(f) {
  if (f <= 0) return '—';
  const n     = 12 * Math.log2(f / 440) + 69;
  const r     = Math.round(n);
  const note  = NOTES[(r % 12 + 12) % 12];
  const oct   = Math.floor(r / 12) - 1;
  const cents = Math.round((n - r) * 100);
  const sign  = cents >= 0 ? '+' : '';
  return `${note}${oct}  ${sign}${cents}¢`;
}


// ─── Utility: hex color → rgba string ──────────────────────────

export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
