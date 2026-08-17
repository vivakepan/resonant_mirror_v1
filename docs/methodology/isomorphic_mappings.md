# Isomorphic Mappings Registry

Cross-domain structural mappings imported into the Resonant Singer model. Each mapping is classified by quality (SURFACE ANALOGY / HOMOLOGY / FUNCTORIAL / ISOMORPHISM) and names the *invariant* it preserves. Without a named invariant, a mapping is SURFACE ANALOGY and should not be load-bearing.

The four-tier framework is from the parent methodology document (Methodology v1.2 §2.4 step 3). See [README.md](README.md) for what each tier means.

---

## IM-001 — Helmholtz resonator network → coupled zone array

- **Source domain:** Networks of Helmholtz resonators (acoustic cavities connected by tubes; each cavity has a single natural frequency determined by volume + neck geometry).
- **Target domain:** The 10-zone resonance model.
- **Tier:** **HOMOLOGY**
- **Invariant preserved:** Linear coupled-oscillator response math — second-order driven response with resonant peak and bandwidth determined by Q. Mode-splitting near degenerate frequencies.
- **What transfers:** Coupling produces eigenmode splitting; sub-threshold excitation in one resonator biases neighbors; total system response is not the sum of isolated responses.
- **What does NOT transfer:** Real Helmholtz cavities have specific geometric formulas (`f = (c/2π)√(A/VL)`) — the Resonant Singer zone frequencies are phenomenological, not geometrically derived.
- **Predictive track record:** Confirmed for "subtle tuning" state (the case where sub-threshold zones bias their neighbors). Untested against measured cavity geometries.
- **Reference:** [src/physics.js:applyCoupling](../../src/physics.js).

## IM-002 — Two-source water-wave interference → field-layer visualization

- **Source domain:** Surface waves in a ripple tank with two coherent point sources. Classical superposition produces nodal lines, antinodes, and beat patterns.
- **Target domain:** The §5a interference field (internal source at larynx, external source at skull-top).
- **Tier:** **FUNCTORIAL**
- **Invariant preserved:** The entire superposition algebra. Two sinusoidal sources at the same frequency produce static node/antinode geometry; close-but-different frequencies produce beating envelopes at the difference frequency.
- **What transfers:** Compositional structure — `A_total = A_1·f_1(r_1, t) + A_2·f_2(r_2, t)`. All inferences about interference geometry, beats, and standing patterns apply directly.
- **What does NOT transfer:** The physical context. A song reaching a body via air pressure does not arrive at a single skull-top point. The source geometry is *visualization choice*, not acoustic claim (AIN-RS-013).
- **Predictive track record:** **SHIPPED** in `field.js`. Verification: sine WAV + internal harmonic → beat pattern ([VERIFICATION.md](../VERIFICATION.md)).
- **Reference:** [INTERFERENCE_MODE_DESIGN.md](../INTERFERENCE_MODE_DESIGN.md), [src/field.js](../../src/field.js).

## IM-003 — Vocal tract acoustic tube model → zone formant frequencies

- **Source domain:** Story et al. and successors — quarter-wave open/closed tube acoustic models of the vocal tract producing formant frequencies F1, F2, F3, etc.
- **Target domain:** Zone natural frequencies for pharynx, mouth, nasal cavities.
- **Tier:** **HOMOLOGY**
- **Invariant preserved:** Formant frequencies fall in measurable ranges (F1 ~ 200–900 Hz, F2 ~ 800–2500 Hz, F3 ~ 2200–3500 Hz) and shift predictably with tract shape.
- **What transfers:** Approximate ranges for cavity-mode frequencies.
- **What does NOT transfer:** The Resonant Singer's zones don't model tract shape changes; the frequencies are static. Vowel-to-vowel formant migration is absent.
- **Predictive track record:** Provides external grounding for AIN-RS-001 partial resolution and AIN-RS-012 citation discipline.
- **Reference:** Will be load-bearing once §12.6 multi-modal zones cite specific formant ranges.

## IM-004 — Driven damped harmonic oscillator → per-zone ODE

