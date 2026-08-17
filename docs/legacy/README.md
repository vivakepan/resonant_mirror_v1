# Resonant Singer

**A browser visualization of vocal-cranial resonance as a system of coupled oscillators.** Ten anatomical zones (chest → skull), two-source interference field, breath-modulated autonomic rhythm, offline morphism graph pipeline — all built to a discipline that registers what the model doesn't know at least as carefully as what it does.

---

## Why this exists (the epistemic claim)

Most interactive resonance tools either perform clinical measurements or sell wellness metaphysics. This is neither. It is a **research artifact with explicit uncertainty quantification**: 15 registered Active Ignorance Nodes naming exactly where the model's assumptions outrun its warrant; an offline ML pipeline explicitly designed against feedback-loop failure modes; a morphism graph layer that rejects surface-similar session patterns via zone-identity permutation testing before emitting any articulation.

The audio privacy architecture refuses to transmit MFCCs or mel-spectrograms because they are invertible to intelligible speech. The visualization explicitly distinguishes between spectral nulls (resonator system property) and spatial nodes (wave geometry property) — a distinction most two-source field visualizations collapse. Every zone frequency carries an `evidence` field declaring whether it's `cited`, `pending`, or `phenomenological`.

If you are building something at the intersection of biofeedback, ML, and embodied experience, the architecture here — not the acoustic model — is the primary contribution.

---

## What it is

A Canvas 2D browser application running at 60fps, zero dependencies, that ships as a single static HTML file (`dist/vocal_resonance.html`). It models the body as a coupled-oscillator system:

- **10 anatomical zones** — chest, trachea, pharynx, mouth, nasal, skull, inner-ear, larynx, heart, abdomen — each defined by natural frequency modes with Q factors and evidence status
- **Internal source** — the singer's frequency (slider, mic, or sweep), positioned at the larynx
- **External source** — a loaded audio file (FFT peak extraction), radiating from skull-top
- **Two-source interference field** — 48×60 grid wave superposition; zones sample the field and report it
- **Breath layer** — synthesized cosine envelope (~5s period) modulates internal amplitude and vagus particle velocity
- **Spectral null presets** — four ◊ buttons at geometric-mean anti-resonance frequencies between adjacent zone pairs
- **Offline morphism graph** — Python pipeline: ingest → typed-path Jaccard homology → neti-neti permutation test → read-only articulation

---

## Shipped modules

| Module | File | What it does |
|--------|------|--------------|
| Physics | `src/physics.js` | 10 zones with `modes[]`, anatomical adjacency coupling, anti-resonance pairs, `zoneResponse`, `applyCoupling`, `primaryF` |
| Field | `src/field.js` | 48×60 interference grid, `computeField`, `sampleField`, `drawField`, body-mask clipping |
| Audio | `src/audio.js` | Web Audio FFT, microphone pitch extraction, song-file peak extraction (K≤5), `echoCancellation: false` |
| Breath | `src/breath.js` | Synthesized cosine, mic-RMS, and tap-to-breathe modes; `envelope(vt)` |
| Anatomy | `src/anatomy.js` | Silhouette, vocal folds, vagus particles, breath trace, heart glyph |
| Renderer | `src/renderer.js` | Zone glows, system aura, field layer, region fills, anti-resonance nodes, `updateBadge` with spectral-null / spatial-node / whole-system states |
| UI | `src/ui.js` | Slider (70–3000 Hz), presets, sweep, speed, multi-pin, external balance, breath controls |
| Views | `src/views.js` | Five view stances (organs/flow/nerves/solid/em) scaling zone weights |
| Env | `src/env.js` | Envelope driver profiles (none/chest/skull/whole) |
| Sessions | `src/sessions.js` | Opt-in JSONL export: `{t, internal_f, external_fs, amps[10], sysAmp, arActive}` |
| Articulation | `src/articulation.js` | Loads `articulation.json` from offline pipeline; enriches badge tooltip with seeded openings fallback |
| Notices | `src/notices.js` | Rule-based state machine: sustained-state detection → past-tense notice text; SUSTAINED=3s, DISPLAY=6s, COOLDOWN=15s; never recommendations |

---

## Release Principle (Phase 0)

A dedicated view demonstrating that the chest→head **passaggio is a barrier crossed by subtraction, not addition** — you release the effort, you do not push through it.

