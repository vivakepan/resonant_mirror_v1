# Engine Roadmap — Staged Capability Map

**Status:** **STAGED — in-project capability tier** · [README.md](../README.md)  
**Current tier:** Canvas 2D browser app ([ARCHITECTURE.md](ARCHITECTURE.md)) — field, breath, views, mic/file **SHIPPED**  
**This doc:** when and why to graduate to Three.js / Unity / UE5

---

## Relationship to v2 (shipped browser)

| v2 (now) | Engine tier (staged) |
|----------|----------------------|
| 2D interference field (`field.js`) | Volumetric Niagara / VFX Graph |
| Five view *stances* (`views.js`) | Anatomical layers / MetaHuman |
| FFT mic + file (`audio.js`) | MetaSounds, binaural, VR mic |
| Portable `index.html` / `dist/` | Multi-GB download or Pixel Streaming |

The engine path is **part of project scope**, not rejected. The browser artifact remains the **front door** for one-click distribution.

---

## The governing principle

A game engine is worth it **if and only if the third dimension, real-time field simulation, or embodiment are doing conceptual work.** If the goal is only "make the current artifact glossier," an engine is overkill. Each tier below is justified by a capability the previous tier *cannot reach*.

2D interference is **shipped** ([INTERFERENCE_MODE_DESIGN.md](INTERFERENCE_MODE_DESIGN.md)). 3D justifies **nodal surfaces** you can fly through — not replacing the 2D proof.

---

## What an engine fundamentally changes

**Dimensionality.** The body goes from flat silhouette to volume; waves go from stylized 2D rings to a 3D field propagating through tissue. Counter-propagating song-field and hum-field meeting in 3D produce nodal *surfaces* hanging in space — a qualitatively different, richer object than anything 2D can show.

---

## Capability tiers

### Capability 1 — Real volumetric wave simulation
Replace stylized Gaussian curves with an actual discretized wave field on the GPU (UE5 **Niagara**, Unity **VFX Graph**).
- **True superposition** — field value at every point; song-field + hum-field literally add. Interference emerges from math rather than being drawn.
- **Standing waves form and collapse** because of the physics, teaching something true rather than asserted.
- **Resonance as energy accumulation** — a real cavity *builds* amplitude over cycles when driven at its natural frequency. The 2D version can't show this; a field sim can.

### Capability 2 — A real anatomical body (UE5 MetaHuman)
Photoreal, riggable human, free.
- **Cross-sectional views** — slice the torso, watch the chest field oscillate; the "five view modes" become actual anatomical layers, not 2D restyles.
- **Body as instrument, literally** — a MetaHuman mid-hum with the resonance field playing through it.
- **Facial placement made visible** — voice pedagogy's "mask" placement shown on an actual face.
- *Caution:* photoreal anatomy raises the grift stakes. A glowing photoreal human implies measurement. Honesty framing must get **stronger** as rendering gets more convincing.

### Capability 3 — Audio as first-class input (UE5 MetaSounds)
A programmable, sample-accurate audio graph in-engine.
- **Song drives the field directly** — load mp3, in-engine FFT, spectral peaks drive the external source. No browser-audio fragility.
- **Synthesize the hum** — generate the internal source and dial its pitch, useful for the *silent-practice* version where you don't want a mic running.
- **Real-time mic with proper DSP** — formant tracking, pitch detection at fidelity Web Audio struggles with.
- **Sonify the interference** — turn the interference field back into sound; hear constructive reinforcement and destructive notches. Visualization + audio of the same physics, closed loop.

### Capability 4 — Spatialized / directional audio
Full 3D spatial audio.
- **Binaural rendering of the meeting** — song-source at the crown, hum-source at the sternum; with headphones the listener hears the spatial relationship.
- **Bridge to the felt practice** — binaural placement is the closest a screen gets to inducing the body-located sensation the essay's protocol is about.

### Capability 5 — Interactivity and embodiment (VR/XR)
Most speculative, most aligned with the deepest aim.
- **First-person inhabitation** — you're *inside* the resonance field, humming (real mic), feeling it build in chest and skull, in a quiet VR space.
- **Practice and visualization become one act** — humming *is* the input and the field *is* the response, in real time, surrounding you. The artifact becomes the practice's environment, not its referent.
- **Haptics** — controllers / vest vibrate at the shown resonance, closing the loop between seen, heard, felt.
- *Caution peaks here.* A multisensory VR resonance experience is powerful and therefore easy to oversell. The discipline scales up exactly as fast as the immersion.

### Capability 6 — Parameter-space exploration as gameplay
Games are systems for exploring possibility spaces.
- **Tuning as mechanic** — find song/hum combinations that produce whole-system lock; anti-resonance notches as hidden locations. Exploration becomes structured play (with restraint).
- **Recordable, shareable states** — save and share a 3D field configuration, not just a frequency. Feeds the journal-noticer.
- **Procedural discovery** — let the engine sweep the parameter space overnight and surface the most striking standing-wave geometry. (This is the synthetic-session-generator idea, in 3D.)

---

## Honest tradeoffs

**Distribution cost (the big one).** The browser artifact is *one click*, any device, instant share. A UE5 build is a multi-GB platform-specific download — no instant share. You'd lose the floor-case ("just open it over a song") central to the project. *Mitigation:* keep the web artifact as the permanent front door; treat the engine version as the deep room — the downloaded research instrument, not the shareable toy. Pixel Streaming (UE5 on a server, streamed to browser) recovers some instant-access at hosting cost + latency.

**Build complexity.** Web version: zero build pipeline. UE5: large, opinionated, real learning curve.

**The grift-line tightens as fidelity rises.** Stated three times across the tiers because it's load-bearing. Every increase in immersion is an increase in the responsibility to distinguish model from measurement.

---

## Engine options compared

| Option | 3D / fields | Distribution | Fidelity ceiling | Best for |
|--------|-------------|--------------|------------------|----------|
| **Three.js / WebGL** | Yes (coarse) | One-click (browser) | Medium | Proving 3D interference while keeping shareability |
| **Unity** | Yes | WebGL export possible | High | XR ecosystem, middle path |
| **Unreal Engine 5** | Yes (best) | Download / Pixel Stream | Highest (MetaHuman, Niagara, MetaSounds) | Research instrument, VR, photoreal |

---

## Recommended progression

1. **2D interference** — **DONE** in `src/field.js`. Maintain legibility and honesty disclaimers.
2. **3D interference in Three.js** — same shareability, volumetric standing waves. First volumetric "field" version.
3. **UE5** — MetaHuman, MetaSounds, spatialized binaural, VR/haptics when embodiment is the goal. Research-instrument tier.

Each step is justified by a capability the previous step couldn't reach.