- **Source domain:** Classical mechanics — `ẍ + 2γẋ + ω₀²x = F(t)`. Drive at resonance: amplitude builds over Q/ω₀ time. Drive off-resonance: transient die-down to forced response.
- **Target domain:** Per-zone state after the AIN-RS-006 refactor.
- **Tier:** **HOMOLOGY** (envelope partial; full ODE staged).
- **Invariant preserved:** Buildup time, decay time toward steady-state response.
- **What transfers:** Monotonic rise/plateau on sustained preset; decay on release.
- **What does NOT transfer:** Full phase-lock and inter-driver beats in zones (field layer handles beats).
- **Predictive track record:** Confirmed for envelope; ODE promotion optional.
- **Reference:** [src/main.js](../../src/main.js), AIN-RS-006.

## IM-005 — Standing waves on a string → zone phase-lock under sustained drive

- **Source domain:** A string fixed at both ends with a driver at a harmonic of its fundamental locks into a standing-wave pattern with stable nodes.
- **Target domain:** Zone behavior when the driver lands precisely on a harmonic of its natural frequency.
- **Tier:** **HOMOLOGY**
- **Invariant preserved:** Existence of phase-lock and amplitude maximum at integer harmonic ratios.
- **What transfers:** Predicts that zones lock cleanly when driveF is exactly h×zone.freq, with cleanness degrading as h grows (this is the `h^0.55` falloff).
- **What does NOT transfer:** Real zone "strings" are not strings — they're cavities with end conditions that are soft (not fixed). Decay of higher harmonics is faster than the string model suggests.
- **Predictive track record:** Confirmed visually — preset frequencies that hit integer ratios produce visibly cleaner zone activations.
- **Reference:** [src/physics.js:zoneResponse](../../src/physics.js).

## IM-006 — LLM "obligatory closure" → badge declaring resonance without warrant

- **Source domain:** PresenceEngine v2.2 §1 — current LLMs are architecturally rewarded for resolving unknowns into probable known things as rapidly as possible (the obligatory closure pathology).
- **Target domain:** The badge classifier that fires WHOLE-SYSTEM RESONANCE on simple threshold crossings.
- **Tier:** **FUNCTORIAL**
- **Invariant preserved:** Deferred-closure discipline — recognition statements should be accompanied by *revealed openings* (what's still not known), not just outputs.
- **What transfers:** The Presence Engine L2 "presence filter" structure (seven-step deferral pass) and L3 articulation layer (recognition + revealed opening). Applies directly to how the badge expresses system state.
- **What does NOT transfer:** Resonant Singer is a much smaller, bounded domain than LLM reasoning. We don't need the full topos-theoretic machinery — just the discipline.
- **Predictive track record:** **PARTIAL** — `articulate.py` + optional `articulation.json` loader; badge tooltip only, passive.
- **Reference:** [tools/graph_engine/articulate.py](../../tools/graph_engine/articulate.py), [src/articulation.js](../../src/articulation.js).

## IM-007 — Active Inference (Friston) → breath-modulated attention to resonance band

- **Source domain:** Free-energy principle — biological systems minimize surprise by selecting actions that bring sensory input toward prediction. Breath is one of the few autonomic processes that's both observable and voluntarily modulable, making it a natural locus for attentional regulation.
- **Target domain:** Breath layer (§5b) modulating internal source amplitude and vagus-particle flow.
- **Tier:** **SURFACE ANALOGY → HOMOLOGY candidate**
- **Invariant preserved (candidate):** Mutual modulation between voluntary motor (breath rhythm) and involuntary autonomic state (vagal tone). Currently uncommitted — need to name the specific invariant before promoting from SURFACE.
- **What transfers (if promoted):** Breath modulation as a coupling variable between the willed (vocalization) and unwilled (autonomic state) — captures the contemplative-practice phenomenology more honestly than amplitude alone.
- **What does NOT transfer:** Resonant Singer does not implement a generative model or prediction-error minimization. The Active Inference framework is *metaphor* here, not machinery.
- **Predictive track record:** N/A.
- **Status:** Held as candidate — do not let this mapping do load-bearing work in code until a specific invariant is named.

---

## How to add a mapping

A new mapping cannot be added without:

1. **Source domain** — what other system are we importing from?
2. **Target domain** — where in this project does it land?
3. **Tier** — SURFACE / HOMOLOGY / FUNCTORIAL / ISOMORPHISM.
4. **Invariant** — the specific mathematical structure preserved. If you can't name it, it's SURFACE.
5. **What does NOT transfer** — the limit of the mapping. Often more important than what does.
6. **Predictive track record** — pending / confirmed / disconfirmed for any predictions the mapping has yielded.

Mappings ratchet up in tier as predictions accumulate. They never silently become more authoritative; tier promotion is an explicit decision logged here.
