/**
 * Dual independent audio pipelines (REQ-006, REQ-007).
 *
 * Microphone and uploaded-song streams MUST be decoded, analyzed, and
 * tagged independently. They share a logical clock only after feature
 * extraction. They MUST NOT be mixed before analysis.
 */

import { SharedClock } from '../contracts/clock.js';
import { captureSettingsRecord, latencyMetadata, microphoneConstraints } from './captureSettings.js';
import { leakageAssessment } from './leakage.js';

export function assertIndependentBuffers(userSamples, referenceSamples) {
  if (userSamples && referenceSamples && userSamples.buffer && userSamples.buffer === referenceSamples.buffer) {
    throw new Error('Reference audio must not share a sample buffer with microphone analysis.');
  }
}

export function assertNotMixedBeforeAnalysis(userFrame, referenceFrame) {
  if (!userFrame || !referenceFrame) return;
  if (userFrame.source === referenceFrame.source) {
    throw new Error('User and reference frames must keep distinct source tags.');
  }
  if (userFrame.samples && referenceFrame.samples && userFrame.samples === referenceFrame.samples) {
    throw new Error('User and reference analysis must not share the same sample array.');
  }
}

export class IndependentStream {
  constructor(source) {
    if (source !== 'user' && source !== 'reference') {
      throw new Error('source must be user or reference');
    }
    this.source = source;
    this.sampleRate = null;
    this.lastSamples = null;
    this.lastTimestampSeconds = null;
  }

  ingest(samples, timestampSeconds, sampleRate) {
    this.lastSamples = samples;
    this.lastTimestampSeconds = timestampSeconds;
    this.sampleRate = sampleRate;
    return {
      source: this.source,
      samples,
      timestampSeconds,
      sampleRate,
    };
  }
}

export class DualPipeline {
  constructor({ clock = new SharedClock(), hopSeconds = 0.02 } = {}) {
    this.clock = clock;
    this.hopSeconds = hopSeconds;
    this.user = new IndependentStream('user');
    this.reference = new IndependentStream('reference');
    this.microphoneActive = false;
    this.referencePlaying = false;
    this.captureSettings = captureSettingsRecord();
    this.latency = latencyMetadata({ analysisHopSeconds: hopSeconds });
  }

  ingestUser(samples, audioTimeSeconds, sampleRate) {
    this.microphoneActive = true;
    return this.user.ingest(samples, this.clock.timestampSeconds(audioTimeSeconds), sampleRate);
  }

  ingestReference(samples, audioTimeSeconds, sampleRate) {
    this.referencePlaying = true;
    return this.reference.ingest(samples, this.clock.timestampSeconds(audioTimeSeconds), sampleRate);
  }

  pair(userPacket, referencePacket) {
    if (userPacket && referencePacket) {
      assertIndependentBuffers(userPacket.samples, referencePacket.samples);
    }
    const userTs = userPacket?.timestampSeconds ?? null;
    const refTs = referencePacket?.timestampSeconds ?? null;
    let alignment = null;
    if (userTs != null && refTs != null) {
      alignment = this.clock.align(
        userTs + this.clock.originSeconds,
        refTs + this.clock.originSeconds,
      );
    }
    return {
      user: userPacket ? { ...userPacket, source: 'user' } : null,
      reference: referencePacket ? { ...referencePacket, source: 'reference' } : null,
      alignment,
      leakage: leakageAssessment({
        referencePlaying: this.referencePlaying,
        microphoneActive: this.microphoneActive,
      }),
      latency: this.latency,
    };
  }

  sessionFields() {
    return {
      inputMode: this.referencePlaying ? 'microphone_plus_reference' : 'microphone',
      captureSettings: this.captureSettings,
      latency: this.latency,
    };
  }
}

/**
 * Browser adapter. Two AnalyserNodes, never one shared analyser for both
 * sources. Microphone is not routed to the speakers.
 */
export class DualAudioPipeline {
  constructor() {
    this.ctx = null;
    this.userAnalyser = null;
    this.referenceAnalyser = null;
    this.micStream = null;
    this.micSource = null;
    this.audioEl = null;
    this.referenceSource = null;
    this.userTime = null;
    this.referenceTime = null;
    this.pipeline = new DualPipeline();
    this.referenceFileName = null;
    this.ownsAudioElement = false;
  }