- **Where:** `pages/release_principle.html` — a slider-driven physics sandbox (drive / effort / occlusion / reference f₂), **no microphone loop, no scoring**.
- **Physics core:** the register state machine (`REGISTER_P`, `updateRegister`, `effectiveFUp`, `netDamping`, beat helpers) lives as pure exports in `src/physics.js`. The main tuner does not consume them, so its behavior is unchanged.
- **What it shows:** *hysteresis* (up-break ≈ 261 Hz ≠ down-break ≈ 204 Hz — the ascending and descending sweeps do not retrace, and the enclosed area **is** the barrier); *release control* (at effort=1.0 HEAD is unreachable across the whole drive range; drop effort with drive unchanged → snaps to HEAD); *beat lock* (beating → 0 at unison); *SOVT back-pressure* (occlusion relieves the damping cost of effort).
- **Run it:** start a server (`npm run serve` or `npm start`) and open `/pages/release_principle.html`. Module imports require http, not `file://`.
- **Falsification note:** `node tools/physics_verify.js` must print **15/15, exit 0** before any commit that touches register parameters. The first implementation used `BARRIER_GAIN=190` and shipped the *opposite* of the theory (the barrier could be out-run by pushing drive); the §4.2 condition caught it. The invariant is `BARRIER_GAIN > (F_MAX − F_UP_BASE)`. Wired into `npm run verify`.
- **Illustrative, not measured:** `f_up`/`f_down` are free parameters, not measurements of any body (AIN-RS-016). The *existence* of the gap is grounded; its *width* is a knob.

---

## Offline pipeline

```
browser EXPORT SESSION
       ↓
sessions.jsonl
       ↓
tools/graph_engine/ingest.py      → SQLite graph.db (typed nodes + morphisms)
tools/graph_engine/homology.py    → typed-path Jaccard similarity candidates (τ=0.55)
tools/graph_engine/neti_neti.py   → zone-identity permutation test (50 trials); rejects surface-similar matches
tools/graph_engine/articulate.py  → articulation.json (past-tense recognition + revealed opening pairs)
       ↓
browser loads articulation.json → badge tooltip enriched
```

Additional tools:

- `tools/synthetic_sessions/` — synthetic session generator + logistic regression classifier (87% accuracy over zone-activation features; reference implementation for "synthetic data first" discipline)
- `tools/journal_noticer/` — append-only aggregate noticer; mandatory null-week output; holdout control group; no weight training on user behavior
- `tools/verify_all.sh` — pre-release suite: JS syntax, Release Principle falsification harness, zone-list parity, DOM audit, graph schema smoke, journal noticer, synthetic ML, §9 field interference beat tests, esbuild bundle
- `tools/physics_verify.js` — falsification harness for the Release Principle register physics; imports the shipped core from `src/physics.js` (zero-drift) and asserts 15 conditions incl. hysteresis, crossed-by-subtraction, beat→0 at unison, SOVT relief

---

## What's staged (not shipped)

| Capability | Where it lives | What would unlock it |
|------------|---------------|----------------------|
| YIN/MPM pitch detector in AudioWorklet | `docs/AUDIO_PIPELINE_DESIGN.md` | Replace FFT peak-pick for live mic; ~100 lines of DSP |
| Three.js volumetric field | `docs/ENGINE_ROADMAP.md` | Nodal surfaces you can fly through; keeps browser shareability |
| Real user session corpus | `docs/methodology/active_ignorance_nodes.md` AIN-RS-003 | Opt-in journal-noticer aggregate + holdout group |
| Citation promotion (`phenomenological` → `cited`) | `src/physics.js` `modes[].evidence` | Quarterly literature review of zone frequencies |
| ML feedback loop closure (AIN-RS-008) | `tools/synthetic_sessions/` | In-browser classifier loading + notice integration |
| Spatial articulation calibration | AIN-RS-014 | Real session corpus + tuned similarity thresholds |

---

## Active Ignorance Nodes

An AIN is a registered gap: a place where the model's assumptions outrun its warrant. They are tracked because hidden gaps are more dangerous than acknowledged ones.

