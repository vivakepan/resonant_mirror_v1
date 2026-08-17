# The Vibrational System — Mechanics and Philosophy

*A reference document on vibration, resonance, and tuning in the human body: physics first, then phenomenology.*

---

## 1. Vibration as a physical substrate

Vibration is periodic displacement from equilibrium. A system disturbed from its resting state and then released will oscillate if it has two properties: a restoring force (something that pulls it back toward equilibrium) and inertia (something that carries it past equilibrium). The period of oscillation — how long one cycle takes — depends on the ratio of these two forces, not on how hard the initial disturbance was.

Two parameters describe a vibration:

- **Frequency** (Hz): the number of cycles per second. Determines pitch in auditory perception; determines which resonators respond.
- **Amplitude**: the magnitude of displacement. Determines loudness; determines how much energy is being stored and transferred.

Every physical object with a restoring force has **natural frequencies** — modes at which it oscillates most efficiently when disturbed. These are determined by geometry, density, boundary conditions, and material stiffness. A wine glass has a natural frequency (the one that shatters it at the right pitch). A room has natural frequencies (the standing waves that cause bass buildup in corners). A skull has natural frequencies. So does a chest cavity.

The natural frequencies of an object are fixed by its physics. They are not preferences. They are not metaphors. A driven oscillator that receives energy at its natural frequency accumulates it; one driven at other frequencies dissipates it faster than it accumulates. This difference in behavior is **resonance**.

---

## 2. Resonance: amplification at natural frequency

Resonance is what happens when a driving frequency matches a system's natural frequency. The system receives energy at exactly the rate and rhythm it can absorb and store it; amplitude builds over successive cycles.

Two parameters characterize a resonant mode:

- **Resonant frequency** (*f₀*): where the peak response occurs.
- **Quality factor** (Q): how sharp the resonance is. High Q means the system responds strongly within a narrow frequency band and rings for a long time after excitation stops. Low Q means a broad, soft response that damps quickly. Q = *f₀* / bandwidth.

In vocal acoustics, the formant frequencies of the vocal tract are resonant modes of the air-filled cavity. A typical vowel in a female voice might have a first formant around 600–800 Hz (wide, corresponding to low Q) and a second formant around 1200–2500 Hz depending on the vowel. These are not just the frequencies that the voice amplifies — they are the frequencies at which the cavity's walls set the air column into standing-wave motion.

In the visualization, the Q field on each zone mode controls how broadly the zone responds to nearby frequencies. The skull's bone-conducted modes are relatively narrow (Q ≈ 0.3–0.4 in the model, admittedly hand-tuned); the chest's tissue-conduction modes are broader. These values are `phenomenological` — they produce visually plausible behavior but are not measured from bodies.

---

## 3. The human body as a collection of coupled resonators

The body above the larynx is not one resonator. It is a network of approximately ten distinguishable resonating structures, each with its own modal frequencies, each coupled to its neighbors through shared air columns, bone conduction, and tissue pathways.

The visualization models ten zones. Their approximate frequency centers, and what the model marks as their `evidence` status:

| Zone | Center frequency | Evidence status |
|------|-----------------|-----------------|
| Chest | 120 Hz (+ 600 Hz second mode) | `phenomenological` / `pending` |
| Trachea | 180 Hz | `phenomenological` |
| Larynx | 220 Hz | `phenomenological` |
| Heart / anterior thorax | 105 Hz | `phenomenological` |
| Pharynx | 300 Hz | `phenomenological` |
| Mouth | 420 Hz | `phenomenological` |
| Nasal | 580 Hz | `phenomenological` |
| Skull | 520 Hz + 1200 Hz + 2800 Hz | `phenomenological` / `pending` |
| Inner ear | 680 Hz | `phenomenological` |
| Abdomen | 98 Hz | `phenomenological` |

These are **hypotheses about where the interesting responses are**, not measurements. The published vocal acoustics literature constrains the ranges but does not provide universal values — individual anatomy varies substantially. The `evidence` field is the epistemically honest inventory: every frequency is either linked to a citation, or flagged as pending citation, or marked as hand-tuned-to-feel-right.

### What couples them

Three coupling pathways are encoded in the model's anatomical adjacency graph:

**Air column continuity.** The airway from the chest upward through the trachea, larynx, pharynx, mouth, and nasal cavity is a continuous acoustic tube. Pressure variations propagate along it. A resonance at the larynx produces a standing wave that extends into the pharynx and mouth. The zones connected by air-column edges in the model: chest↔trachea, trachea↔larynx, larynx↔pharynx, pharynx↔mouth, mouth↔nasal.

