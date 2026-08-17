# Assumptions Registry

Active assumptions in the Resonant Singer model. Each carries a status, the falsification condition that would invalidate it, and its blast radius (what depends on it).

Status legend: **ACTIVE** (in force, untested) · **REFINED** (sharpened from earlier form) · **FALSIFIED** (overturned by evidence) · **UNTESTED** (no path to test).

---

## A-001 — Phenomenological zone frequencies suffice

- **Statement:** Hand-tuned zone natural frequencies (chest 120 Hz, larynx 220 Hz, skull 520 Hz, etc.) are close enough to the perceptual experience of resonance that the visualization is informative.
- **Status:** ACTIVE
- **Falsification:** If multiple users with different vocal ranges report the visualization "doesn't match what I feel" at the same drive frequency, the frequencies are off, the per-individual variance is too large, or the felt-sense ground truth doesn't exist (in which case A-001 dissolves into AIN-RS-003).
- **Blast radius:** Every preset, every coupling pair, every anti-resonance notch. The entire badge state classification.
- **Reference:** AIN-RS-001 (zone frequencies unverified), AIN-RS-003 (no felt-sense ground truth).

## A-002 — Cents-space Gaussian is the right response shape

- **Statement:** A zone's response to a driver follows `exp(-(cents/bandwidth)^2)` in log-frequency space, with bandwidth = `Q × 600` cents.
- **Status:** ACTIVE
- **Falsification:** Sweep recordings showing real bandwidth scales differently with Q than the Gaussian-in-cents model predicts.
- **Blast radius:** `zoneResponse` in [src/physics.js](../../src/physics.js). All zone amplitudes.
- **Reference:** [src/physics.js:zoneResponse](../../src/physics.js).

## A-003 — Harmonic stack with h^0.55 falloff

- **Statement:** A driver contributes to a zone through harmonics h=1..8 with amplitude inversely proportional to `h^0.55`. This roughly matches the source-filter model's glottal pulse spectrum.
- **Status:** ACTIVE (refined from earlier 1/h falloff).
- **Falsification:** Measured glottal source spectra showing systematically different falloff (real source ≈ -12 dB/octave, exponent ~0.7 — currently within tolerance).
- **Blast radius:** Whether harmonic resonance at upper zones from a low driver is reasonable.
- **Reference:** [src/physics.js:zoneResponse](../../src/physics.js).

## A-004 — Anatomical adjacency approximates inter-zone coupling

- **Statement:** Inter-zone coupling follows a named adjacency graph (air / tissue / bone pathways) with subjective edge weights, not Euclidean canvas distance.
- **Status:** REFINED (replaced pixel-distance kernel per AIN-RS-002).
- **Falsification:** Empirical or simulation evidence that the chosen topology systematically mis-predicts which zones co-activate for a given drive.
- **Blast radius:** Whole-system resonance emergence, preset phenomenology.
- **Reference:** [src/physics.js:adjacency](../../src/physics.js), AIN-RS-002.

## A-005 — Anti-resonance notches at geometric-mean frequencies

- **Statement:** Between two coupled oscillators of frequencies f₁ and f₂, the transfer function has a zero (anti-resonance) near √(f₁·f₂).
- **Status:** ACTIVE — physically grounded for ideal coupled oscillators, applied here as Gaussian subtraction (not phase math).
- **Falsification:** A two-source interference simulation showing the actual cancellation frequency systematically differs from the geometric mean for the zone coupling topology used here.
- **Blast radius:** Four hand-picked notches; the ◊ buttons.
- **Reference:** [src/physics.js:antiResonances](../../src/physics.js), AIN-RS-004.

## A-006 — First-order envelopes suffice for temporal phenomenology

- **Statement:** Per-zone low-pass tracking toward steady-state `zoneResponse` targets (Q-dependent tau) is enough for buildup/decay visuals; full driven-damped ODE per mode is optional.
- **Status:** REFINED (partial — envelopes shipped; ODE deferred).
- **Falsification:** Users or verification show beats/buildup require per-zone phase state beyond field-layer superposition.
- **Blast radius:** Sweep feel, multi-driver beating, breath coupling.
- **Reference:** [src/main.js:zoneAmpsDyn](../../src/main.js), AIN-RS-006.

