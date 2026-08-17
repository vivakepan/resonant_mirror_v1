# VR / Headset Embodiment — Handoff Document

**Status:** PROPOSED — parallel track, not yet started
**Date:** 2026-07-14
**Author:** planning session (Claude) with Vivake Pandey
**Purpose:** A cold-startable brief for a **dedicated, separate chat** that builds a VR/headset
version of the Resonant Singer simulation *in lockstep* with the browser (HTML/Canvas) version —
without contaminating higher-priority work on the shipped web artifact.

> **Read this first if you are a fresh session with no prior context.** You do not need the
> conversation that produced this doc. Everything load-bearing is here or cross-referenced.
> Cross-refs: [`ENGINE_ROADMAP.md`](ENGINE_ROADMAP.md) (the *why/when* of engine graduation and the
> capability tiers), [`ARCHITECTURE.md`](ARCHITECTURE.md) (the shipped browser architecture),
> [`methodology/active_ignorance_nodes.md`](methodology/active_ignorance_nodes.md) (the honesty
> ledger), and the Phase 0 plan for the Release Principle physics core.

---

## 0. Why this document exists (the working agreement)

The project owner wants to develop **two simulations in parallel**:

1. **The browser sim** (this repo, shipped) — vanilla JS + Canvas 2D, one-click shareable, falsified
   by a Node harness. This remains the **front door** and the **higher-priority track**.
2. **A VR/headset sim** (new, separate chat) — an immersive, embodied version whose hypothesis is
   that *the medium of VR may be far more profound for teaching students and helping vocal coaches*
   than any screen can be.

**The discipline being adopted, deliberately:**

- Each development step of the browser sim has a **corresponding step** in the VR chat. Development
  in one medium is expected to **surface insight the other missed** — that cross-pollination is the
  *primary* stated value, above shipping the VR build itself.
- The owner accepts this is **slower, possibly double effort, with no guarantee the VR version even
  works.** That is an accepted cost. The goals are: (a) learn the technology the owner has always
  wanted to learn, in a context that finally motivates it; (b) let two representations of the same
  physics discipline patience and reveal blind spots.
- This doc is the **container** so the VR track can live in its own chat and its own branch without
  leaking into, or being starved by, the browser roadmap.

**What the fresh VR chat should NOT assume:** that speed matters, that the VR build must ship, or
that it may cut the honesty/constraint discipline for immersion's sake. The opposite is true (see §5).

---

## 1. The one non-negotiable architectural rule

**The falsifiable physics core is engine-agnostic and is the single source of truth. No renderer —
browser, Three.js, or Unreal — ever owns the physics.**

The repo already lives this rule twice:

- `src/physics.js` (JS core) is mirrored by `tools/synthetic_sessions/physics.py` (Python), and a
  **parity check** in `tools/verify_all.sh` fails the build if they drift.
- `tools/physics_verify.js` (the falsification harness) **imports** the shipped constants from
  `src/physics.js` rather than re-declaring them — zero-drift by construction.

The VR track extends the *same* pattern to a third language (C++ inside Unreal). It does **not**
invent new physics. Concretely:

```
        ┌─────────────────────────────────────────────┐
        │  CANONICAL PHYSICS CORE  (pure, no renderer) │
        │  register dynamics · beat · SOVT · zones     │
        └───────────────┬───────────────┬─────────────┘
                        │               │
             emits GOLDEN VECTORS  (reference trajectories, JSON)
                        │               │
        ┌───────────────▼──┐        ┌───▼──────────────────┐
        │ JS core (browser)│        │ C++ core (Unreal)    │
        │ asserts == golden│        │ asserts == golden    │
        └──────────────────┘        └──────────────────────┘
```

**Golden-vector cross-validation** is how two languages stay honest: the canonical core emits
reference trajectories (input sequence → state/amplitude timeseries) as JSON; *both* the JS and the
C++ ports assert bit-tolerant agreement against them. When the physics changes, you regenerate the
golden vectors once and both ports must still pass. This is the C1-safety and no-drift guarantee
carried into UE5.

