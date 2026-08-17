# Active Ignorance Nodes

An **Active Ignorance Node (AIN)** is an explicit boundary of current understanding — a registered gap, contradiction, or open question. AINs are tracked rather than hidden; the goal is to make our ignorance *operational*.

Each AIN has: status, where it lives in the code (if applicable), what its blast radius is, and what direction would resolve it.

Status legend: **ACTIVE** · **PARTIALLY RESOLVED** · **RESOLVED** · **DEFERRED**.

---

## AIN-RS-001 — Zone natural frequencies are unverified against bodies

- **Status:** PARTIALLY RESOLVED (evidence-field discipline now uniform across all zones; citations remain pending)
- **Where:** [src/physics.js](../../src/physics.js) zone definitions
- **Description:** Frequencies (chest 120 Hz, larynx 220 Hz, skull 520 Hz, etc.) are hand-tuned to feel right and produce legible visuals. No MRI-derived formant data or published vocal-tract resonance measurements are cited per zone.
- **Blast radius:** Everything downstream — coupling, anti-resonance notches, badge thresholds — treats these as ground truth.
- **Resolution direction:** Mark each zone's frequency as **hypothesis with prediction** and use upcoming song-upload feature to test whether common vocal placements produce expected zone activations.
- **Partial resolution (2026-05-28):** Every zone now carries a `modes: [{ f, Q, evidence }]` array. Single-mode zones were upgraded to the same 1-element array shape as multi-modal ones, so the AIN-RS-012 `evidence` discipline is now **uniform** — every frequency in the system has an explicit `evidence` value declaring `phenomenological` (hand-tuned), `pending` (literature range known, source not pinned), or `cited` (DOI/URL). The tool for catching regressions exists. The open work is promoting `phenomenological` → `pending` or `cited` via literature review at quarterly cadence.
- **Remaining gap (still AIN-RS-012):** No new mode frequency added after 2026-05-28 has a `cited` evidence value yet. Quarterly review of `modes[].evidence` values is the active obligation.

## AIN-RS-002 — Coupling kernel choice is arbitrary

- **Status:** RESOLVED (mechanism); weights remain `phenomenological`
- **Where:** [src/physics.js](../../src/physics.js) `adjacency` array + `applyCoupling`
- **Description:** Inter-zone coupling previously used Euclidean canvas-pixel distance through a Gaussian.
- **Resolution:** Replaced with an explicit anatomical adjacency graph. Each edge names a physical pathway (`air`, `tissue`, or `bone`) and carries a justification note. Topology is the claim; weights are tunable. Verified: singing at the larynx now biases chest/tracheal/pharynx (its air-and-tissue neighbors) but not skull/eyes/ears; singing at the skull biases nasal/eyes/ears (its bone-borne neighbors). Old kernel would have leaked larynx amplitude into the skull on pure pixel proximity — that no longer happens.
- **What's still open:** Individual edge weights are subjective. Promote to **morphism graph seed** per AIN-RS-014 — this small adjacency graph IS the first node + edge schema for the §6.1 graph layer, and weights can be learned from session data once that scaffolding lands. Reference: [src/physics.js:adjacency](../../src/physics.js).

## AIN-RS-003 — No felt-sense ground truth

- **Status:** ACTIVE
- **Where:** Whole project
- **Description:** The badge's "WHOLE-SYSTEM RESONANCE" state is defined by `sysAmp > 0.55` and `activeCount ≥ 5`. Whether *users actually feel anything special at those thresholds* is untested.
- **Blast radius:** Every claim the visualization makes about "resonance happening" depends on this.
- **Resolution direction:** Opt-in aggregate "did this feel different" tags via the journal-noticer ([docs/JOURNAL_NOTICER_DESIGN.md](../JOURNAL_NOTICER_DESIGN.md)), with pre-registered null thresholds and a 5–10% holdout control group. Do NOT train models on this signal without the control group.

## AIN-RS-004 — Two distinct anti-resonance phenomena are conflated