  async _ensureContext() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.userAnalyser = this.ctx.createAnalyser();
    this.referenceAnalyser = this.ctx.createAnalyser();
    this.userAnalyser.fftSize = 2048;
    this.referenceAnalyser.fftSize = 2048;
    this.userAnalyser.smoothingTimeConstant = 0;
    this.referenceAnalyser.smoothingTimeConstant = 0;
    this.userTime = new Float32Array(this.userAnalyser.fftSize);
    this.referenceTime = new Float32Array(this.referenceAnalyser.fftSize);
    this.pipeline.clock = new SharedClock({ originSeconds: this.ctx.currentTime, originKind: 'audioContext' });
    this.pipeline.latency = latencyMetadata({
      sampleRate: this.ctx.sampleRate,
      baseLatencySeconds: this.ctx.baseLatency ?? null,
      outputLatencySeconds: this.ctx.outputLatency ?? null,
    });
    this.pipeline.captureSettings = captureSettingsRecord(undefined, { sampleRate: this.ctx.sampleRate });
  }

  async startMicrophone(overrides = {}) {
    await this._ensureContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.stopMicrophone();
    this.micStream = await navigator.mediaDevices.getUserMedia(microphoneConstraints(overrides));
    this.micSource = this.ctx.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.userAnalyser);
    this.pipeline.microphoneActive = true;
    const track = this.micStream.getAudioTracks()[0];
    const settings = track?.getSettings?.() || {};
    this.pipeline.captureSettings = captureSettingsRecord(
      { ...ANALYSIS_FROM_TRACK(settings, overrides) },
      { sampleRate: this.ctx.sampleRate, deviceId: settings.deviceId || null },
    );
    return true;
  }

  stopMicrophone() {
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch { /* ignore */ }
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.pipeline.microphoneActive = false;
  }

  async loadReference(file) {
    await this._ensureContext();
    this._disconnectReferenceGraph({ pauseOwned: true });
    this.ownsAudioElement = true;
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.src = URL.createObjectURL(file);
    this.referenceFileName = file.name;
    this.referenceSource = this.ctx.createMediaElementSource(this.audioEl);
    this.referenceSource.connect(this.referenceAnalyser);
    this.referenceSource.connect(this.ctx.destination);
    return this.audioEl;
  }

  async attachReferenceMedia(element, fileName = 'media') {
    if (!element) return null;
    await this._ensureContext();
    this._disconnectReferenceGraph({ pauseOwned: true });
    this.ownsAudioElement = false;
    this.audioEl = element;
    this.referenceFileName = fileName;
    if (!element._rmv2MediaSource) {
      element._rmv2MediaSource = this.ctx.createMediaElementSource(element);
    }
    this.referenceSource = element._rmv2MediaSource;
    this.referenceSource.connect(this.referenceAnalyser);
    this.referenceSource.connect(this.ctx.destination);
    return this.audioEl;
  }

  playReference() {
    if (!this.audioEl) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.audioEl.play();
    this.pipeline.referencePlaying = true;
  }

  pauseReference() {
    if (this.audioEl && this.ownsAudioElement) this.audioEl.pause();
    this.pipeline.referencePlaying = false;
  }

  stopReference() {
    this.pauseReference();
    if (this.audioEl && this.ownsAudioElement) {
      this.audioEl.currentTime = 0;
    }
    this._disconnectReferenceGraph({ pauseOwned: false });
  }

  _disconnectReferenceGraph({ pauseOwned = false } = {}) {
    if (pauseOwned && this.ownsAudioElement && this.audioEl) {
      this.audioEl.pause();
    }
    if (this.referenceSource) {
      try { this.referenceSource.disconnect(); } catch { /* ignore */ }
      this.referenceSource = null;
    }
  }

  readWindows() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    let userPacket = null;
    let referencePacket = null;
    if (this.pipeline.microphoneActive && this.userAnalyser) {
      this.userAnalyser.getFloatTimeDomainData(this.userTime);
      userPacket = this.pipeline.ingestUser(this.userTime.slice(), t, this.ctx.sampleRate);
    }
    if (this.pipeline.referencePlaying && this.referenceAnalyser) {
      this.referenceAnalyser.getFloatTimeDomainData(this.referenceTime);
      referencePacket = this.pipeline.ingestReference(this.referenceTime.slice(), t, this.ctx.sampleRate);
    }
    return this.pipeline.pair(userPacket, referencePacket);
  }

  dispose() {
    this.stopMicrophone();
    this.stopReference();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

function ANALYSIS_FROM_TRACK(settings, overrides) {
  return {
    echoCancellation: overrides.echoCancellation ?? settings.echoCancellation ?? false,
    noiseSuppression: overrides.noiseSuppression ?? settings.noiseSuppression ?? false,
    autoGainControl: overrides.autoGainControl ?? settings.autoGainControl ?? false,
    channelCount: settings.channelCount ?? 1,
  };
}
