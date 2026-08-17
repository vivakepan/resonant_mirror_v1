/**
 * AcousticAnalyzer — deterministic feature frames (spec §7, Phase 2).
 * Machine learning MUST NOT be used to recreate these quantities.
 */

import { createProvenance } from '../contracts/provenance.js';
import { createVocalFrame, emptyInferences } from '../contracts/schemas.js';
import { estimatePitch } from './pitch.js';
import { relativeLevel } from './level.js';
import { spectralFeatures, harmonicity } from './spectral.js';
import { magnitudeSpectrum } from './fft.js';
import { centsError, freqToNote, formatPitchDisplay } from './signal.js';

export const ACOUSTIC_ALGORITHM_VERSION = 'dense-acoustics-1';

export class AcousticAnalyzer {
  constructor({ hopSeconds = 0.02, targetFrequencyHertz = null } = {}) {
    this.hopSeconds = hopSeconds;
    this.targetFrequencyHertz = targetFrequencyHertz;
    this.prevMag = null;
  }

  analyze(samples, { timestampSeconds, source, sampleRate }) {
    const qualityFlags = [];
    const level = relativeLevel(samples);
    if (level.relativeLevelDecibelsFullScale < -50) qualityFlags.push('low_microphone_level');
    if (samples.some((x) => Math.abs(x) >= 0.99)) qualityFlags.push('clipping');

    const pitch = estimatePitch(samples, sampleRate);
    if (pitch.frequencyHertz == null || pitch.confidence < 0.4) {
      qualityFlags.push('low_pitch_confidence');
      qualityFlags.push('insufficient_voiced_content');
    }

    const spectral = spectralFeatures(samples, sampleRate);
    const harm = pitch.frequencyHertz != null
      ? harmonicity(samples, sampleRate, pitch.frequencyHertz)
      : null;
    const { mag } = magnitudeSpectrum(samples);
    this.prevMag = mag;

    const note = pitch.frequencyHertz != null ? freqToNote(pitch.frequencyHertz) : freqToNote(null);
    const cents = pitch.frequencyHertz != null && this.targetFrequencyHertz
      ? centsError(pitch.frequencyHertz, this.targetFrequencyHertz)
      : note.centsDeviation;

    const features = {
      fundamentalFrequencyHertz: pitch.frequencyHertz,
      pitchConfidence: pitch.confidence,
      relativeLevelDecibelsFullScale: level.relativeLevelDecibelsFullScale,
      rmsAmplitude: level.rmsAmplitude,
      spectralCentroidHertz: spectral.spectralCentroidHertz,
      spectralRolloffHertz: spectral.spectralRolloffHertz,
      spectralTilt: spectral.spectralTilt,
      periodicity: pitch.periodicity,
      harmonicity: harm,
      formantsHertz: [],
      formantConfidence: [],
      centsError: cents,
      noteName: note.noteName,
      levelUnit: level.unit,
      isSoundPressureLevel: false,
    };

    const observed = timestampSeconds;
    const expires = timestampSeconds + this.hopSeconds * 6;
    const pitchProv = createProvenance({
      evidenceClass: pitch.frequencyHertz == null ? 'unknown' : 'derived',
      sourceIds: [`${source}:pcm`],
      algorithmVersion: pitch.algorithmVersion || ACOUSTIC_ALGORITHM_VERSION,
      observedAtSeconds: observed,
      expiresAtSeconds: expires,
      confidence: pitch.confidence,
      qualityFlags: qualityFlags.filter((f) => f === 'low_pitch_confidence' || f === 'insufficient_voiced_content'),
      sourceFieldPaths: ['features.fundamentalFrequencyHertz'],
    });
    const levelProv = createProvenance({
      evidenceClass: 'derived',
      sourceIds: [`${source}:pcm`],
      algorithmVersion: ACOUSTIC_ALGORITHM_VERSION,
      observedAtSeconds: observed,
      expiresAtSeconds: expires,
      sourceFieldPaths: ['features.relativeLevelDecibelsFullScale'],
    });

    const frame = createVocalFrame({
      timestampSeconds,
      source,
      features,
      inferences: emptyInferences(),
      qualityFlags,
      modelVersion: null,
      provenanceByField: {
        'features.fundamentalFrequencyHertz': pitchProv,
        'features.relativeLevelDecibelsFullScale': levelProv,
        'features.spectralCentroidHertz': createProvenance({
          evidenceClass: spectral.spectralCentroidHertz == null ? 'unknown' : 'derived',
          sourceIds: [`${source}:pcm`],
          algorithmVersion: ACOUSTIC_ALGORITHM_VERSION,
          observedAtSeconds: observed,
          expiresAtSeconds: expires,
          sourceFieldPaths: ['features.spectralCentroidHertz'],
        }),
      },
    });

    return {
      frame,
      display: {
        pitch: pitch.frequencyHertz != null
          ? formatPitchDisplay(pitch.frequencyHertz, this.targetFrequencyHertz)
          : 'unknown pitch',
        level: `${level.relativeLevelDecibelsFullScale.toFixed(1)} ${level.unit}`,
        levelUnitLabel: level.unitLabel,
      },
    };
  }
}