## A-007 — System badge thresholds reflect meaningful state transitions

- **Statement:** sysAmp > 0.55 with activeCount ≥ 5 represents qualitatively different state ("whole-system resonance") from sysAmp > 0.35 ("harmonic coupling").
- **Status:** ACTIVE — untested against phenomenology.
- **Falsification:** Users report no felt difference at the threshold crossings, or report differences at thresholds we haven't named.
- **Blast radius:** The badge classifier in [src/renderer.js:updateBadge](../../src/renderer.js).
- **Reference:** AIN-RS-003.

## A-008 — The heart zone reports thoracic-anterior tissue conduction

- **Statement (refined):** The "heart" zone at 105 Hz does NOT model heart-muscle resonance (the heart is a pump, not an acoustic resonator). It models the *felt* low-frequency vibration in the anterior thoracic wall *near* the heart, which is real tissue/bone conduction at chest-voice fundamentals.
- **Status:** REFINED (was implicit before; made explicit in v1 of these registries).
- **Falsification:** Subglottal F1 measurements showing this band is not actually tissue-conducted at the labeled frequency.
- **Blast radius:** The "♥ HEART · 105" preset and the heart-shape rendering.
- **Reference:** §12.6 of the refinement roadmap; AIN-RS-012.

## A-009 — Visual time is decorative, physical time is what matters for ML

- **Statement:** The `timeScale` knob (0.25× to 4×) scales visualization timing only. Physics is unchanged; ML feature extraction should use wall-clock time, not visual time.
- **Status:** ACTIVE.
- **Falsification:** N/A — this is a design choice, not an empirical claim. Documented to prevent future contributors from coupling them.
- **Blast radius:** Synthetic-session ML labels. Future real-session feature extraction.
- **Reference:** [src/main.js](../../src/main.js).

## A-010 — Source positions in the field model are visualization geometry, not anatomy

- **Statement:** Internal source at larynx is anatomically motivated. External source at skull-top is *visualization geometry for legible interference*, NOT how song reaches the body (air pressure at both ears).
- **Status:** REFINED — shipped with UI tooltip and [INTERFERENCE_MODE_DESIGN.md](../INTERFERENCE_MODE_DESIGN.md).
- **Falsification:** N/A — stated framing. Failure mode is users misreading the viz as measurement.
- **Blast radius:** `field.js`, song panel, documentation.
- **Reference:** [src/field.js](../../src/field.js), AIN-RS-013.

## A-011 — FFT peak tracking suffices for quiet hum (mic)

- **Statement:** Dominant-bin FFT peak on `AnalyserNode` (not YIN worklet) is adequate for monophonic hum in a quiet room.
- **Status:** ACTIVE.
- **Falsification:** Systematic octave errors or missed fundamentals in verification that YIN would fix without new privacy surface.
- **Blast radius:** Mic LISTEN path in [src/audio.js](../../src/audio.js).
- **Reference:** [AUDIO_PIPELINE_DESIGN.md](../AUDIO_PIPELINE_DESIGN.md).

## A-012 — Session export scalars are non-invertible

- **Statement:** Opt-in JSONL session features (frequencies, sysAmp, activeCount, ar flags) carry no reconstructable speech content.
- **Status:** ACTIVE.
- **Falsification:** Any addition of MFCC/mel/spectrogram uploads to aggregate pipelines.
- **Blast radius:** [src/sessions.js](../../src/sessions.js), journal-noticer, graph ingest.
- **Reference:** [JOURNAL_NOTICER_DESIGN.md](../JOURNAL_NOTICER_DESIGN.md).

---

## How to add an assumption

Use the same template above. The falsification condition is the most important field — an unfalsifiable assumption is metaphysics, not a model. If you can't write one, the claim isn't ready to enter the registry.