- **Status:** PARTIALLY RESOLVED
- **Where:** [src/renderer.js](../../src/renderer.js), [src/field.js](../../src/field.js); discipline registered in [README.md §3 AIN-RS-004](../../README.md)
- **Description:** **(α) Spectral null** — geometric-mean notches (◊ presets). **(β) Spatial node** — field cancellation when song + internal active.
- **Resolution:** Field shipped (β). Docs distinguish terms; badge label may still say "ANTI-RESONANCE" for α only.

## AIN-RS-005 — Single-driver assumption baked into UI and physics

- **Status:** RESOLVED
- **Where:** [src/ui.js](../../src/ui.js), [src/main.js](../../src/main.js) shared state (`drivers[]`), [src/physics.js:zoneResponse](../../src/physics.js)
- **Description:** All controls previously assumed one driving frequency.
- **Resolution:** State is now `drivers: Driver[]`, each `{ f, amp, phase, origin }`. `zoneResponse` and `activeAntiResonance` accept a driver array; visual functions read the primary (internal) driver via `primaryF()`. UI mutates `state.drivers[0]`. Future §5a song peaks append externals; chord stacks append presets. Verified: single-driver case is bitwise-equivalent to pre-refactor behavior.

## AIN-RS-006 — Time is decorative, not phenomenological

- **Status:** PARTIALLY RESOLVED (envelope landed; full ODE deferred)
- **Where:** [src/main.js](../../src/main.js) `state.zoneAmpsDyn`, `ZONE_TAU`; [src/physics.js:zoneResponse](../../src/physics.js)
- **Description:** Physics was previously time-independent.
- **Partial resolution:** A first-order low-pass envelope now tracks each zone's amplitude toward its steady-state `zoneResponse` target. Per-zone tau is Q-dependent (narrow-band zones ring longer; broad-band zones settle quickly), clamped to a perceptible 40–300 ms range. Verified: sustained drive at preset frequency shows monotonic rise to plateau; switching off-resonance shows monotonic decay. Coupling is now applied on the dynamic state, not the steady-state target.
- **What's still missing:** The envelope is *amplitude-only* — no accumulated phase, no real beating between two close drivers (envelope follows the *target* which itself averages, so two coherent close-frequency drivers produce a steady mean, not a beat). True acoustic beats are deferred to §5a's wave-summation field where phase is explicit. A full driven-damped-oscillator ODE per mode (`ẍ + 2γẋ + ω₀²x = F(t)`) would also be needed for clean phase-lock and harmonic phase-relationships; current envelope is sufficient for the visual-richness gain it set out to deliver.
- **Resolution direction (remaining):** When §5a lands, the field provides phase-aware spatial samples; per-zone state can read those samples directly. Promotion to full ODE only if envelope-only beats prove insufficient in user-felt-sense feedback.

## AIN-RS-007 — Breath is missing entirely

- **Status:** RESOLVED (mechanism shipped)
- **Where:** [src/breath.js](../../src/breath.js), [src/main.js](../../src/main.js)
- **Description:** Heartbeat (~1 Hz), vagus flow, and breath envelope now coexist. Default: synthesized sine (3–8 s period); optional tap and mic-derived modes.
- **Remaining:** AIN-RS-015 — whether synth alone is phenomenologically sufficient.

## AIN-RS-008 — ML scaffold doesn't connect to the artifact

- **Status:** ACTIVE
- **Where:** [tools/synthetic_sessions/](../../tools/synthetic_sessions/) vs. [src/](../../src/)
- **Description:** Synthetic-session tool generates traces and trains a classifier, but the trained model is never loaded back into the browser. The artifact has no notion of "this exploration style is approaching a non-obvious state."
- **Blast radius:** ML insights stay in CI; users never benefit, and the system can't learn from real sessions.
- **Resolution direction:** Two-tier — (a) classical classifier for in-browser hints (passive notices, never recommendations); (b) the morphism-graph layer (AIN-RS-014) for offline relational discovery.

## AIN-RS-009 — Methodology registries don't exist in the repo

