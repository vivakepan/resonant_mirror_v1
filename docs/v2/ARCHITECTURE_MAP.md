# Resonant Mirror v2 — architecture map

The previous Resonant Singer coupled-oscillator prototype was removed from this
repository. Observation, analysis, and visualization now live entirely under `src/v2/`.

| Path | Role |
|---|---|
| `index.html` | Observation UI |
| `src/v2/audio/` | Independent microphone and reference pipelines |
| `src/v2/acoustic/` | Deterministic pitch, level, spectral features |
| `src/v2/resonance/` | Formant / spectral-envelope estimates |
| `src/v2/respiration/` | Inferred respiratory events; simulated anatomy drivers |
| `src/v2/registration/` | Chest / mixed / head pattern candidates |
| `src/v2/tension/` | Graded tension/strain evidence |
| `src/v2/anatomy/` | Evidence-backed physiology renderer |
| `src/v2/visualization/` | Provenance-tagged visual state |
| `src/v2/memory/` | Personal prototypes without weight updates |
| `ml/vocal_encoder/` | Offline encoder dataset and training loop |

The arithmetic `WHOLE-SYSTEM RESONANCE` badge and two-source interference field
are gone. Their contracts remain only as isolated `legacy_hypothesis` lockouts
so they cannot re-enter as physiology.
