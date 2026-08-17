/**
 * Live piano and metronome engines. Synthesis stays deterministic;
 * scheduling uses the audio clock rather than wall-clock setTimeout.
 */

import {
  pianoMidi,
  metronomeClick,
  metronomeSchedule,
  clampBpm,
} from './piano.js';

function playSamples(ctx, samples, when, destination) {
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.getChannelData(0).set(samples);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(destination);
  src.start(when);
  return src;
}

export class PianoEngine {
  constructor(ctx, { destination = ctx.destination } = {}) {
    this.ctx = ctx;
    this.destination = destination;
    this.voices = new Map();
  }

  noteOn(midi, velocity = 0.38) {
    this.noteOff(midi, 0.01);
    const samples = pianoMidi(midi, this.ctx.sampleRate, 2.4, velocity);
    const gain = this.ctx.createGain();
    gain.gain.value = 1;
    gain.connect(this.destination);
    const src = playSamples(this.ctx, samples, this.ctx.currentTime, gain);
    this.voices.set(midi, { src, gain });
    return midi;
  }

  noteOff(midi, releaseSeconds = 0.08) {
    const voice = this.voices.get(midi);
    if (!voice) return;
    this.voices.delete(midi);
    const now = this.ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, Math.max(0.01, releaseSeconds / 3));
      voice.src.stop(now + releaseSeconds + 0.05);
    } catch {
      /* already stopped */
    }
  }

  allOff() {
    for (const midi of [...this.voices.keys()]) this.noteOff(midi, 0.04);
  }
}

export class MetronomeEngine {
  constructor(ctx, { destination = ctx.destination, bpm = 80, beatsPerMeasure = 4 } = {}) {
    this.ctx = ctx;
    this.destination = destination;
    this.bpm = clampBpm(bpm);
    this.beatsPerMeasure = beatsPerMeasure;
    this.running = false;
    this.nextNoteTime = 0;
    this.beatIndex = 0;
    this.timer = null;
    this.onBeat = null;
    this.lookaheadMs = 25;
    this.scheduleAheadSeconds = 0.12;
    this.clickCache = new Map();
  }

  setBpm(bpm) {
    this.bpm = clampBpm(bpm);
  }

  setMeter(beatsPerMeasure) {
    this.beatsPerMeasure = Math.max(1, Math.round(beatsPerMeasure));
  }

  _click(accent) {
    const key = accent ? 'accent' : 'beat';
    if (!this.clickCache.has(key)) {
      this.clickCache.set(key, metronomeClick(this.ctx.sampleRate, 0.045, { accent }));
    }
    return this.clickCache.get(key);
  }

  start() {
    if (this.running) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.running = true;
    this.beatIndex = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this._tick();
  }

  stop() {
    this.running = false;
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  toggle() {
    if (this.running) this.stop();
    else this.start();
    return this.running;
  }

  currentBeatInMeasure(now = this.ctx.currentTime) {
    if (!this.running) return -1;
    const period = 60 / this.bpm;
    const next = this.nextNoteTime;
    const elapsedBeats = Math.max(0, this.beatIndex - Math.ceil((next - now) / period));
    return elapsedBeats % this.beatsPerMeasure;
  }

  _tick() {
    if (!this.running) return;
    const { events, nextTime, nextBeat } = metronomeSchedule({
      bpm: this.bpm,
      fromTime: this.nextNoteTime,
      untilTime: this.ctx.currentTime + this.scheduleAheadSeconds,
      beatIndex: this.beatIndex,
      beatsPerMeasure: this.beatsPerMeasure,
    });
    for (const ev of events) {
      playSamples(this.ctx, this._click(ev.accent), ev.time, this.destination);
      if (this.onBeat) {
        const delayMs = Math.max(0, (ev.time - this.ctx.currentTime) * 1000);
        const beat = ev.beatInMeasure;
        const accent = ev.accent;
        setTimeout(() => this.onBeat({ beat, accent }), delayMs);
      }
    }
    this.nextNoteTime = nextTime;
    this.beatIndex = nextBeat;
    this.timer = setTimeout(() => this._tick(), this.lookaheadMs);
  }
}
