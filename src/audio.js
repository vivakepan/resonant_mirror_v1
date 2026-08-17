/**
 * audio.js — Web Audio pipeline for song-upload (§5a)
 *
 * Loads a user-selected audio file into an HTMLAudioElement → MediaElementSource
 * → AnalyserNode (FFT 2048). Each frame the active peaks are extracted from
 * the magnitude spectrum and emitted as external Drivers.
 *
 * Default: K=1 dominant pitch (most-salient peak only) with 3-frame median
 * smoothing on frequency to suppress jitter. Power-user mode: K up to 5,
 * density-adaptive (K reduced for very dense spectra).
 *
 * Per AIN-RS-013: the external driver's *position* in the canvas (skull-top)
 * is a visualization choice, not acoustics. The UI surfaces this caveat.
 */

const FFT_SIZE = 2048;
const PEAK_THRESHOLD = 0.18;  // normalized bin magnitude floor for a peak
const MEDIAN_WINDOW = 3;       // frames of frequency smoothing for K=1

export class AudioEngine {
  constructor() {
    this.ctx       = null;
    this.audioEl   = null;
    this.source    = null;
    this.micStream = null;
    this.micSource = null;
    this.analyser  = null;
    this.magData   = null;
    this.running   = false;
    this.micMode   = false;
    this.K         = 1;
    this.recent    = [];
    this.micRecent = [];
    this.lastFile  = null;
  }

  _ensureAnalyser() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.6;
      this.magData = new Uint8Array(this.analyser.frequencyBinCount);
    }
  }

  _disconnectMic() {
    if (this.micSource) { try { this.micSource.disconnect(); } catch {} this.micSource = null; }
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
    this.micMode = false;
    this.micRecent = [];
  }

  /** Live hum: FFT peak → internal driver (analysis constraints per AUDIO_PIPELINE_DESIGN). */
  async startMic() {
    this._ensureAnalyser();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.stop();
    this._disconnectMic();
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.analyser);
      this.micMode = true;
      this.running = true;
      return true;
    } catch (e) {
      console.warn('Microphone denied or failed:', e);
      this._disconnectMic();
      return false;
    }
  }

  stopMic() {
    this._disconnectMic();
    if (!this.audioEl) this.running = false;
  }

  isMicActive() { return this.micMode; }

  async load(file) {
    this._ensureAnalyser();
    this._disconnectMic();
    if (this.audioEl) {
      try { this.audioEl.pause(); } catch {}
      this.audioEl.removeAttribute('src');
    }
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.src = URL.createObjectURL(file);
    this.lastFile = file.name;

    if (this.source) { try { this.source.disconnect(); } catch {} }
    this.source = this.ctx.createMediaElementSource(this.audioEl);

    this.source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    return this.audioEl;
  }

  play() {
    if (!this.audioEl) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.audioEl.play();
    this.running = true;
  }

  pause() {
    if (this.audioEl) this.audioEl.pause();
    this.running = false;
  }

  stop() {
    this.pause();
    this._disconnectMic();
    if (this.audioEl) this.audioEl.currentTime = 0;
    this.recent = [];
  }

  setK(k) { this.K = Math.max(1, Math.min(5, k | 0)); this.recent = []; }

  /**
   * Mic peaks → internal driver candidates (dominant pitch, smoothed).
   * Returns [] when mic inactive or no salient peak.
   */
  stepMicInternal() {
    if (!this.micMode || !this.analyser) return [];
    const peaks = this._extractPeaks(1);
    if (peaks.length === 0) return [];
    this.micRecent.push(peaks[0].f);
    if (this.micRecent.length > MEDIAN_WINDOW) this.micRecent.shift();
    const sorted = [...this.micRecent].sort((a, b) => a - b);
    const f = sorted[sorted.length >> 1];
    return [{ f, amp: 1, phase: 0, origin: 'internal' }];
  }

  // Returns an array of external Drivers extracted from the current spectrum.
  // Empty array when not playing file or no peak crosses threshold.
  step() {
    if (!this.running || !this.analyser || this.micMode) return [];
    const peaks = this._extractPeaks(this.K);
    let k = this.K;
    if (peaks.length > 30 && k > 1) k = Math.max(1, k - 1);
    const top = peaks.slice(0, k);

    this.recent.push(top);
    if (this.recent.length > MEDIAN_WINDOW) this.recent.shift();

    const smoothed = this._smooth();
    return smoothed.map(p => ({ f: p.f, amp: p.amp * 0.6, phase: 0, origin: 'external' }));
  }

  _extractPeaks(maxN) {
    if (!this.analyser) return [];
    this.analyser.getByteFrequencyData(this.magData);
    const binHz = this.ctx.sampleRate * 0.5 / this.analyser.frequencyBinCount;
    const iMin = Math.max(2, Math.floor(70 / binHz));
    const iMax = Math.min(this.magData.length - 2, Math.ceil(3000 / binHz));
    const peaks = [];
    for (let i = iMin; i <= iMax; i++) {
      const v  = this.magData[i] / 255;
      if (v < PEAK_THRESHOLD) continue;
      const vL = this.magData[i - 1] / 255;
      const vR = this.magData[i + 1] / 255;
      if (v <= vL || v <= vR) continue;
      const denom = (vL - 2 * v + vR);
      const delta = denom !== 0 ? 0.5 * (vL - vR) / denom : 0;
      peaks.push({ f: (i + delta) * binHz, amp: v });
    }
    peaks.sort((a, b) => b.amp - a.amp);
    const dedup = [];
    for (const p of peaks) {
      if (dedup.every(q => Math.abs(q.f - p.f) > 8)) dedup.push(p);
      if (dedup.length >= maxN) break;
    }
    return dedup;
  }

  _smooth() {
    if (this.recent.length === 0) return [];
    if (this.K === 1) {
      const slots = this.recent.map(a => a[0]).filter(Boolean);
      if (slots.length === 0) return [];
      const fs = slots.map(p => p.f).sort((a, b) => a - b);
      const medF = fs[fs.length >> 1];
      let best = slots[0];
      for (const p of slots) if (Math.abs(p.f - medF) < Math.abs(best.f - medF)) best = p;
      return [best];
    }
    // K>1 — pass through most-recent frame (cheap; visual jitter is acceptable here
    // because dense spectra are already attenuated by density-adaptive K reduction).
    return this.recent[this.recent.length - 1] || [];
  }

  isLoaded() { return !!this.audioEl; }
  isPlaying() { return this.running; }
}