| AIN | Description | Status |
|-----|-------------|--------|
| AIN-RS-001 | Zone natural frequencies are unverified against bodies | PARTIALLY RESOLVED — `evidence` field now uniform across all modes; citations pending |
| AIN-RS-002 | Coupling kernel was Euclidean pixel distance | RESOLVED — replaced with anatomical adjacency graph (13 named air/tissue/bone edges) |
| AIN-RS-003 | No felt-sense ground truth for badge thresholds | ACTIVE — requires opt-in journal-noticer with holdout group |
| AIN-RS-004 | Two anti-resonance phenomena conflated | PARTIALLY RESOLVED — spectral null (α) and spatial node (β) now distinct in badge, canvas label, and docs |
| AIN-RS-005 | Single-driver assumption baked into UI and physics | RESOLVED — state is now `drivers: Driver[]`; all physics accepts driver arrays |
| AIN-RS-006 | Time was decorative, not phenomenological | PARTIALLY RESOLVED — first-order per-zone envelopes with Q-dependent tau; full ODE deferred |
| AIN-RS-007 | Breath was missing entirely | RESOLVED — `src/breath.js`, three modes (synth/mic/tap), modulates internal source and vagus |
| AIN-RS-008 | ML scaffold doesn't connect to artifact | ACTIVE — trained model never loaded in browser; offline pipeline only |
| AIN-RS-009 | Methodology registries absent from repo | RESOLVED — `docs/methodology/` with assumptions, AINs, isomorphic mappings |
| AIN-RS-010 | "Resonance" collapses acoustic/phenomenological/metaphorical senses | ACTIVE — three senses distinct in docs; badge means the acoustic threshold |
| AIN-RS-011 | Wave amplitude omits 1/r falloff | ACTIVE — deliberate simplification; flagged in field docs |
| AIN-RS-012 | Multi-modal zone frequencies need citation discipline | PARTIALLY RESOLVED — `evidence` field per mode; chest/skull modes `pending`; no `cited` yet |
| AIN-RS-013 | Source-position geometry is artistic, not anatomical | RESOLVED — UI tooltip and docs disclaimer shipped |
| AIN-RS-014 | Relational-graph ML layer absent | PARTIALLY RESOLVED — offline scaffold ships; browser ingest + articulation loader land; thresholds untuned |
| AIN-RS-015 | Is synthesized breath enough to embody the visualization? | ACTIVE — empirical question; requires three-condition journal-noticer study |
| AIN-RS-016 | Register thresholds `f_up`/`f_down` are illustrative, not measured | ACTIVE — the *existence* of the hysteresis gap is grounded; its *width* is a free parameter, not a measurement of any body (cross-ref spec AIN-V2-005) |

Full detail: [`docs/methodology/active_ignorance_nodes.md`](docs/methodology/active_ignorance_nodes.md)

---

## Two phenomena not to conflate

The left-rail ◊ buttons and the `◊ SPATIAL NODE` badge fire from **physically different mechanisms**:

| Kind | Mechanism | Source |
|------|-----------|--------|
| **Spectral null (α)** | Geometric-mean notch in zone transfer function — property of the resonator system | `antiResonanceFactor` in `physics.js`; ◊ presets |
| **Spatial node (β)** | Field cancellation at interference grid point — property of wave geometry when two sources are active | `field.js` + `sampleField` in `main.js` |

A zone can sit at a spatial node (β) even when its raw resonant response is high — the field suppresses it. These are not alternative names for the same thing.

---

## Honesty notes (load-bearing)

These are not disclaimers added to avoid liability. They are part of the model.

1. **"Song enters at the top of the skull"** is **visualization geometry, not acoustics.** A song reaches the body via air pressure at both ears. The skull-top position makes the interference geometry legible — internal source rises from the larynx, external descends from above, the meeting region falls inside the zone array. The UI song panel shows this as a tooltip footnote.

2. **Phase coherence between sources is assumed.** Real-world phase relationships between a hum and a song are arbitrary. The visualization is a "what if these were locked" structural geometry, not a recording of what's happening in a room.

3. **1/r amplitude falloff is omitted.** The field uses constant-amplitude waves. Near-source intensities are overestimated relative to far-source; beat patterns are visually exaggerated relative to measurement. Registered as AIN-RS-011.

4. **The badge threshold is arithmetic, not phenomenological.** `WHOLE-SYSTEM RESONANCE` fires at `sysAmp > 0.55 && activeCount ≥ 5`. Whether a user feels anything at that threshold is unknown (AIN-RS-003).

5. **No clinical claim.** This is not a medical device, biofeedback instrument, or wellness tool. It is a physics model displayed on a canvas.

---

## Methodology discipline

The epistemic architecture borrows structure from two external documents (*Methodology v1.2* and *Presence Engine v2.2*) — not their subject matter. The mappings:

| Parent concept | Resonant Singer instance |
|----------------|--------------------------|
| Active Ignorance Node | Zone frequency / coupling edge that's hand-tuned but unverified |
| Isomorphic enrichment | Helmholtz resonator math, two-source interference physics, room acoustics |
| Deferred closure | Don't label a session as resonant without independent structural warrant |
| Morphism graph | Songs × zones × sessions × events as relational typed nodes |
| Neti-neti elimination | Strip zone labels — is this pattern structurally like that pattern, or just surface-similar? |
| Anti-recommendation | Past-tense only: "chest+heart co-fired in 14 sessions", never "try shifting your pitch down 8 Hz" |

