/**
 * ResonanceAnalyzer — formants and spectral envelope on a vocal frame.
 * Pitch and resonance remain distinct (REQ-019). Resonance is a trajectory (REQ-020).
 */

import { estimateFormants } from './formants.js';
import { createProvenance } from '../contracts/provenance.js';

export class ResonanceAnalyzer {
  constructor() {
    this.prevHz = null;
  }

  analyzeFrame(frame, samples, sampleRate) {
    const f0 = frame.features.fundamentalFrequencyHertz;
    const result = estimateFormants(samples, sampleRate, { f0 });
    let hz = result.formantsHertz;
    if (!result.unknown && this.prevHz) {
      hz = hz.map((value, i) => {
        const prev = this.prevHz[i];
        if (!(value > 0) || !(prev > 0) || Math.abs(value - prev) > 700) return value;
        return prev * 0.55 + value * 0.45;
      });
    }
    this.prevHz = result.unknown ? null : hz.map((value) => (value > 0 ? value : null));
    frame.features.formantsHertz = hz;
    frame.features.formantConfidence = result.formantConfidence;
    frame.features.spectralEnvelope = result.spectralEnvelope
      ? Array.from(result.spectralEnvelope.slice(0, 64))
      : null;
    for (const flag of result.qualityFlags) {
      if (!frame.qualityFlags.includes(flag)) frame.qualityFlags.push(flag);
    }
    const evidenceClass = result.unknown
      ? 'unknown'
      : result.fallback
        ? 'inferred'
        : 'derived';
    frame.provenanceByField['features.formantsHertz'] = createProvenance({
      evidenceClass,
      sourceIds: [`${frame.source}:pcm`],
      algorithmVersion: result.algorithmVersion,
      observedAtSeconds: frame.timestampSeconds,
      expiresAtSeconds: frame.timestampSeconds + 0.25,
      confidence: result.unknown ? 0 : Math.min(...result.formantConfidence.filter((c) => c > 0), 1),
      qualityFlags: result.qualityFlags,
      sourceFieldPaths: ['features.formantsHertz'],
    });
    return result;
  }
}
