# Architecture

**Status:** SHIPPED (browser) · aligned with [README.md](../README.md) (the Critical Analysis & Refinement Roadmap — canonical source of truth)
**Implements:** `src/` · `index.html`
**See also:** [VERIFICATION.md](VERIFICATION.md) · [methodology/](methodology/) (AINs, assumptions, isomorphic mappings)

This document describes the physics model, rendering pipeline, module graph, and offline research stack. It is code-true for the modular browser app.

---

## 1. System overview

The application is a single-page browser app: **thirteen ES modules**, one CSS file, zero runtime npm dependencies. Modules load via `<script type="module">`. The animation loop runs at 60 fps on one Canvas 2D context.

```
                    ┌──────────────┐
                    │  index.html  │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │   main.js    │  state, loop, orchestration
                    └──┬───┬───┬───┘
         ┌─────────────┘   │   └──────────────┐
         ▼                 ▼                  ▼
   ┌──────────┐     ┌───────────┐      ┌──────────┐
   │ physics  │     │  field    │      │  audio   │
   │ views    │     │  breath   │      │ sessions │
   │ env      │     └─────┬─────┘      │articul.  │
   └────┬─────┘           │            └────┬─────┘
        │           ┌─────┴─────┐           │
        ▼           ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌────────┐ ┌──────┐
   │ anatomy │ │renderer │ │  ui    │ │ (DOM)│
   └─────────┘ └─────────┘ └────────┘ └──────┘
```

| Module | Owns |
|--------|------|
| `physics.js` | Zones, multi-modal modes, `zoneResponse`, adjacency coupling, spectral nulls, driver helpers |
| `field.js` | Two-source interference grid, `computeField`, `drawField`, `sampleField` |
| `audio.js` | File + mic → `AnalyserNode` → FFT peaks |
| `breath.js` | Breath envelope (synth / tap / mic RMS) |
| `views.js` | Five recognition stances (per-zone scale) |
| `env.js` | Environmental interference presets + floor lift |
| `sessions.js` | Opt-in session JSONL export |
| `articulation.js` | Optional `articulation.json` badge hints |
| `anatomy.js` | Silhouette, vagus, heart, vocal folds |
| `renderer.js` | Zones, aura, field layer hook, badge |
| `ui.js` | Controls, song panel, view strip, export |
| `main.js` | Canvas, state, animation loop |

Dependencies form a DAG: `physics` is the root; `main` is the sink. No circular imports.

---

## 2. Composed physics (three layers)

The abstractions are **orthogonal** — they multiply, they do not overwrite.

| Layer | Module | Role |
|-------|--------|------|
| **Zones** | `physics.js` | Lumped resonators: “what might this body part feel at these drives?” |
| **Field** | `field.js` | Continuous superposition when ≥2 sources: “where do waves meet?” |
| **Breath** | `breath.js` | Slow envelope on internal `amp`: “voice rides on exhale” |

`externalBalance → 0` and no external peaks → field is skipped (no-op). Zones still respond via `zoneResponse` alone.

---

## 3. Zone physics

Ten zones on a 1D frequency axis. Large cavities (chest, skull) may define `modes: [{ f, Q, evidence }, …]`; `zoneResponse` sums per-mode harmonic hits (AIN-RS-012).

### 3.1 Harmonic response

Per driver, per mode: scan harmonics h = 1…8 in **cents space**, Gaussian centered on mode frequency, best-of-harmonics with falloff `h^0.55`, multiply by `antiResonanceFactor(zone, drv.f)`, amplitude-weighted sum across drivers.

### 3.2 Inter-zone coupling (AIN-RS-002)

**Anatomical adjacency graph** in `physics.js` — not Euclidean canvas distance. Each edge names a pathway (`air`, `tissue`, `bone`) and weight. `applyCoupling` uses a precomputed symmetric matrix × `COUPLING_GAIN`.

### 3.3 Spectral nulls (α)

Geometric mean √(f₁·f₂) between adjacent zone pairs → narrow Gaussian suppression. UI: ◊ presets on the left rail. Distinct from the spatial nodes in §3.4 — see [README.md §3 AIN-RS-004](../README.md) for the two-kinds-of-anti-resonance discipline.

### 3.4 Spatial nodes (β)

When `field.js` is active, each zone samples `|field|` at `(nx, ny)` and gains up to ~35% extra target amplitude. Distinct from spectral nulls.

### 3.5 Temporal envelopes (AIN-RS-006, partial)

`zoneAmpsDyn[i]` low-passes toward steady-state target with per-zone `ZONE_TAU` derived from Q. Coupling applies to dynamic state, not raw target. **Not** full phase ODE — beats in zones come from field superposition, not per-zone phase accumulation.

### 3.6 View modes

`views.js` applies `zoneScale` and `globalScale` **after** `zoneResponse` — epistemic weighting, not separate physics. Modes: organs, flow, nerves, solid, em.

### 3.7 Environmental interference

`env.js` adds an `env` driver and optional broadband **floor** lift on all zone amplitudes after coupling.

---

## 4. Field layer (`field.js`)

- **Internal source:** larynx position (`INTERNAL_SRC_POS`).
- **External sources:** skull-top (`EXTERNAL_SRC_POS`) — *visualization geometry*, not anatomy (A-010, AIN-RS-013). UI tooltip in song panel.
- Grid default 48×60; wave sum `A₁ sin(k₁r₁ − ω₁t) + Σ A₂k sin(…)`; no 1/r falloff (stylization).
- Render: `globalCompositeOperation = 'lighter'`, body-mask clip, antinode threshold emphasis.
- Layer order: silhouette → aura → **field** → vagus → zones → spectral null visual → vocal folds.