- **Status:** RESOLVED (by this very file and its siblings)
- **Where:** [docs/methodology/](.)
- **Description:** Methodology v1.2 prescribes five registries. Resonant Singer previously had none as living files.
- **Resolution:** Three day-one registries stood up (`assumptions.md`, this file, `isomorphic_mappings.md`). The other two (`failures.md`, `alignment_log.md`) created when they have content.

## AIN-RS-010 — "Resonance" is named but not formally defined

- **Status:** ACTIVE
- **Where:** README, badge thresholds, essay framing
- **Description:** "Resonance" does heavy lifting across acoustics (sharp Q-peak response), phenomenology ("ringing in my chest"), and metaphor ("resonates with me"). The system collapses all three.
- **Blast radius:** Users with different mental models calibrate the controls differently.
- **Resolution direction:** Short glossary in `docs/` registering the three senses; mark which one the badge means; keep the others as legitimate but separate.

## AIN-RS-011 — Wave amplitude omits 1/r falloff

- **Status:** ACTIVE
- **Where:** [src/field.js](../../src/field.js)
- **Description:** The two-source interference field uses `A·sin(k·r − ω·t)` with constant amplitude. Real point sources have 1/r falloff for spherical waves (or 1/√r for cylindrical). This is a 2D plane-wave-ish approximation, fine for visualization, dishonest for measurement.
- **Blast radius:** Near-source intensities are over-estimated relative to far-source. Beat patterns are visually exaggerated relative to a measurement.
- **Resolution direction:** Acceptable simplification for visualization; flag in the field's docs and UI tooltip. Add 1/r as an optional rendering mode if it improves legibility.

## AIN-RS-012 — Multi-modal frequencies need citation discipline

- **Status:** PARTIALLY RESOLVED (mechanism shipped; citations pending)
- **Where:** [src/physics.js](../../src/physics.js) zone `modes` arrays (chest, skull)
- **Description:** Large-cavity zones now carry a `modes: [{ f, Q, evidence }, ...]` array. Each mode entry **must** carry an `evidence` field. Three legal values: `cited` (a literature URL or DOI), `pending` (the literature range is known but a specific source is not yet pinned), `phenomenological` (admits hand-tuning, flags the mode for citation hunting).
- **Resolution status (now):**
  - Chest: mode 1 @ 120 Hz `phenomenological`; mode 2 @ 600 Hz `pending` (subglottal F1, literature 500–700 Hz).
  - Skull: mode 1 @ 520 Hz `phenomenological`; mode 2 @ 1200 Hz `pending` (cranial vault second mode).
- **What's still missing:** None of the new modes have *pinned citations* — they are all `pending` or `phenomenological`. The mechanism is in place; the literature hunt is the open work.
- **Blast radius:** If "pending" modes drift to "settled" without citation, this AIN regresses to AIN-RS-001-with-more-parameters.
- **Resolution direction:** Quarterly review of `modes[].evidence` values; promote `pending` → `cited` with URLs, or demote to `phenomenological` and flag for removal. Singer's formant cluster (~2.8 kHz) is the obvious next mode to add for skull but requires slider extension to be visible from internal drive — defer until §5a externals can reach it.

## AIN-RS-013 — Source-position geometry is artistic, not anatomical

- **Status:** RESOLVED (disclaimer shipped)
- **Where:** [src/field.js](../../src/field.js), song panel tooltip, A-010
- **Description:** "External source enters at the top of the skull" is visualization geometry chosen for legibility of the interference pattern, NOT acoustics. A song reaches the body via air pressure at both ears.
- **Blast radius:** If unflagged, the visualization risks being misread as physiology.
- **Resolution direction:** Mandatory UI footnote and docs disclaimer wherever the source position is exposed. Refer also to A-010 (assumption).

## AIN-RS-014 — Relational-graph ML layer absent

- **Status:** PARTIALLY RESOLVED (offline scaffold shipped; browser ingest + articulation loader landed)
- **Where:** [tools/graph_engine/](../../tools/graph_engine/), [src/sessions.js](../../src/sessions.js), [src/articulation.js](../../src/articulation.js)
- **Description:** Morphism graph pipeline (ingest, homology, neti-neti, articulate) runs locally. Browser exports opt-in session JSONL; optional `articulation.json` enriches badge tooltips.
- **Remaining:** §9 verification harness on real/synthetic corpora; tune similarity thresholds; journal-noticer holdout integration.