The ML pipeline design discipline (append-only aggregate, holdout control group, no weight training on user behavior) implements patterns from Hadfield-Menell 2017 (reward misspecification) and citizen-science aggregation practice at the product level.

Full registries: [`docs/methodology/`](docs/methodology/)

---

## Design-choice audit (key decisions)

| Choice | Alternative | Why this wins |
|--------|-------------|---------------|
| Canvas 2D | WebGL / Three.js | Zero-dep, one-click distribution, single-file build. Three.js is staged for the 3D tier, not now. |
| 48×60 field grid | 64×80 / 32×40 | Headroom for low-end laptops at K=1; visually sufficient for antinode-line emphasis |
| K=1 dominant pitch (default) | Top-K peaks | Legibility on dense songs; K≤5 available as power-user toggle |
| Field layer: `composite='lighter'`, α≈0.18 | `'screen'`, `'overlay'` | Pure additive; predictable under varying field intensity; never darkens zones |
| Anatomical adjacency coupling | Euclidean Gaussian | Physically motivated; prevents larynx leaking into skull on pixel proximity |
| Articulation surface: strictly passive | Recommendation surface | System reports past observations; user leads exploration. Hard constraint. |
| Local SQLite offline pipeline | Browser-side IndexedDB | Zero browser dependency; privacy-preserving; matches journal-noticer stance |
| `evidence` field per zone mode | Implicit citation | Makes the epistemics inspectable; flags `phenomenological` for review |

---

## Docs index

| Document | What it covers |
|----------|---------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | All 12 modules, data flow, rendering pipeline |
| [`docs/INTERFERENCE_MODE_DESIGN.md`](docs/INTERFERENCE_MODE_DESIGN.md) | Two-source field design rationale, dual anti-resonance distinction |
| [`docs/AUDIO_PIPELINE_DESIGN.md`](docs/AUDIO_PIPELINE_DESIGN.md) | Web Audio architecture, YIN/MPM vs. FFT, privacy architecture |
| [`docs/ENGINE_ROADMAP.md`](docs/ENGINE_ROADMAP.md) | Canvas 2D → Three.js → UE5 capability tiers |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | Manual checks, automated suite, graph engine verification |
| [`docs/JOURNAL_NOTICER_DESIGN.md`](docs/JOURNAL_NOTICER_DESIGN.md) | Append-only aggregate design, holdout group, anti-recommendation discipline |
| [`docs/methodology/README.md`](docs/methodology/README.md) | Four-tier mapping classification, alignment metric |
| [`docs/methodology/assumptions.md`](docs/methodology/assumptions.md) | 12 active assumptions with falsification conditions |
| [`docs/methodology/active_ignorance_nodes.md`](docs/methodology/active_ignorance_nodes.md) | All 15 AINs, current status, blast radius |
| [`docs/methodology/isomorphic_mappings.md`](docs/methodology/isomorphic_mappings.md) | Cross-domain mappings with tier classification |
| [`tools/graph_engine/README.md`](tools/graph_engine/README.md) | Pipeline quick-start, discipline rules, PE v2.2 mapping |
| [`vibrational-system.md`](vibrational-system.md) | Mechanics + philosophy of vibration and resonance in the human body |
| [`essay-draft.md`](essay-draft.md) | Phenomenological essay on vocal resonance and the felt sense |

---

## Quick start

```bash
# Dev server (modular, HMR-friendly)
npm run serve            # or: python3 -m http.server 8080
#   main tuner:        /index.html
#   Release Principle: /pages/release_principle.html

# Pre-release verification
./tools/verify_all.sh    # JS, Release Principle harness, zone parity, DOM audit, graph smoke, §9 field tests, esbuild
node tools/physics_verify.js   # Release Principle falsification harness alone (15/15, exit 0)

# Portable single-file build
npm run build:dist       # writes dist/vocal_resonance.html (~87 KB, no server needed)

# Offline pipeline (after EXPORT SESSION in browser)
cd tools/graph_engine
python3 ingest.py path/to/sessions.jsonl
python3 homology.py
python3 neti_neti.py
python3 articulate.py    # → articulation.json; drop in repo root for browser enrichment

# Synthetic ML (reference implementation)
cd tools/synthetic_sessions
python3 generate.py -n 4000 --balance -o sessions_balanced.jsonl
python3 train.py --data sessions_balanced.jsonl
```

Dev hook: `window.__rs → { state, audio, zones }` — available in any console session.