Design rationale: [INTERFERENCE_MODE_DESIGN.md](INTERFERENCE_MODE_DESIGN.md).

---

## 5. Audio (`audio.js`)

| Input | Behavior |
|-------|----------|
| **File** | `MediaElementSource` → `AnalyserNode` (FFT 2048) → top-K peaks → `origin: 'external'` |
| **Mic** | `getUserMedia` (analysis constraints off) → dominant peak → updates internal driver `f` |

**As-built:** in-thread FFT peak extraction. **Staged upgrade:** YIN/MPM in AudioWorklet per [AUDIO_PIPELINE_DESIGN.md](AUDIO_PIPELINE_DESIGN.md).

Raw audio never leaves the device. Session export sends scalars only ([`sessions.js`](../src/sessions.js)).

---

## 6. Breath (`breath.js`)

Default: synthesized cosine envelope (3–8 s period). Optional: spacebar tap, mic RMS (breath mode). Modulates internal driver `amp`, vagus gain, aura, chest sway in silhouette.

---

## 7. Rendering pipeline (per frame)

1. Time: `dt`, `vt += dt × timeScale`.
2. Sweep internal `f` if enabled (disabled when mic drives frequency).
3. Breath envelope → internal `amp`.
4. Mic peaks or slider → internal `f`.
5. Audio file peaks → `externalDrivers` × `externalBalance`.
6. Assemble `allDrivers`: internal + pinned (MULTI) + external + env.
7. `computeField` if externals present and `fieldEnabled`.
8. Per-zone target: `zoneResponse` → `applyViewScale` → field gain → envelope update.
9. `applyCoupling` → `applyEnvFloor`.
10. Canvas fade → silhouette → aura → field → vagus → zones → anti-resonance → folds.
11. Sidebar bars, badge, optional articulation tooltip, session recorder sample.

---

## 8. State (`main.js`)

```javascript
const state = {
  drivers: [{ f, amp, phase, origin: 'internal' }],
  pinnedDrivers: [],
  externalDrivers: [],
  externalBalance: 0.7,
  fieldEnabled: true,
  viewMode: 'organs',
  envType: 'none',
  multiMode: false,
  zoneAmpsDyn: [...],
  timeScale, sweeping, sweepDir, t, vt, lastT,
  sessionRecorder, articulationDoc,
};
```

UI mutates `state` directly; no reactivity framework.

---

## 9. Known stylizations

1. **Spectral nulls** — Gaussian subtraction, not complex phase math.
2. **Zone frequencies** — phenomenological / pending citation (`evidence` on modes).
3. **Field** — 2D plane-wave-ish; skull-top external entry; perfect phase lock between sources.
4. **Vagus** — stylized coupling carrier, not nerve acoustics.
5. **Heart zone** — felt tissue near heart, not cardiac resonance (see zone `note`).
6. **Vocal folds** — visual flutter capped for legibility.
7. **Mic** — FFT peak, not YIN (octave errors possible in noise).

Full honesty is a product requirement. See [README.md §12.2](../README.md) (wave-physics honesty notes) and [methodology/active_ignorance_nodes.md](methodology/active_ignorance_nodes.md).

---

## 10. Performance

- Zone + coupling: sub-millisecond per frame.
- Field grid 48×60: ~0.15–0.35 ms (order of magnitude).
- Total frame budget: well under 16.6 ms on laptop-class hardware.

---

## 11. Offline research stack

Not in the browser bundle; part of the same project per README.

```
Browser EXPORT SESSION (JSONL)
        ├─► tools/graph_engine/ingest.py → homology → neti_neti → articulate.py → articulation.json
        ├─► tools/journal_noticer/noticer.py → journal/*.md
        └─► (optional) tools/synthetic_sessions/ — physics-matched synthetic labels
```

| Tool | Doc |
|------|-----|
| Graph engine | [../tools/graph_engine/README.md](../tools/graph_engine/README.md) |
| Synthetic sessions | [../tools/synthetic_sessions/README.md](../tools/synthetic_sessions/README.md) |
| Journal-noticer | [JOURNAL_NOTICER_DESIGN.md](JOURNAL_NOTICER_DESIGN.md) |

**Discipline:** no PII, no cloud by default, past-tense articulation only, no training on user behavior without exogenous truth.

---

## 12. Engine tier (staged, in-scope)

3D / volumetric / VR embodiment is **in project scope** as a staged capability map, not shipped in the browser. See [ENGINE_ROADMAP.md](ENGINE_ROADMAP.md). v2 ships Canvas 2D; UE5/Unity is the research-instrument tier when 3D does irreplaceable conceptual work.

---

## 13. Extension points

- **New zone:** extend `zones` in `physics.js`; `antiResonances` auto-derives pairs.
- **Coupling:** edit `adjacency` weights/topology.
- **Field:** tune grid size, threshold, source positions (keep A-010 disclaimer).
- **Articulation:** extend `articulate.py` schema; loader in `articulation.js`.
- **Keep `physics.py` in sync** with `tools/synthetic_sessions/physics.py`.

---

## 14. Build and deploy

- **Modular app:** serve over HTTP (`python3 -m http.server` or `npm start`). `file://` blocks ES modules.
- **`dist/vocal_resonance.html`:** portable bundle; **rebuild** after `src/` changes.
- Static hosting: GitHub Pages, any CDN — no server compute.

---

## 15. References

- Acoustic phonetics (Story, Titze — verify citations before publication).
- Coupled oscillators (Strogatz).
- Voice pedagogy (placement — Miller, Doscher).
- Methodology v1.2 / Presence Engine v2.2 — [methodology/README.md](methodology/README.md).

Physics and visualization code are original; parameters were tuned against singer phenomenology, not clinical measurement.
