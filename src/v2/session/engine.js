/**
 * Observation session engine — wires dual input through analysis to visuals.
 * Does not update model weights.
 */

import { DualPipeline } from '../audio/dualPipeline.js';
import { AcousticAnalyzer } from '../acoustic/analyzer.js';
import { ResonanceAnalyzer } from '../resonance/analyzer.js';
import { RespirationEstimator } from '../respiration/estimator.js';
import { RegistrationEstimator } from '../registration/estimator.js';
import { TensionEstimator } from '../tension/estimator.js';
import { SupportEstimator } from '../support/estimator.js';
import { composeVisualStates } from '../visualization/composeVisuals.js';
import { createSession } from '../contracts/schemas.js';
import { defaultFeatureFlags, assertNoLiveWeightUpdates } from '../contracts/featureFlags.js';
import { captureSettingsRecord } from '../audio/captureSettings.js';

export class ObservationEngine {
  constructor({ flags = defaultFeatureFlags(), sessionId = `sess-${Date.now()}` } = {}) {
    assertNoLiveWeightUpdates(flags);
    this.flags = flags;
    this.pipeline = new DualPipeline();
    this.userAcoustic = new AcousticAnalyzer();
    this.referenceAcoustic = new AcousticAnalyzer();
    this.resonance = new ResonanceAnalyzer();
    this.userBreath = new RespirationEstimator({ source: 'user' });
    this.referenceBreath = new RespirationEstimator({ source: 'reference' });
    this.registration = new RegistrationEstimator();
    this.tension = new TensionEstimator();
    this.support = new SupportEstimator();
    this.frames = [];
    this.session = createSession({
      sessionId,
      startedAt: new Date().toISOString(),
      inputMode: 'microphone',
      captureSettings: captureSettingsRecord(),
      modelVersions: { vocalEncoder: null, respiration: 'respiration-heuristic-0' },
    });
  }

  processPacket(packet, extras = {}) {
    if (!packet) return null;
    const analyzer = packet.source === 'reference' ? this.referenceAcoustic : this.userAcoustic;
    const { frame, display } = analyzer.analyze(packet.samples, {
      timestampSeconds: packet.timestampSeconds,
      source: packet.source,
      sampleRate: packet.sampleRate,
    });
    this.resonance.analyzeFrame(frame, packet.samples, packet.sampleRate);
    if (packet.source === 'reference') this.referenceBreath.infer(frame);
    else this.userBreath.infer(frame);
    if (packet.source === 'user') {
      this.registration.infer(frame);
      this.tension.infer(frame, extras);
      this.support.infer(frame, extras);
    }
    const visuals = composeVisualStates(frame, { flags: this.flags });
    this.frames.push(frame);
    return { frame, display, visuals };
  }

  end() {
    this.session.endedAt = new Date().toISOString();
    return this.session;
  }
}
