/**
 * ResonanceAnalyzer — formants and spectral envelope on a vocal frame.
 * Pitch and resonance remain distinct (REQ-019). Resonance is a trajectory (REQ-020).
 */

import { estimateFormants } from './formants.js';
import { createProvenance } from '../contracts/provenance.js';

export class ResonanceAnalyzer {
  analyzeFrame(frame, samples, sampleRate) {
    const f0 = frame.features.fundamentalFrequencyHertz;
    const result = estimateFormants(samples, sampleRate, { f0 });
    frame.features.formantsHertz = result.formantsHertz;
    frame.features.formantConfidence = result.formantConfidence;
    frame.features.spectralEnvelope = result.spectralEnvelope
      ? Array.from(result.spectralEnvelope.slice(0, 64))
      : null;
    for (const flag of result.qualityFlags) {
      if (!frame.qualityFlags.includes(flag)) frame.qualityFlags.push(flag);
    }
    frame.provenanceByField['features.formantsHertz'] = createProvenance({
      evidenceClass: result.unknown ? 'unknown' : 'derived',
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
