# Audio Pipeline — Architecture & Design Brief

**Status:** **PARTIAL SHIPPED** · [README.md](../README.md)  
**Implements:** [`src/audio.js`](../src/audio.js) · breath mic mode in [`src/breath.js`](../src/breath.js)  
**Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md) · **STAGED:** YIN/MPM in AudioWorklet

*Research pass output. Browser-deployable, privacy-preserving audio. Architectural patterns, failure modes, and decision criteria — not a library shopping list.*

---

## As-built vs design target

| Capability | Design target | Shipped |
|------------|---------------|---------|
| Hum pitch | YIN/MPM in AudioWorklet | **FFT dominant peak** on main-thread `AnalyserNode` |
| Music file | FFT peak-pick / dominant pitch | **Yes** — K=1 default, K≤5 optional |
| Raw audio off-device | Never | **Yes** |
| Session export | Safe scalars only | **Yes** — [`src/sessions.js`](../src/sessions.js) |
| Neural pitch (CREPE/SPICE) | Fallback only | **Not implemented** |

Upgrade path: move pitch loop to AudioWorklet with YIN without changing physics API (`drivers[]`).

---

## TL;DR

- **For the live-hum case, do not use ML at all.** A hand-written **YIN** or **McLeod Pitch Method (MPM)** autocorrelation pitch detector running in an **AudioWorklet** is strictly better than a learned model here: monophonic pitch tracking is a solved problem, the DSP is ~100 lines, it has no model-loading cost, no warm-up freeze, and no inversion risk. Neural pitch models (CREPE, SPICE) earn their cost only in noise or polyphony — neither of which applies to a deliberate quiet hum.
- **For the music-file case, track the dominant pitch, do not transcribe.** Full polyphonic transcription is a hard, unsolved, source-separation problem and is not tractable client-side. Dominant-pitch + a few spectral features (centroid, flux, chroma) is tractable, legible, and exactly what the interference-mode design calls for. This matches the "dominant-pitch (option 1)" decision already recorded in `INTERFERENCE_MODE_DESIGN.md`.
- **The privacy commitment is architecturally cheap to honor and you must honor it precisely.** Raw audio never leaves the device — easy, since all the DSP is client-side anyway. The subtle risk is in *which derived features* you would ever aggregate: **MFCCs and mel-spectrograms are invertible back to intelligible speech** (multiple published reconstruction methods reaching ~93% intelligibility), so they must never be transmitted. Scalar features the project actually needs — fundamental frequency, a coupling score, an anti-resonance flag — carry no reconstructable speech content and are safe to aggregate under the journal-noticer's clip-and-privatize rules.

---

## The decision tree (the core output)

```
Is the input a single deliberate hum (live mic)?
├─ YES → AudioWorklet + YIN/MPM autocorrelation. No ML.
│         Easy. Solved. ~5ms latency. Zero inversion risk.
│
└─ NO, it's a music file (or noisy/polyphonic voice)
   ├─ Need the melody/dominant pitch only?
   │   └─ YES → FFT peak-pick or YIN-on-dominant + spectral features.
   │            Tractable client-side. Feeds interference mode.
   │
   └─ Need full note-by-note transcription (every simultaneous note)?
       └─ Don't. Polyphonic transcription is an unsolved
          source-separation problem, not deployable in a tab.
          It is also not something the artifact needs.
```

The single most important architectural finding: **the project's two real audio needs both sit on the easy side of every hard line.** The hum is monophonic (easy). The music input only needs dominant pitch (tractable). Nothing the artifact does requires polyphonic transcription or speech recognition, which are the genuinely hard, ML-hungry, privacy-fraught tasks. This is a gift — lean into it.

---

## 1. Browser audio feature extraction — architecture and limits

### AudioWorklet is the only correct home for real-time DSP

