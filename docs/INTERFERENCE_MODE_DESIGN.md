# Interference Mode — Design Document

**Status:** **SHIPPED** (Canvas 2D) · [README.md](../README.md)  
**Implements:** [`src/field.js`](../src/field.js), [`src/main.js`](../src/main.js), song panel in [`index.html`](../index.html)  
**Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md) · **3D tier:** [ENGINE_ROADMAP.md](ENGINE_ROADMAP.md) (STAGED)

This document is the *design rationale*. Behavior lives in code; update this file when the model changes.

---

## The idea in one sentence

Two wave sources meet inside the body — an **external** source (song peaks, visualized entering from skull-top) and an **internal** source (hum/slider, rising from the larynx) — and the interesting physics lives in their **overlap.**

---

## Why it completes the project

Single-source mode: one drive frequency, zones respond. The field layer adds a **second source** and spatial superposition — moving from *response* to *interference*. This visualizes:

- **Resonance** — sources excite shared zones; overlap brightens.
- **Non-resonance** — sources light different regions with little overlap.
- **Harmonizing** — simple frequency ratios → stable standing patterns (consonance).
- **Essay protocol** — Step Two (“being sung through”): song from outside, hum from inside, body as medium.

---

## Directionality (visualization choice)

- **Song** — skull-top (legibility of meeting region inside zone array).
- **Hum** — larynx (actual phonation source).

Counter-propagating waves produce standing patterns. **Honesty:** a song reaches both ears as air pressure; skull-top is not acoustics. See A-010, UI tooltip on song panel.

---

## Song input — decision (shipped)

| Option | Status |
|--------|--------|
| **(1) Dominant pitch** | **Default** — K=1, median-smoothed |
| **(2) Multi-peak** | **Shipped** — K up to 5, density-adaptive reduction |
| **(3) Full-spectrum field** | Not shipped — too muddy for legibility |

---

## Dual anti-resonance (do not conflate)

| Kind | Mechanism | Where |
|------|-----------|--------|
| **Spectral null (α)** | Geometric-mean notches in zone transfer | ◊ presets, `antiResonanceFactor` |
| **Spatial node (β)** | Field cancellation at grid points | `field.js` when externals active |

See [README.md §3 AIN-RS-004](../README.md) for the do-not-conflate discipline.

---

## Implementation map

| Design intent | Code |
|---------------|------|
| Internal source position | `INTERNAL_SRC_POS` in `field.js` |
| External source position | `EXTERNAL_SRC_POS` |
| Wave sum + grid | `computeField(internal, externalDrivers, vt)` |
| Zone sampling | `sampleField` in `main.js` loop |
| Toggle | `state.fieldEnabled`, FIELD button |
| Mix | `state.externalBalance` |
| No externals → no field | `hasInterference` guard in `main.js` |
| Render layer | `drawField` — lighter, clipped, thresholded |

---

## Grift-line caution (load-bearing)

The visualization shows what **the model** does given two frequency inputs — not how much a person “resonates with” a song in a mystical sense. Stronger rendering requires **stronger** disclaimers, not weaker ones.

---

## Verification

Load a sine WAV near chest frequency while internal slider sits on a harmonic — visible beat at difference frequency. See [VERIFICATION.md](VERIFICATION.md).

---

## Engine tier note

2D field proves the concept in-browser. **Volumetric nodal surfaces** and fly-through are STAGED in [ENGINE_ROADMAP.md](ENGINE_ROADMAP.md) — in project scope, not a rejection of 3D.