**Corollary:** do not write the register/beat/SOVT dynamics in Blueprints or bury them in a UE5
Actor tick where the harness cannot reach them. Keep them in a plain C++ module (or a UE5 plugin
with no engine dependencies) that a headless test target can run. That is the UE5 analogue of "the
view's DOM stays in the page, the physics stays pure."

---

## 2. What the physics actually is (recap for the cold reader)

The current browser physics has two layers:

1. **Spectral resonance (shipped, memoryless):** 10 anatomical zones with `modes[]`, anatomical
   adjacency coupling, anti-resonance notches. `zoneResponse(zone, drivers)` maps frequency →
   amplitude. This *does* transfer energy across an adjacency graph. See `src/physics.js`.

2. **The Release Principle register layer (Phase 0, shipped as prescribed rules):** hysteresis,
   crossing-by-subtraction, beat-lock, and SOVT back-pressure. **Important honesty note:** in the
   Phase 0 browser build these are **hardwired** — a two-threshold state machine plus analytic
   formulas chosen to *encode* the theory, not to *emerge* from dynamics. The beat rate `|f1−f2|`
   is the one piece grounded in real acoustics; the rest are illustrative (see AIN-RS-016).

### The emergent upgrade (the interesting target for BOTH tracks)

The agreed next modeling step — for the browser first, then mirrored in VR — replaces the state
machine with **two coupled Stuart–Landau oscillators** (complex amplitudes `A_c` = chest-dominant
mode, `A_h` = head-dominant mode):

```
dA_c/dt = (μ_c(f, effort) + i·ω_c)·A_c − (|A_c|² + β·|A_h|²)·A_c
dA_h/dt = (μ_h(f, effort) + i·ω_h)·A_h − (|A_h|² + β·|A_c|²)·A_h
```

- `β > 1` → cross-saturation → winner-take-all competition → **bistable coexistence** over a band.
- **Register = which limit cycle is active** — an *observable*, not a stored label.
- **Hysteresis** emerges from the saddle-node folds (jump-up freq ≠ jump-down freq).
- **Crossing-by-subtraction** emerges: effort suppresses `μ_h`; releasing effort lets `μ_h` cross
  zero, the chest cycle *loses stability*, the trajectory falls into head. Subtraction, not push.
- **Beat/lock** emerges from superposition + entrainment (Arnold-tongue phase-locking near unison),
  replacing the hardwired `LOCK_EPS` cutoff.
- **SOVT** becomes a real acoustic-load term that raises effective growth rate (lowers threshold).

Integrate the *slow envelope* (averaged/complex-amplitude) form with RK4 or exponential-Euler at a
sub-audio step (~2 kHz, a few substeps/frame). It is ~30 lines of math and runs anywhere; **it does
not need a game engine.** The engine is for embodiment and audio, not for the ODE.

The falsification harness for the emergent model tests *bifurcation properties* by measurement:
sweep up/down and confirm jump frequencies differ; get stuck at high effort, lower it, confirm the
chest cycle destabilizes; confirm phase-lock near unison; confirm occlusion lowers the sustain
threshold. These golden-vector tests are what the C++ port must also satisfy.

---

## 3. Why VR could be more than "the browser sim, but 3D"

Stated as a **hypothesis to be tested**, not a claim (register as AIN-VR-001, §7). The capabilities
that are *only* reachable in an immersive medium, and that plausibly do real conceptual/pedagogical
work:

| Capability | UE5 system | Why it may teach better than a screen |
|---|---|---|
| **Hear the register break emerge** | **MetaSounds** — synthesize `A_c`/`A_h` output in real time | You don't *read* "HEAD" on a label; the timbre audibly reorganizes as the bifurcation fires. |
| **Walk through a spatial interference node** | **Niagara** volumetric field + spatialized audio | Step into a nodal surface and the sound genuinely nulls in your ears — superposition felt, not drawn. |
| **Inhabit the resonating body** | MetaHuman + first-person camera | Chest vs. cranium loading becomes a *place you are inside of*, not a glow on a silhouette. |
| **Binaural placement** | UE5 spatial audio | Crown-source vs. sternum-source rendered to each ear — the closest a device gets to the felt, body-located sensation. |
| **Haptics (optional, late)** | Controller / vest | Seen + heard + felt resonance, closing the loop — the deepest and most oversell-prone capability. |