**Bone conduction.** Mechanical vibration travels through solid structures at much higher speeds than through air (roughly five times faster in bone). The sternum transmits vibration from the chest cavity upward through the clavicle and cervical spine to the skull. Bone-conducted energy bypasses the air column entirely and excites the skull's resonant modes directly. Edges: larynx↔skull, skull↔inner-ear.

**Tissue and vagal pathways.** The vagus nerve (cranial nerve X) and adjacent soft tissue provide a third coupling channel. The zones connected by tissue edges in the model include larynx↔heart and trachea↔heart — reflecting the mechanosensory routes through the thorax.

The coupling coefficient in the model (`COUPLING_GAIN = 0.10`) is tunable and currently set subjectively. A zone that strongly activates nudges its neighbors — not strongly, but measurably. This is what makes it possible for a fundamental to produce "whole-system" activation: harmonic stacking excites multiple zones through their different natural frequencies, and the coupling then biases the zones those zones are adjacent to.

---

## 4. The source: vocal fold dynamics

The vocal folds are a flow-controlled oscillator. Located in the larynx, they are drawn together by the Bernoulli effect as exhaled air passes between them, and then blown apart by subglottal air pressure. This open-close cycle repeats at the **fundamental frequency** (F₀) of the phonation: roughly 80–150 Hz for a typical bass, 170–300 Hz for a soprano in the lower register, up to 2000 Hz at the extreme top of a soprano's range.

The output of the vocal folds is not a sine wave. It is a quasi-periodic pulse train with a **rich harmonic spectrum**: energy at the fundamental and at integer multiples of it (2×, 3×, 4× ... the fundamental). The harmonic falloff is approximately 12 dB per octave in the source spectrum; this means the overtones exist but get progressively weaker at higher frequencies. The vocal tract's formant structure then shapes this raw spectrum: overtones near a formant frequency are amplified; overtones far from formant frequencies are not.

The visualization models this as a **harmonic stack**: given a fundamental frequency, the zone response includes contributions from harmonics h=1 through h=8, with amplitude falling as h^0.55. This means that a 220 Hz fundamental excites not only zones with natural frequencies near 220 Hz, but also those near 440, 660, 880 Hz, and so on. When multiple harmonics fall near multiple zone frequencies simultaneously, multiple zones activate — this is the mechanism behind whole-system resonance states.

---

## 5. Standing waves and modes

When a bounded resonator is driven at its natural frequency, the reflected wave and the incoming wave combine into a **standing wave**: a pattern of fixed nodes (zero displacement) and antinodes (maximum displacement) at specific spatial locations.

In a tube open at one end (roughly approximating the vocal tract), the modes occur at frequencies where the tube length equals odd multiples of a quarter-wavelength: *f* = c / 4L, 3c / 4L, 5c / 4L, ... where c is the speed of sound and L is tube length. This is why vowels have a characteristic set of formants spaced in a predictable way — they are the modes of the tube-shaped cavity being shaped.

In a more complex three-dimensional cavity (like the chest or skull), the modes are harder to calculate analytically — they depend on the detailed geometry, the boundary conditions at the walls, and the coupling to adjacent spaces. The skull's modes have been studied through laser vibrometry and accelerometer measurements, primarily in the context of bone-anchored hearing aids; the published data supports resonances roughly in the ranges the visualization uses (though with wide individual variation).

**The spatial node in the interference field** is a different physical phenomenon from the standing-wave node in a single resonator. When two coherent wave sources are active simultaneously — the internal hum and the external song — their superposed fields have regions of constructive interference (antinodes) and destructive interference (nodes). The location of these spatial nodes depends on the relative positions of the two sources and the ratio of their frequencies, not on the natural frequencies of the body's cavities. A zone that would normally be excited by its driving frequency can find itself at a spatial node and have its response suppressed. This is what the visualization shows when the badge reads `◊ SPATIAL NODE`.

---

## 6. Anti-resonance: destructive interference in coupled systems

Between any two coupled resonators, there exists a frequency at which their combined response is *lower* than either resonator's baseline. This is an **anti-resonance**: not silence, but active cancellation driven by phase-destructive interference between the two systems.

For two coupled resonators with natural frequencies *f₁* and *f₂*, the anti-resonance frequency is approximately their **geometric mean**: √(*f₁* × *f₂*). This result comes from the transfer function of two coupled oscillators: the poles (resonances) are at *f₁* and *f₂*, and the zero (anti-resonance) falls between them.

