# Resonant Mirror v2 — Repository architecture map

**Phase:** 0  
**Status:** Audit of the imported Resonant Singer prototype against the v2 specification.  
**Rule:** This map describes what exists and how it is classified. It does not convert legacy heuristics into physiological facts.

The v2 product contract is `RESONANT_MIRROR_V2_CURSOR_IMPLEMENTATION_SPEC.md`. If this map and the specification differ, the specification wins.

---

## 1. Imported prototype layout

The previous Resonant Singer browser prototype was copied into this repository as the v2 foundation. The historical prototype README is archived at `docs/legacy/README.md`.

| Path | Role | v2 classification |
|---|---|---|
| `index.html` | Legacy visual tuner page | Preserved. Not the v2 observation UI. |
| `src/physics.js` | Coupled-oscillator zone model | **Legacy hypothesis.** Optional exploratory layer. MUST NOT generate physiological claims. |
| `src/field.js` | Two-source interference grid | **Legacy / simulated visualization geometry.** Skull-top external source is artistic, not anatomy. |
| `src/audio.js` | Shared `AnalyserNode` for file *or* mic | **Superseded for v2 dual input.** Legacy path disconnects mic when a file loads. v2 uses independent pipelines. |
| `src/breath.js` | Synth / tap / mic-RMS breath envelope | **Simulated** (synth/tap) or crude **inferred** RMS proxy (mic). Not a validated inhale/exhale detector. |
| `src/anatomy.js` | Silhouette, vagus, heart, folds | **Simulated** drawing. v2 adds a more complete structure set with evidence tags. |
| `src/renderer.js` | Zone glow, aura, `WHOLE-SYSTEM RESONANCE` badge | Badge threshold is **legacy hypothesis** (`sysAmp > 0.55` and 5+ zones). Isolated from v2 physiology. |
| `src/ui.js` | Controls, song panel, export | Preserved for the legacy page. |
| `src/views.js` | Organs / flow / nerves / solid / EM scales | Epistemic visualization weights, not physics. |
| `src/env.js` | Environmental interference presets | Exploratory drivers. |
| `src/sessions.js` | Opt-in JSONL export of scalars | Preserved. Compatible with `tools/graph_engine`. v2 adds provenance-rich frames beside it. |
| `src/articulation.js` | Badge tooltip copy | Legacy copy. |
| `src/notices.js` | Sparse notice engine | Legacy. |
| `src/register_dynamics.js` | Release Principle sandbox physics | **Exploratory artifact.** Thresholds MUST NOT drive v2 feedback. |
| `src/main.js` | 60 fps orchestration | Preserved for the legacy page. |
| `pages/release_principle.html` | Register-transition sandbox | Isolated exploratory page (REQ-095). |
| `pages/emergent_register.html` | Additional sandbox | Isolated. |
| `tools/verify_all.sh` | Pre-release verification | MUST keep passing (REQ-094). |
| `tools/physics_verify.js` | Release Principle falsification | Isolated to that sandbox. |
| `tools/graph_engine/` | Offline SQLite analysis | Preserved local pipeline (REQ-074). |
| `tools/synthetic_sessions/` | Numpy synthetic ML reference | Reference only. Not the v2 encoder. |
| `dist/vocal_resonance.html` | Portable legacy bundle | Archived build product. |

---

## 2. Mapping to v2 requirements

| Spec area | Existing module | v2 owner | Evidence class |
|---|---|---|---|
| Microphone capture | `src/audio.js` `startMic` | `src/v2/audio/dualPipeline.js` | `measured` samples |
| Uploaded song | `src/audio.js` `load` | `src/v2/audio/dualPipeline.js` (independent analyser) | `measured` samples |
| Shared timeline | none (wall clock + visual time) | `src/v2/contracts/clock.js` | derived timestamps |
| Pitch | FFT dominant peak | `src/v2/acoustic/pitch.js` (YIN + MPM) | `derived` |
| Level / decibels | unused / RMS in breath only | `src/v2/acoustic/level.js` (dBFS) | `derived` |
| Spectral features | Analyser FFT bytes | `src/v2/acoustic/spectral.js` | `derived` |
| Formants | none | `src/v2/resonance/formants.js` | `derived` or `unknown` |
| Anatomy | silhouette | `src/v2/anatomy/structures.js` + renderer | `simulated` motion |
| Respiration | synth envelope | `src/v2/respiration/` | `inferred`, research-gated |
| Registration | Release Principle sandbox | `src/v2/registration/` | `inferred` / `unknown` |
| Tension | none | `src/v2/tension/` | `inferred` |
| Aura | `drawSystemAura(sysAmp)` | `src/v2/visualization/aura.js` | coherence vs energy remain distinct |
| Personal memory | session JSONL | `src/v2/memory/` | `personal_inference` / `human_labeled` |
| Learned encoder | numpy synthetic MLP | `ml/vocal_encoder/` | `inferred`, versioned |
| Visual provenance | none | `src/v2/visualization/mirrorState.js` | required on every semantic visual |
| Whole-system badge | `updateBadge` | remains legacy-only | `legacy_hypothesis` |

---

## 3. Dual-input defect in the imported prototype

`AudioEngine` uses **one** `AnalyserNode`. `load()` calls `_disconnectMic()`, so microphone and uploaded song cannot be analyzed at the same time. v2 Phase 1 replaces this with two independent feature pipelines that share only a logical clock.

---

## 4. Capture-settings provenance

Existing microphone constraints already request:

- `echoCancellation: false`
- `noiseSuppression: false`
- `autoGainControl: false`

These are recorded in session metadata. They are **not** assumed scientifically optimal (REQ-097). They remain configurable.

---

## 5. Isolated exploratory artifacts

The following MAY remain visible as research sandboxes and MUST remain labeled as such:

- coupled-oscillator zone frequencies and Q values;
- two-source interference field with skull-top external geometry;
- spectral-null presets;
- `WHOLE-SYSTEM RESONANCE` arithmetic badge;
- Release Principle register thresholds.

None of these may feed v2 inferred physiology, training labels, or coaching.

---

## 6. v2 module graph (target)

```text
microphone ──► DualPipeline.user     ──► AcousticAnalyzer ──► VocalFrame (source=user)
reference  ──► DualPipeline.reference──► AcousticAnalyzer ──► VocalFrame (source=reference)
                                              │
                                              ▼
                                        ResonanceAnalyzer
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
           RespirationEstimator     RegistrationEstimator      TensionEstimator
                    │                         │                         │
                    └────────────► MirrorStateEngine ◄──────────────────┘
                                        │
                                        ▼
                              deterministic Renderer
```

The renderer does not invent physiological state.