## AIN-RS-015 — Is synthesized breath enough to embody the visualization?

- **Status:** ACTIVE (registered at §5b landing)
- **Where:** [src/breath.js](../../src/breath.js), [src/main.js](../../src/main.js) breath-envelope wiring
- **Description:** Default breath source is a synthesized cosine envelope (3–8 s period). Two alternatives — mic-derived RMS and tap-to-breathe spacebar — are scaffolded but off by default. The phenomenological question is open: does the synth alone produce a "voice rides on breath" felt sense for users, or is the absence of self-generated breath the missing ingredient that keeps the visualization at *carrier-modulator demonstration* rather than *embodied tuner*?
- **Blast radius:** If synthesized breath is insufficient, the §5b feature lands as decorative motion (visual breath) rather than functional rhythm (felt breath). Every claim that the visualization "now traces the parasympathetic axis" depends on this.
- **Resolution direction:** Empirical, not designable. Requires opt-in journal-noticer-style feedback ([JOURNAL_NOTICER_DESIGN.md](../JOURNAL_NOTICER_DESIGN.md)) on three conditions: (a) synth only, (b) tap-to-breathe, (c) mic-RMS. Pre-register the prediction that ≥60% of users report mode (b) or (c) feels more embodied than (a). Falsification: if synth is rated equally embodied across modes, the AIN partially resolves and breath inputs can be deprioritized.
- **Coupling to AIN-RS-003:** Felt-sense ground truth is the parent question. This is its breath-shaped instance.

## AIN-RS-016 — Register thresholds f_up / f_down are illustrative, not measured

- **Status:** ACTIVE (registered at Release Principle Phase 0 landing) · cross-refs spec AIN-V2-005
- **Where:** [src/physics.js](../../src/physics.js) `REGISTER_P` (`F_UP_BASE`, `F_DOWN`, `BARRIER_GAIN`); consumed by [pages/release_principle.html](../../pages/release_principle.html)
- **Description:** The register state machine models the chest→head passaggio as a hysteretic barrier: the ascending break (`F_UP_BASE` = 260 Hz) differs from the descending break (`F_DOWN` = 205 Hz), producing a bistable zone. The **existence** of the gap is physically grounded — register transitions really are hysteretic. Its **width and absolute placement are free parameters**, hand-set for legibility, and are **not measurements of any person**. The view's footnote says so verbatim.
- **Blast radius:** If the numbers are read as a readout of a specific singer's voice, the tool overclaims. The whole point of the Release Principle is that the residual which never closes *is your anatomy* — smuggling calibrated-looking constants in as if measured would tune that finding out of existence (Spec Part I, C4/C7).
- **Open question (= spec AIN-V2-005):** Are calibrated `f_up` / `f_down` stable across sessions, or do they drift with warm-up, fatigue, and health? Untested. Per-user calibration is Phase 1; until then these are illustrative.
- **Falsification discipline:** `node tools/physics_verify.js` encodes 15 conditions derived from the theory (hysteresis present, barrier recedes with effort, HEAD unreachable by pushing at max effort, crossed-by-subtraction, beat→0 at unison, SOVT relief). It **must be 15/15 before any commit that touches register parameters** — the first implementation used `BARRIER_GAIN=190` and shipped the *opposite* of the theory (a barrier the user could out-run by pushing); the harness caught it. Wired into `npm run verify`.
- **Resolution direction:** Phase 1 per-user calibration + a session-to-session stability study; do not promote these constants to "measured" without it.

---

## How to add an AIN

A real AIN is *operational*: it names a gap that, if resolved, would change the code or the model. Vague worries don't qualify. Template:

- **Statement** — one sentence on what's not known.
- **Where** — file path or "absent" if the gap is structural.
- **Blast radius** — what depends on this.
- **Resolution direction** — what would close the gap (not "more research"; something specific).

If you can't write a resolution direction, the AIN isn't ready.