The four spectral-null presets in the visualization map to these geometric means:
- 147 Hz = √(120 × 180) — chest ↔ trachea
- 355 Hz = √(300 × 420) — pharynx ↔ mouth
- 467 Hz = √(420 × 520) — mouth ↔ skull
- 628 Hz = √(580 × 680) — nasal ↔ eyes

At these frequencies, the coupled pair's response falls below its resting baseline — active suppression. This phenomenon appears in vocal acoustics as spectral zeros in the vocal tract transfer function, and it is partly responsible for the characteristic tone quality of certain vowels in certain pitch ranges: the zeros shape the spectrum as much as the formant peaks do.

This anti-resonance (spectral null, α) is physically distinct from the spatial node (β) that appears in the two-source interference field. Both are suppression phenomena. Their mechanisms are different. They should not be conflated.

---

## 7. Bone conduction and the skull as resonator

Bone conduction is the transmission of sound through solid tissue rather than through air. The skull is particularly relevant here because it is both a bone-conduction receiver (vibrations from the larynx travel up the sternum and cervical spine and set the cranial bones vibrating) and an acoustic cavity (the sinus spaces inside the skull have their own Helmholtz-resonator-like modes).

**The singer's formant cluster** is the most well-documented consequence of skull and sinus resonance in vocal production. Studies of trained operatic singers (Sundberg 1974, 1987; Titze & Story 1997) consistently find an energy cluster around 2500–3500 Hz in the sung output that is absent or weaker in speech. This cluster is produced by a narrowing of the lower pharynx that creates a resonance near 2800 Hz — close enough to existing sinus and laryngeal resonances to create a cluster. The practical consequence: a trained singer's voice carries over an orchestra because the orchestral instruments concentrate their energy below 800 Hz, while the singer's formant occupies a relatively clear spectral region above that.

The visualization includes a 2800 Hz mode on the skull zone (evidence: `pending — singer's formant cluster`). The slider extends to 3000 Hz and there is a SINGER · 2800 preset for this reason. The mode is registered as `pending` because while the singer's formant cluster is well-documented, the specific mechanistic coupling to cranial bone resonance (versus pharyngeal air-column resonance) is a matter of ongoing research.

Bone-conducted vibration at lower frequencies is experienced differently from air-conducted sound — it tends to be felt as much as heard, particularly in the sternum and skull. The "chest resonance" felt when singing low notes is partly air-column resonance in the chest cavity and partly bone conduction of low-frequency vibration from the larynx to the sternum and ribs.

---

## 8. The vagus nerve as coupling pathway

The vagus nerve (cranial nerve X) is the longest cranial nerve, descending from the brainstem through the jugular foramen, past the carotid arteries, through the thorax (branching to the heart and lungs), and into the abdomen. It carries:

- **Parasympathetic efferent signals**: regulation of heart rate, bronchial smooth muscle, digestive motility
- **Visceral afferent signals**: reporting on pressure, stretch, chemical state in the thoracic and abdominal organs — roughly 80% of vagal fibers are afferent (from body to brain), not efferent

The larynx is supplied by the recurrent laryngeal nerve (a branch of the vagus) and the superior laryngeal nerve. Mechanosensory receptors in the laryngeal mucosa and the airway respond to pressure and airflow; these signals travel centrally via vagal afferents.

Whether the vibration produced by phonation — transmitted through the laryngeal tissues and then through the trachea and thorax — constitutes a significant mechanosensory signal to vagal afferents is not clearly established. What is established: the larynx, pharynx, and thoracic structures are all vagally innervated, and the convergence of afferent signals from these structures in the nucleus tractus solitarius (the primary vagal relay in the brainstem) makes it plausible that a sustained resonance state would produce a distinct interoceptive signal. Whether that signal is subjectively distinguishable from the sum of the individual sensations — whether it would be recognized as "resonance" or just as "humming" — is not known.

The visualization represents the vagus as a coupling pathway between zones. The particle flow along the vagal path is a structural representation, not a model of neural firing rates. Its presence in the visualization is justified by the anatomical reality of the pathway and the conceptual importance of the coupling; it is not a claim that the depicted flow corresponds to vagal activity.

---

## 9. Tuning: the act of adjusting resonance

Tuning, in any physical system, is the act of shifting the system's response toward or away from a target frequency. In a string instrument, you tune by adjusting tension. In a brass instrument, you tune by adjusting the length of the resonating air column. In a room, you tune acoustics by changing the geometry or the absorptive properties of the surfaces.