`ScriptProcessorNode` is deprecated and runs on the **main thread** — meaning FFT or pitch computation competes with UI rendering and garbage collection, producing both animation jank and audio glitches. The W3C TAG flagged this in 2013. The replacement, **AudioWorklet** (Chrome's design-pattern doc, Choi 2018), runs processing on a **dedicated high-priority audio render thread**, isolated from the main thread, receiving audio in 128-sample render quanta. The timing budget is brutal — roughly **3 ms per quantum at 44.1 kHz** — which is exactly why you do not want JS JIT pauses or GC in that path.

Architectural consequence: any custom DSP (the pitch detector, the feature extractor) belongs in an `AudioWorkletProcessor`, ideally compiled to **WebAssembly** (Emscripten from C/C++/Rust) for predictable, allocation-free, near-native performance. The AudioWorklet+WASM pairing is now the industry-standard stack (Superpowered moved entirely off ScriptProcessorNode once Safari shipped AudioWorklet support).

### AnalyserNode FFT — fine for visualization, limited for ML features

The `AnalyserNode` is the easy path: it gives you `getFloatFrequencyData()` (dB magnitude per bin) without writing a worklet. Design space:

- `fftSize` (powers of 2, 32–32768) trades **frequency resolution against time resolution / latency**. Larger FFT = finer frequency bins but a longer window, so the reading lags and fast pitch changes smear.
- `frequencyBinCount` = `fftSize / 2`. At `fftSize = 4096` and 44.1 kHz you get ~10.7 Hz per bin — coarse for low-frequency pitch discrimination, which is one reason FFT-peak-picking is inferior to autocorrelation for *pitch* (though fine for spectral *features*).
- **Use `getFloatFrequencyData`, not `getByteFrequencyData`, for anything feeding analysis.** The byte version quantizes to 0–255 and bakes in the node's min/max dB clamping — lossy in a way that silently degrades downstream feature quality.

Rule of thumb the existing artifact already follows: `AnalyserNode` FFT is the right tool for the *spectrum-strip visualization* and for *coarse dominant-peak picking* on music. It is the *wrong* tool for precise hum pitch — that wants autocorrelation.

### Pitch detection — the monophonic/polyphonic cliff

This is the load-bearing distinction. **Monophonic pitch detection is solved; polyphonic transcription is not.**

- **Time-domain autocorrelation methods — YIN (de Cheveigné & Kawahara, JASA 2002) and MPM (McLeod & Wyvill, 2005)** — are the reference algorithms for a single voice. YIN is "most cited, most tested, most robust" for speech/singing/solo instruments. Both detect the fundamental F₀ by finding where the waveform best correlates with a delayed copy of itself.
  - Naive autocorrelation is O(N²); an **FFT-based autocorrelation makes YIN O(N log N)** with negligible accuracy loss — important for the worklet's tight budget.
  - Hard constraint: autocorrelation needs **at least two pitch periods** in the window. To detect 40 Hz you need ~50 ms of signal — which sets a floor on latency at low pitches. For a hum in the 100–300 Hz range this is a non-issue (~7–20 ms).
  - Known failure: **octave errors** (reporting 2×F₀ or ½F₀), worst when a strong overtone briefly dominates the fundamental. MPM's normalized-square-difference peak-picking and YIN's cumulative-mean-normalized threshold both exist specifically to suppress this; pYIN (probabilistic YIN) adds a prior for further robustness.

- **Frequency-domain / polyphonic** detection (periodogram, HPS, the whole automatic-music-transcription field) faces a "highly structured overlap of harmonics" problem (Alvarado & Stowell 2017): simultaneous notes share and mask each other's harmonics, making it a source-separation problem at heart, with "high error rates and slow processing times" even in dedicated implementations. **This is not something to attempt in a browser tab, and the artifact does not need it.**

### Spectral features — which are cheap and what they're for

For the music-file case and for richer hum analysis, these are all computable per-frame from the FFT magnitude (Essentia.js demonstrates all of them in real-time AudioWorklet):

| Feature | Cost | Good for |
|---|---|---|
| **Spectral centroid** | trivial (weighted mean of bins) | "brightness" — maps to whether energy is in cranial vs chest zones |
| **Spectral flux** | trivial (frame-to-frame diff) | onset/change detection — when the song shifts |
| **Chroma / HPCP** | moderate | pitch-class content — the harmonic relationship between hum and song (your "harmonizing" case) |
| **MFCCs** | moderate | timbre — **but invertible to speech; see §4. Avoid for aggregation.** |

For the interference visualization, **spectral centroid + dominant pitch + chroma** are the natural trio: pitch drives which zone, centroid drives the internal/external depth gradient, chroma reveals consonance between the two sources.

### Formant estimation (LPC) — tractable, and it's the "placement" bridge

Linear-predictive-coding formant estimation is computable in the browser and is the closest acoustic correlate of the **vocal "placement"** concept the essay leans on — formant frequencies are literally where the vocal tract resonates. It's noisier than pitch detection and degrades in noise, so treat any formant readout as suggestive, not precise. Worth a v2 experiment, not a v1 dependency.

---

## 2. On-device ML inference — when (and whether) to bother

### The frameworks, briefly, as patterns not products

- **TensorFlow.js** with three backends: **WebGL** (broad support, good for conv-nets, some readback latency), **WASM** (best for small models / CPU, no GPU readback cost), **WebGPU** (fastest where supported, still maturing through 2025–2026). The decision criterion: small model + low latency → WASM; larger conv-net + GPU available → WebGL/WebGPU.
- **ONNX Runtime Web** is the alternative when your model originates in PyTorch and you want to avoid a TF.js conversion step.
- Cold-start matters: any of these has a **model-load + warm-up cost** (hundreds of ms to seconds) that the hand-DSP path simply doesn't have.

### The pretrained-model landscape for pitch (the honest assessment)

- **CREPE** (Kim/Salamon/Li/Bello, ICASSP 2018) — conv-net on the raw waveform, state-of-the-art monophonic accuracy, *outperforms pYIN and SWIPE*. But the **browser demo runs a stripped model with <3% of parameters** and warns it makes more octave errors as a result — i.e., the full-accuracy CREPE is heavy for a tab, and the tab-sized version isn't clearly better than YIN.
- **SPICE** (Google, 2019) — self-supervised, matches CREPE's ~90.7% raw-pitch-accuracy on MIR-1k, **trained to handle noise and singing-over-backing-track**, ships via TF Hub, deployed in Google's own browser app (FreddieMeter). This is the strongest *neural* candidate **if** you need noise-robust pitch on a music file. It also emits an **uncertainty/confidence output** per frame — valuable for honest abstention ("confidence below 0.9 → report nothing").
- **YAMNet** — audio *event* classification (521 classes), not pitch; irrelevant here except as a "what's happening" tagger you don't need.

### The actual recommendation

**Hum (live):** hand-written YIN/MPM in an AudioWorklet. No model. The neural models' advantage is noise-robustness and the hum is, by design, a clean signal in a quiet room. You'd be paying model-load cost and inversion risk for accuracy you don't need.

**Music file:** start with FFT-dominant-peak + spectral features (no ML). **If** real songs prove too noisy for stable dominant-pitch tracking, **SPICE** is the right upgrade — specifically because it was built for pitch-in-the-presence-of-backing-music and because its confidence output fits the project's abstention ethos. That's a clean "earn the dependency only when the simple path demonstrably fails" decision.

**The general principle:** in this application, hand-DSP beats ML for the easy-but-precise task (hum pitch), and ML earns its keep only for the harder noisy task (pitch inside music) — and even there only as a fallback. Reach for the model when the DSP visibly fails, not before.

---

## 3. Failure modes specific to browser audio ML

- **`getUserMedia` defaults silently corrupt features.** `echoCancellation`, `noiseSuppression`, and `autoGainControl` are **ON by default** and are designed for *speech intelligibility on calls*, not analysis. AGC will pump your amplitude; noise suppression will gate and spectrally distort a quiet hum. **Request them OFF** (`{ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }`) — the existing artifact's mic setup already does this, which is correct and worth keeping.
- **Main-thread contention → jank.** FFT or inference on the main thread fights the 60fps render loop. Architectural fix: DSP in **AudioWorklet**, heavy non-realtime work in a **Web Worker**, and if canvas rendering ever competes, **OffscreenCanvas** in a worker. Keep the audio thread allocation-free.
- **GC pauses in the audio callback.** Allocating objects/arrays per render quantum triggers garbage collection that blows the 3 ms budget and clicks the audio. Pre-allocate all buffers once; never `new` inside the process callback. (This is the single most common real-time-audio bug.)
- **Sample-rate inconsistency.** Devices run 44.1 kHz or 48 kHz; CREPE/SPICE expect 16 kHz and need resampling, and the CREPE demo explicitly notes browser resampling imperfection degrades it. Any pitch math must read `audioContext.sampleRate`, not assume a value.
- **Safari/iOS quirks.** AudioContext **requires a user gesture to start** and **suspends aggressively** in the background. Must wire `resume()` to an explicit tap and handle suspend/resume. (Again, partially handled in the existing artifact.)
- **Distribution shift, clean → noisy room.** A studio-quiet hum and a hum over a fan/AC are different signals; autocorrelation degrades gracefully (lower clarity score) while a model trained on clean data may fail confidently. The mitigation is the same as the project's whole ethos: **carry a confidence/clarity score and abstain when it's low** rather than reporting a wrong pitch.

---

## 4. Privacy architecture — the load-bearing section

The commitment: raw audio never leaves the device; only derived features may ever be aggregated (and only opt-in, per the journal-noticer design). Two findings make this precise:

### What is safe vs. unsafe to aggregate

- **UNSAFE — MFCCs and mel-spectrograms are invertible to intelligible speech.** Multiple published methods reconstruct waveforms from MFCCs (inverse-DCT → NNLS → Griffin-Lim phase recovery → inverse STFT), reaching **~93% STOI intelligibility / PESQ ~4.0 from high-resolution MFCCs** (Speech Reconstruction from MFCC, 2015/2022). Audio features also carry biometric speaker identity, age, gender, health, and origin (Pizzi et al. 2023 demonstrate model-inversion attacks reconstructing speaker voiceprints). **Therefore MFCCs, mel-spectrograms, and learned embeddings must never be transmitted off-device.** If you ever compute them, they stay local.
- **SAFE — scalar acoustic summaries the project actually needs.** A single **fundamental frequency** value, a **spectral centroid scalar**, a **coupling score** (the artifact's own sysAmp), an **anti-resonance flag**, a **session-level "found a non-obvious state" boolean** — none of these reconstruct speech or identify a speaker. These are exactly the features the synthetic-session generator and journal-noticer already operate on. The privacy architecture and the project's actual data needs are aligned by luck and good instinct.

### The architecture

The principle from the federated-learning / DP literature (Apple local DP, Gboard DP-FTRL) is **"privatize before aggregation"** — clip and noise each contribution on-device before it's ever summed. For this project that means:

1. **All audio DSP runs client-side**, in the AudioWorklet/worker. Raw samples live only in the audio graph and are never serialized.
2. **Only scalar, non-invertible session summaries** are eligible for the (opt-in) journal-noticer aggregate — the same clip-bounded sufficient-statistics store the noticer design already specifies.
3. **On-device-only is the default.** Cross-user learning happens only through the opt-in aggregate of safe scalars. There is no federated-learning gradient upload and no feature upload in v1; if that's ever added, it's a new explicit consent surface, and even then only over the safe-scalar set.

What you give up by staying on-device-only: no automatic cross-user model improvement. For this project that's not a loss — the journal-noticer is a *noticer over sufficient statistics*, not a trained model, precisely so that contributions remain deletable and non-invertible (see `JOURNAL_NOTICER_DESIGN.md`). The audio architecture inherits that stance cleanly.

---

## 5. Reference architecture

Where each piece runs, what crosses each boundary:

```
┌─ Audio render thread (AudioWorkletProcessor, WASM) ──────────┐
│  • raw mic / decoded file samples (NEVER leave here)         │
│  • YIN/MPM pitch detector (hum)  OR  FFT peak-pick (music)   │
│  • per-frame scalar features: F0, clarity, centroid          │
│  • pre-allocated buffers, zero GC                            │
└───────────────┬──────────────────────────────────────────────┘
                │ postMessage: scalars only (F0, clarity, centroid)
                ▼
┌─ Main thread ────────────────────────────────────────────────┐
│  • receives scalars, updates drivers[] (internal / external) │
│  • physics.js → renderer.js (unchanged contract)             │
│  • audio is another source of drivers[]                      │
└───────────────┬──────────────────────────────────────────────┘
                │ (ONLY if user opts in)
                │ session summary: {found_nonobvious: bool,
                │   max_sysamp, max_ar, dominant_F0_bucket}
                ▼
┌─ Journal-noticer aggregate (off-device, opt-in) ─────────────┐
│  • clip + privatize before summation                         │
│  • safe scalars only — nothing invertible to speech          │
│  • deletable: subtract session, re-render                    │
└──────────────────────────────────────────────────────────────┘
```

The audio layer plugs into **`drivers[]`**: mic/file update internal or external origins; physics and rendering consume the combined driver set. Multi-driver, field, and env layers are **shipped** (see [ARCHITECTURE.md](ARCHITECTURE.md)).

### When NOT to use ML at all (the summary judgment)

For this project, hand-written DSP is *strictly better* than ML for everything except noise-robust pitch-in-music, because:
- the hum is monophonic and clean (YIN is solved, ~5ms, no load cost, no inversion risk);
- the features the artifact needs are cheap spectral scalars, not learned embeddings;
- the privacy commitment is easiest to keep when there's no model and no embedding to leak;
- the only place ML wins (SPICE for pitch inside backing music) is a *fallback to earn later*, not a v1 dependency.

This is the rare case where the simplest architecture is also the most capable, the most private, and the most aligned with the project's ethos. Build the DSP path; hold the models in reserve.

---

## Primary sources

- W3C Web Audio API spec; AudioWorklet design pattern (Choi, Chrome for Developers, 2018); MDN AudioWorklet docs.
- de Cheveigné & Kawahara, "YIN, a fundamental frequency estimator for speech and music," JASA 2002.
- McLeod & Wyvill, "A smarter way to find pitch" (MPM), ICMC 2005.
- Kim, Salamon, Li, Bello, "CREPE: A Convolutional Representation for Pitch Estimation," ICASSP 2018.
- Gfeller et al., "SPICE: Self-Supervised Pitch Estimation," IEEE TASLP 2019/2020; Google AI blog.
- Correya et al., "Audio and Music Analysis on the Web using Essentia.js," TISMIR / ISMIR 2020.
- Alvarado & Stowell, "Efficient Learning of Harmonic Priors for Pitch Detection in Polyphonic Music," 2017 (polyphonic difficulty).
- Speech Reconstruction from MFCC (nonnegative/sparse priors), 2015/2022 — MFCC invertibility.
- Pizzi et al., "Model Inversion Attacks on Automatic Speaker Recognition," 2023 — feature→identity risk.
- "Towards Privacy-Preserving Audio Classification Systems," 2024 — accuracy/privacy tradeoff, feature sensitivity.

*Cross-reference: `INTERFERENCE_MODE_DESIGN.md` (dominant-pitch decision), `JOURNAL_NOTICER_DESIGN.md` (clip-and-privatize aggregation, abstention ethos), `tools/synthetic_sessions/` (the safe-scalar session schema this pipeline would feed).*