These map onto Capabilities 3–5 in [`ENGINE_ROADMAP.md`](ENGINE_ROADMAP.md#capability-tiers); this
doc adds the *execution and constraint discipline* the roadmap left open.

---

## 3½. The guiding scene — sensory-void embodiment

*This is the concrete image the VR track is reaching for. It is captured here so the fresh chat
inherits the **honest** version of it, not the seductive one. Every evocative element below is
paired with the constraint that keeps it from becoming a mysticism machine or a biofeedback meter.
Read this together with §5 (constraints) — they are two halves of one design.*

### The scene

A **void** — no floor, no horizon, no external reference (a sensory-deprivation tank in spatial
form). Stripping external sensory noise so attention goes inward *is the practice protocol rendered
as an environment.* Inside it, the singer's body becomes a **luminous instrument**: resonance
rendered as colored emission from anatomically-placed sources (chest, larynx, pharynx, skull…), a
**skeleton toggleable through transparent skin**, bone that shivers with the modeled response.

### The one ontological rule that makes it safe (repeat of §2, applied here)

**The colors and the shivering bone are the MODEL's output, not a measurement of the singer's body.**
The *locations* are the ten anatomically-labeled modeled zones; the *brightness* is `zoneResponse`
driven by pitch + effort + occlusion inputs. The only honest claim is *"this is where the model
concentrates response for these inputs,"* never *"this is where your resonance actually is."* A
glowing photoreal ribcage **implies measurement** — so the disclaimer must get *louder* as the
render gets prettier, not quieter (C6/C7). Hold this and the whole scene is defensible; drop it and
it becomes a chakra machine.

### The visual system (with units — C5)

- **Hue ↔ frequency (Hz).** Deep red at low chest modes, migrating up through the spectrum to violet
  at skull/head. This *teaches the passaggio directly:* as pitch climbs, the glow migrates upward
  through the body — the register handoff seen as a color-and-location event, not just heard.
- **Luminance / saturation ↔ modeled amplitude** (dimensionless 0–1, labeled as a model output).
- **Anti-resonance node ↔ a literal dark void** in the light (the `◊ spatial node`), which in VR you
  can walk *around*.
- **Skeleton + bone vibration — honest because bone conduction is real** and the repo's coupling
  graph already has bone edges. Vibration amplitude ↔ modeled response *propagated along the
  adjacency graph* to that bone. Skull plates shimmer when head register loads; sternum/ribs judder
  on a chest note. **"Tension / effort / force" is an INPUT the singer sets (sandbox), not a quantity
  measured off their body.** If effort is ever inferred from a mic, that is a measurement claim the
  model cannot back — flag it (AIN-VR series), do not ship it quietly.
- **Audio (MetaSounds):** timbre audibly reorganizes as the register bifurcates; binaural places the
  chest source at the sternum, the head source at the crown; the interference null is *heard* to dim
  as you step into it.

### The pedagogy — "extreme responses to inefficient technique," done honestly

The naive ask ("detect the student's mistake and punish it with an extreme in-game response") breaks
three constraints at once: it must **define "correct"** (violates C2 descriptive-not-prescriptive
and C6 no-clinical-claim), **measure the student live** (violates C7 model-vs-measurement and C1
sing-then-look), and **dramatize a verdict** (the gamification *Never* item). The reframe keeps every
bit of the intended power:

> **Do not script a "you're wrong" response. Let the physics itself become unstable at inefficient
> configurations, and let the student summon that instability *on purpose* to learn what it looks
> like.**

This is *stronger* than the naive version, because the emergent Stuart–Landau model (§2) is genuinely
unstable near its folds. The "extreme response" is then **earned by the dynamics, not authored by a
referee** — which is exactly why it satisfies C2 (no score, no verdict) while delivering the felt
lesson. The goal becomes *"here is what inefficiency looks like in a body — make it happen, then make
it stop,"* and the student builds a felt vocabulary and **graduates** (C3), instead of chasing a
scoreboard.

**A vocabulary of summonable model behaviors** (the singer chooses each; the drama is the lesson,
never a judgment of them):

- **Pushing the passaggio** — high effort + drive climbing to the break: barrier flares, chest zone
  clips and reddens, sound strains and *damps* (netDamping: more work, less sound), skeleton
  judders. Then *release effort, drive unchanged* → glow leaps to the skull, tone opens. The Release
  Principle, felt.
- **Fragmented register (the crack)** — sit in the bistable zone and waver effort: the two modes
  flicker, color strobes red↔violet, bone vibration goes chaotic. A crack, slowed and made visible.
- **Breath collapse / no support** — low occlusion + high effort: the field can't sustain, the glow
  gutters like a low flame; add occlusion (SOVT) and it steadies. *Why straw-phonation helps*, seen.
- **Over-pressing (loud-but-dead)** — max drive + max effort: bright but strained, and audibly
  *smaller* than the released version at the same pitch.

None say "wrong." They are weather the singer summons and dispels.

### Three modes that keep the scene C1-safe

- **SANDBOX (primary, no mic)** — the singer drives the model with controllers, summons the behaviors
  above, inhabits the field. Zero C1 issue, zero measurement claim. ~90% of the learning lives here.
- **CONTRAST** — two bodies side by side, efficient vs. inefficient at the same pitch; difference made
  spatial, no judgment of the singer.
- **REVIEW / REPLAY** — the singer sings **first** (eyes closed, in the dark tank, attending to
  sound); *then* the field blooms as a **past-tense** replay of the model's response to the recorded
  pitch. This delivers "my voice drove this" **without** live look-while-singing, matching the
  `src/notices.js` past-tense discipline.

A **live "sing and watch it bloom in real time"** mode is the one thing to **defer, possibly
forever** — it is the direct C1 violation and the slope toward the biofeedback meter the project
refuses to be. The tank aesthetic *helps* here: sing in the dark, let the afterglow arrive.

### Why this is the real payoff

The migrating-color-through-anatomy view of the passaggio, and *summonable instability* as a teaching
object, are things no screen and no mirror can give a student at home. A teacher can *say* "you're
pushing"; this lets the student *make pushing happen in a visible body and then feel it stop* — and
it survives every constraint precisely because it teaches a **model** vividly instead of **judging a
person** covertly. That distinction is the whole difference between this project and a grift.

### Humming as the core primitive — and "effort shrinks reach"

The single most valuable thing this environment can teach is an *inversion beginners cannot feel*:
**efficient resonance travels farther than effortful force.** Crucially, this is not an animation
to fake — it is a **measured output of the emergent core** (`src/register_dynamics.js`, verified by
`tools/dynamics_verify.js`). At the same pitch, `outputGain` falls from **1.0 at effort=0 to 0.28 at
effort=1.0** (more work, *less* sound), and the released/resonant state carries several times the
amplitude of the pushed one. So the following visualization renders real model behavior, not mysticism:

- **Humming emits pulsating color waves from the head/mask out into the void.** Amplitude of the
  waves ↔ modeled output (labeled), hue ↔ frequency (Hz). A **quiet, resonant, mixed-voice hum sends
  waves rippling far out into the space; an effortful brute-force push at the same pitch chokes into
  a tight, strained knot that barely leaves the body.** The student *sees* effort shrink reach.
- **Practice both near-silently and loudly.** The quiet end is not a limitation — it is a **C1 win**:
  a near-silent hum lets the student attend to the felt buzz and *then* look at the afterglow, which
  is sing-then-look almost for free. Loud/quiet contrast maps directly to amplitude, so "a quiet
  resonant hum fills more room than a loud pushed one" becomes a spatial fact you can walk around.

**Why humming, specifically, is the ideal primitive:**
- The `/m/` closure *is* semi-occlusion (SOVT), so humming naturally engages the occlusion term the
  core already rewards — it is the safest, lowest-stakes way to explore resonance.
- It is quiet by nature → the least C1-fraught practice mode → the best on-ramp for a total beginner.
- It isolates resonance from articulation, which is exactly what a first-time singer needs.

### The uniqueness of every voice — archetypes, not measurements (the C4 edge)

The wish to let students and teachers *see how deeper / thinner / nasal / chest-only voices differ*
is powerful and real — and it runs straight into **C4 (anatomy is locked; a user may not slide their
own skull/tract as if it were measured)** and **C7 (model ≠ measurement)**. The honest resolution:

- Ship a small set of **labeled voice *archetypes*** — "a deeper-voiced body," "a lighter-voiced
  body," "a nasal-dominant body," "a chest-dominant body" — that the student can **inhabit and
  compare** to build intuition about voice-type. These are **illustrations to explore, never a claim
  about the student's own body.** (They are the VR analogue of the shipped `src/views.js` stances.)
- This gives beginners the intuitive map that keeps so many from ever finding their potential —
  *without* smuggling a measurement claim.
- **Calibrating to the student's actual voice type is a Phase-1 enrollment question, not a slider.**
  When it comes it must be measurement-honest (register as an AIN-VR node; cross-ref the browser
  enrollment AINs). Until then: archetypes only.

**Hard guardrail:** "catch the nuances of every voice" must stay *descriptive exploration of
archetypes*, never **live scoring of the student's own voice**. The instant it grades the user, it
has become the biofeedback meter the project exists to refuse (C1/C2, and the vagal-meter *Never*
item).

**Honesty note:** that VR teaches this inversion *better than a screen does* remains **unproven**
(AIN-VR-001). The hypothesis is strong — effort/efficiency inversion is precisely what words and 2D
fail to convey — but the effort spent building VR is not evidence that it works.

---

## 4. The UE5 stack, concretely (for someone learning it)

The owner has not built in UE5 before; this is a first-time-learning context. Orientation, no
invented links — consult Epic's official documentation for each named system:

- **Engine:** Unreal Engine 5 (current LTS). C++ + Blueprints. Expect a multi-GB install and a real
  learning curve. Blueprints for wiring/UI; **C++ for the physics core and any test target.**
- **VR/XR:** UE5 targets headsets via **OpenXR** (vendor-agnostic — Quest, Index, etc.). Decide the
  target headset early; it affects the input model (controllers vs. hand-tracking) and whether you
  develop tethered (PCVR) or on-device (standalone Quest, tighter perf budget).
- **Audio:** **MetaSounds** — the sample-accurate audio graph. This is the crown jewel for this
  project: it can synthesize the oscillator output and sonify the interference field.
- **Field/volumetrics:** **Niagara** — GPU particle/VFX system for the volumetric wave field and
  nodal surfaces.
- **Body:** **MetaHuman** — free photoreal riggable human. *Caution (load-bearing, see §5):*
  photoreal anatomy raises the grift stakes; honesty framing must get *stronger* as fidelity rises.
- **Testing:** UE5 has an **Automation** test framework; the physics-core C++ tests should run there
  headless and assert against the golden vectors from §1.

### Physics-into-UE5 bridge — chosen approach

**Port + golden-vector cross-validation** (mirrors the existing JS↔Python parity discipline):
1. Reimplement the Stuart–Landau stepper (and beat/SOVT) as a **plain C++ module** with no engine
   types in its interface.
2. Emit golden vectors from the canonical core (a small JSON of input→trajectory).
3. A UE5 Automation test loads the golden JSON and asserts the C++ stepper reproduces it.
4. UE5 Actors/MetaSounds *read* state from this module each tick; they never compute physics.

Rejected: running Node as an external process feeding UE5 over a socket (latency, fragility, kills a
standalone build). Rejected: writing the dynamics in Blueprints (untestable, drifts).

---

## 5. Constraint compliance in VR — the sharp edges

The seven constraints (C1–C7) bind the VR build **at least as hard** as the browser build, and one
of them is *in tension with the existing roadmap*. Surface it, do not bury it.

### The C1 problem (the biggest open design question)

**C1: sing → *then* look; never look-while-singing.** The purpose is to keep the tool from becoming
a live biofeedback meter that trains you to sing *to the display* instead of to the sound.

`ENGINE_ROADMAP.md` Capability 5 describes the opposite — *"practice and visualization become one
act… humming is the input and the field is the response, in real time, surrounding you."* **That
directly conflicts with C1.** A headset is inherently a live, immersive display; the naïve VR build
is a maximal violation of C1.

**This must be resolved before building, not during.** Two C1-safe modes to design toward:

- **(a) SANDBOX mode** — controller/slider-driven physics exploration, **no microphone**. You
  manipulate drive / effort / occlusion / reference-f₂ and inhabit the resulting field. This is the
  VR analogue of the shipped `pages/release_principle.html` and is unambiguously C1-clean.
- **(b) REVIEW / REPLAY mode** — you sing **first** (eyes closed, outside the sim), the session is
  recorded, and *then* you step into VR to explore what happened, **past-tense** — matching the
  existing notices discipline (`src/notices.js`: sustained-state → past-tense, never live coaching).

A **live mic-driven "sing inside the field" mode is explicitly deferred** and may never be built; if
it ever is, it requires a fresh constraint review, because it is the exact thing C1 exists to
prevent. Do not let immersion smuggle it in.

### The rest, briefly

- **C2 (no scoring) + the "Never" list (gamification).** Game engines have cultural gravity toward
  juice, points, and progression. Capability 6 in the roadmap ("parameter-space exploration as
  gameplay") must be held to *descriptive* exploration, never scored achievement. No stars, %,
  grades, streaks, or win-states. Ever.
- **C3 (tool makes itself unnecessary).** VR intensifies immersion; guard against building a thing
  users depend on rather than graduate from. Sessions should end, not retain.
- **C4 (anatomy locked, articulation live).** Expose effort/articulation/occlusion controls; do
  **not** add sliders that reshape the user's skull/tract as if measured.
- **C5 (no quantity without a unit).** Drive = Hz. effort/occlusion are dimensionless [0,1]
  configuration inputs, not "energy/intention/vibration." No unit-less oscillating quantity.
- **C6 (no clinical claim).** Ship the disclaimer *more* prominently as fidelity rises: not a
  medical device; does not measure your body; does not tell you whether you sang well.
- **C7 (three tiers of knowability).** The register thresholds and any calibration are
  *illustrative*, not measurements of any person. A photoreal MetaHuman glowing with a field implies
  measurement — the honesty framing must scale up exactly as fast as the immersion (stated in the
  roadmap three times because it is load-bearing).

---

## 6. The parallel roadmap — lockstep steps

Each browser step has a VR counterpart. The **physics core is shared** (§1); the two columns differ
only in *representation*. Do a browser step, then its VR step in the dedicated chat; log what one
revealed about the other (that log is the point — §0).

| # | Browser (this repo) | VR / UE5 (dedicated chat) | Shared artifact |
|---|---|---|---|
| **P0** | *(done)* Release Principle physics as prescribed rules; harness 15/15; `pages/release_principle.html` | — (VR starts at E-core) | `src/physics.js` register layer |
| **E-core** | Emergent Stuart–Landau core in JS; measurement-based harness; hysteresis loop reproduces up≈261 / down≈204 | C++ port of the same core; UE5 Automation test asserts golden vectors | **Golden vectors** (JSON) |
| **1 — Hysteresis** | 2D hysteresis plot; up/down sweeps do not retrace | Register as an inhabitable bistable *environment*; the fold felt as a jump | shared `updateRegister` dynamics |
| **2 — Release** | Effort raises barrier, damps output; drop effort → cross | Effort as embodied input (grip/tension); release felt as the space "letting go" | shared effort→μ mapping |
| **3 — Beat / lock** | Beat envelope pulses; locks at unison | **MetaSounds** binaural beat; lock = binaural stillness in the ears | shared `beat*` functions |
| **4 — SOVT** | Occlusion relieves damping | Occlusion felt as acoustic back-pressure / resistance | shared `netDamping` term |
| **5 — Field** | 2D interference (`field.js`, shipped) | **Niagara** volumetric nodal surfaces you walk through | shared field math |
| **6 — Body** | Silhouette + zones | MetaHuman; slice the torso, watch the chest field oscillate | shared zone weights |

**Rule:** never let the VR column get *ahead* of the physics the browser column has falsified. VR
renders physics that has already passed the harness — it does not prototype new physics that skips
it.

---

## 7. New Active Ignorance Nodes to register (in the VR chat)

Follow the repo's AIN discipline (see `methodology/active_ignorance_nodes.md`; repo uses `AIN-RS-NNN`
— use an `AIN-VR-NNN` series to keep the track separable):

- **AIN-VR-001** — *Is VR/embodiment actually more effective for teaching resonance than a screen?*
  This is the founding hypothesis of the whole track and is **unproven**. Do not let the effort spent
  building VR become evidence that it works. Requires a real comparison someday.
- **AIN-VR-002** — *Does the C1 constraint survive contact with an immersive live display?* The
  SANDBOX/REVIEW split (§5) is a proposed resolution, not a validated one.
- **AIN-VR-003** — *Photoreal fidelity vs. the grift line.* As MetaHuman realism rises, at what point
  does the render imply measurement it cannot back up? Honesty framing must scale; the threshold is
  unknown.
- **AIN-VR-004** — *Golden-vector tolerance across languages.* Float determinism differs JS vs. C++;
  the acceptable numerical tolerance for "the C++ core agrees with canonical" is TBD and must not be
  set so loose that a real divergence hides in it.

---

## 8. First session plan (what the fresh VR chat should do first)

Do **not** open Unreal on day one. Order of operations:

1. **Read** this doc, [`ENGINE_ROADMAP.md`](ENGINE_ROADMAP.md), and the browser Release Principle
   physics (`src/physics.js` register layer + `tools/physics_verify.js`). Understand what is
   *prescribed* vs. what will be *emergent*.
2. **Decide the emergent-core status:** has the browser track shipped the Stuart–Landau core yet? If
   not, the VR track waits — there is nothing to port. VR renders falsified physics only (§6 rule).
3. **Resolve C1 (§5) on paper first.** Pick SANDBOX-first. Write the mode contract before any Actor.
4. **Pick the target headset** (OpenXR) and decide tethered vs. standalone — it sets the perf budget.
5. **Stand up the C++ physics module + one UE5 Automation test** that loads a golden vector and
   passes. This is the "harness green" milestone before any rendering — the direct analogue of Phase
   0's "get the harness green, then stop."
6. **Only then** build the first embodied step (Step 1 — hysteresis as environment), and log the
   first cross-pollination note back toward the browser track.

**Definition of done for the VR track's first milestone:** the C++ core reproduces the golden
vectors under UE5 Automation; one C1-safe SANDBOX scene renders the register state from that core;
nothing from the "Never" list exists; the honesty disclaimer is present and *stronger* than the
web version's. Then stop and compare notes with the browser track.

---

## 9. Honesty ledger (read before overselling this to yourself)

- **No guarantee it works.** VR may prove no better than the screen (AIN-VR-001). That is an
  acceptable outcome; the cross-pollination and the learning are the guaranteed value, the VR
  artifact is not.
- **Double effort is real and accepted.** Two representations of one physics is deliberately slower.
  The discipline is the point.
- **The grift line tightens with immersion.** Every gain in fidelity is a gain in the responsibility
  to distinguish model from measurement. This is the single most repeated warning in the roadmap;
  it applies hardest in VR.
- **The physics is not the engine.** The ODE is trivial; UE5 earns its place only through
  embodiment and audio. If a step doesn't use the third dimension, spatial audio, or embodiment to
  do *conceptual* work, it does not belong in the engine (roadmap's governing principle).

---

*This document is a plan, not a commitment to build. It exists so the VR track can begin cleanly in
its own chat and its own branch whenever the browser track is ready to be mirrored — without
disturbing the shipped artifact or the higher-priority browser roadmap.*