In the voice, tuning is continuous and multi-dimensional. The primary tuning variables:

**Vowel and mouth shape.** The most powerful acoustic tuning variable in the voice. Open the mouth wide: first formant rises. Raise the back of the tongue: second formant drops. Lip rounding: lowers all formants slightly. Skilled singers manipulate vowel shape to move their formants toward the harmonic that serves them at a given pitch — this is what voice teachers mean by "vowel modification" in the upper register.

**Breath support and subglottal pressure.** Affects vocal fold closure and phonation threshold; also subtly affects formant frequencies by changing the geometry of the subglottal air column.

**Posture and muscle tension.** Rib cage expansion affects chest cavity volume; neck and jaw tension changes the coupling between the pharyngeal resonators; shoulder tension can alter the acoustic coupling between the chest and skull.

**Attention.** Less obviously physical but not less real: directing attention to a body region — the sternum, the skull, the nasal passages — often produces subtle adjustments in muscle tension and airway geometry that shift the resonance emphasis. This is why voice teachers ask students to "think into the mask" or "send the voice to the back of the hall." The instruction is a proxy for a complex set of adjustments that are hard to specify directly.

The visualization is a tuner in the indirect sense: it shows which frequencies produce which resonant states in the physics model. It does not model what a person's vocal tract is doing, only the acoustic output's frequency. The gap between "the model responds here" and "your body is tuned here" is the space where practice lives.

---

## 10. Harmonics, consonance, and the two-source case

When two pitched sources are sounded simultaneously, their harmonic spectra interact. At simple frequency ratios — 2:1 (octave), 3:2 (perfect fifth), 4:3 (perfect fourth) — the harmonics of the two sources align at regularly spaced intervals. The interference pattern of their combined spectra is stable in time: the beating rate between coincident harmonics is zero or very low, and the spatial interference pattern of the wave fields tends toward a stable standing configuration.

At complex or irrational frequency ratios, fewer harmonics coincide, more harmonics beat against each other at various rates, and the interference pattern is more complex and temporally variable.

This is the acoustic foundation of the consonance/dissonance distinction — Helmholtz's *Tonempfindungen* (1863) analyzed it in terms of beating between harmonics. More recent models (Plomp & Levelt 1965; Tramo et al. 2001) confirm that perceived roughness (dissonance) correlates with beating rates in the 20–200 Hz range.

In the context of humming along with a song, this means that the two sources' resonance landscapes interact. If the song's dominant pitch is a perfect fifth above the hum (ratio 3:2), their harmonics partially align, and the interference field in the body (modeled as a two-source wave superposition) will have a relatively stable spatial structure. If the relationship is more complex, the spatial structure will shift more rapidly and the pattern will be harder to read. The visualization shows this in the field layer: at simple ratios, clear nodal lines form; at complex ratios, the field is more turbulent.

Whether this maps to a distinct felt experience — whether singing a fifth above a drone feels qualitatively different from singing a tritone above it, in body-resonance terms — is one of the open empirical questions.

---

## 11. The philosophy of vibration as a mode of knowing

There is a long tradition, running from Pythagorean number-mysticism through Helmholtz's physiological acoustics, through the vocal pedagogy of the twentieth century, through current research on interoception and the gut-brain axis, of treating vibration as a medium of self-knowledge: not just as something that happens in the body, but as something the body learns about itself through.

The Pythagorean tradition made number the foundation of reality and harmonic ratios the bridge between the physical and the metaphysical. This was philosophically interesting and scientifically untenable — the idea that specific integer ratios have cosmic significance independent of the physical systems that happen to produce them at human scales doesn't survive contact with the actual physics. But the empirical core of the observation survives: simple frequency ratios produce distinctive acoustic phenomena (stable standing waves, minimal beating, phase-locked oscillation) that are genuinely different from complex ratios. The felt difference between consonance and dissonance is real, not imaginary. The tradition collapsed a real physical distinction into a metaphysical one.

Helmholtz's *Tonempfindungen* is the canonical nineteenth-century account of vibration as a scientific object: rigorous, physiologically grounded, careful about the distinction between physical measurement and perceptual report. It remains worth reading, particularly the first three chapters on combination tones and the analysis of beating.

Current interoception research (Craig 2002; Khalsa et al. 2018) has established that the body has a dedicated neural channel for reporting its own physiological state — heart rate, respiration, visceral pressure, tissue vibration — that is anatomically distinct from exteroception (external sensing) and from proprioception (body position). The quality of interoceptive awareness varies enormously across individuals and is trainable. Practices that direct sustained attention to the body — meditation, yoga, somatic bodywork, Feldenkrais, singing — tend to improve interoceptive accuracy (Khalsa et al. 2009; Farb et al. 2013). Whether they improve it *by means of* the resonance phenomena they invoke, or whether the resonance is incidental to an attention-training effect, is not established.

The intellectual position this project occupies: **the physics is real; the phenomenology is reported but unmeasured; the gap between them is the honest place to stand.** Uncertainty is not a failure of the project. Every registered Active Ignorance Node is a specific empirical question that could in principle be answered by a well-designed study. The model is useful not because it is correct but because it is *falsifiable* — the `evidence` field on each zone mode frequency, the AIN statuses, the holdout control group in the journal-noticer design, are all mechanisms for tracking when the model is wrong.

The deepest claim the project can honestly make is this: there exists a class of physical phenomena (acoustic resonance, interference, standing waves, coupled-oscillator behavior) that is unambiguously present in the body during phonation, that produces measurable effects on the acoustic output, and that is plausibly linked to some of what singers and contemplatives report as "felt resonance." The link is not proven. The phenomena are real. Investigating the link with appropriate uncertainty is worthwhile.

---

## 12. Open questions (the AINs as a vibrational research agenda)

The registered gaps in the model are not embarrassments. They are research questions with specific resolution conditions.

**AIN-RS-001** — Zone natural frequencies are unverified against bodies. Each zone frequency is a hypothesis, not a measurement. Resolution: for each zone, identify a published measurement of the relevant acoustic mode frequency in the body (acoustic or vibrometric), update the `evidence` field to `cited`, and revise the frequency value if the literature range doesn't overlap the current model value.

**AIN-RS-003** — No felt-sense ground truth. The badge threshold has not been calibrated against self-reports. Resolution: opt-in journal-noticer study with pre-registered null thresholds and a holdout control group. Minimum viable: 30 participants, each spending ≥10 sessions, with one session per week randomly assigned to control (visualization present but badge suppressed) and tagging interesting moments.

**AIN-RS-011** — Wave amplitude omits 1/r falloff. The interference field assumes constant-amplitude waves; real point sources have 1/r falloff (spherical) or 1/√r (cylindrical). Near-source intensities are overestimated. Resolution: implement optional 1/r rendering mode; test whether it improves or degrades visual legibility.

**AIN-RS-015** — Is synthesized breath enough? The phenomenological question: does the synth breath alone produce the "voice rides on breath" felt sense, or is self-generated breath the missing ingredient? Resolution: three-condition study (synth, tap, mic); pre-register the prediction that ≥60% prefer mic or tap; falsification condition: synth rated equally embodied across modes.

These are not rhetorical questions. They are experiments. The model is not waiting for them to be answered in order to be useful; but it would be a different, more grounded thing if they were.

---

## Further reading

On vocal acoustics and the singer's formant:
- Sundberg, Johan. *The Science of the Singing Voice*. 1987.
- Titze, Ingo R. *Principles of Voice Production*. 1994.
- Story, B.H., Titze, I.R., Hoffman, E.A. "Vocal tract area functions from magnetic resonance imaging." *JASA* 100(1), 1996.

On bone conduction:
- Stenfelt, Stefan. "Acoustic and mechanical aspects of bone conduction." In *Bone Anchored Hearing Aids*, 2010.
- Röösli, Christoph et al. "Skull vibrations and sound transmission in the human skull." *Hearing Research* 254, 2009.

On interoception and body awareness:
- Craig, A.D. "How do you feel? Interoception: the sense of the physiological condition of the body." *Nature Reviews Neuroscience* 3, 2002.
- Khalsa, S.S. et al. "Interoceptive awareness training as a therapeutic intervention." *Frontiers in Psychology* 9, 2018.

On consonance and beating:
- Helmholtz, Hermann. *On the Sensations of Tone*. 1863 / English translation 1885.
- Plomp, R., & Levelt, W.J.M. "Tonal consonance and critical bandwidth." *JASA* 38(4), 1965.

On anti-recommendation and feedback-loop failure modes:
- Hadfield-Menell, Dylan et al. "The off-switch game." *IJCAI*, 2017.
- Soares, Nate. "Formalizing two problems of realistic world-models." MIRI, 2015.

For the epistemic framework this is built inside: [`docs/methodology/README.md`](docs/methodology/README.md)
