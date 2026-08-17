import { centsError, freqToNote } from './signal.js';

export const DEFAULT_IN_TUNE_CENTS = 35;

export function comparePitchToReference(userFrame, referenceFrame, {
  alignment = null,
  leakage = null,
  minUserConfidence = 0.4,
  minReferenceConfidence = 0.55,
  minReferenceHarmonicity = 0.25,
  inTuneCents = DEFAULT_IN_TUNE_CENTS,
} = {}) {
  if (leakage?.disableHighLevelComparisons) {
    return unavailable('reference leakage may dominate the microphone');
  }
  if (alignment && !alignment.withinOneTick) {
    return unavailable('singer and reference windows are not aligned');
  }

  const user = userFrame?.features;
  const reference = referenceFrame?.features;
  if (!referenceFrame) return unavailable('play a reference song');
  if (!(reference?.fundamentalFrequencyHertz > 0)) {
    return unavailable('reference melody unclear');
  }
  if ((reference.pitchConfidence ?? 0) < minReferenceConfidence) {
    return unavailable('reference melody confidence is low');
  }
  if (
    Number.isFinite(reference.harmonicity)
    && reference.harmonicity < minReferenceHarmonicity
  ) {
    return unavailable('reference is too polyphonic for a reliable target');
  }
  if (!userFrame || !(user?.fundamentalFrequencyHertz > 0)) {
    return unavailable('sing to compare');
  }
  if ((user.pitchConfidence ?? 0) < minUserConfidence) {
    return unavailable('singer pitch confidence is low');
  }

  const rawCents = centsError(
    user.fundamentalFrequencyHertz,
    reference.fundamentalFrequencyHertz,
  );
  // Melody comparison is octave-tolerant: the same note in another octave
  // remains a pitch-class match while the octave displacement is reported.
  const octaveDifference = Math.round(rawCents / 1200);
  const cents = rawCents - octaveDifference * 1200;
  const absoluteCents = Math.abs(cents);
  const direction = cents > 1 ? 'sharp' : cents < -1 ? 'flat' : 'centered';
  const classification = absoluteCents <= inTuneCents
    ? 'in_tune'
    : absoluteCents <= 70
      ? 'close'
      : 'off_pitch';
  const confidence = Math.min(user.pitchConfidence, reference.pitchConfidence);
  const userNote = freqToNote(user.fundamentalFrequencyHertz).noteName;
  const referenceNote = freqToNote(reference.fundamentalFrequencyHertz).noteName;

  return {
    available: true,
    evidenceClass: 'derived',
    cents,
    rawCents,
    absoluteCents,
    octaveDifference,
    direction,
    classification,
    inTune: classification === 'in_tune',
    confidence,
    userNote,
    referenceNote,
    timestampSeconds: userFrame.timestampSeconds,
    display: classification === 'in_tune'
      ? 'in tune'
      : `${Math.round(absoluteCents)}¢ ${direction}`,
    detail: `${userNote} vs ${referenceNote} · octave-tolerant`,
  };
}

export class PitchAccuracyTracker {
  constructor({ inTuneCents = DEFAULT_IN_TUNE_CENTS } = {}) {
    this.inTuneCents = inTuneCents;
    this.reset();
  }

  reset() {
    this.sampleCount = 0;
    this.inTuneCount = 0;
    this.absoluteCentsTotal = 0;
    this.lastTimestampSeconds = null;
  }

  add(comparison) {
    if (!comparison?.available) return this.summary();
    if (
      comparison.timestampSeconds != null
      && comparison.timestampSeconds === this.lastTimestampSeconds
    ) {
      return this.summary();
    }
    this.lastTimestampSeconds = comparison.timestampSeconds;
    this.sampleCount += 1;
    this.absoluteCentsTotal += comparison.absoluteCents;
    if (comparison.absoluteCents <= this.inTuneCents) this.inTuneCount += 1;
    return this.summary();
  }

  summary() {
    if (!this.sampleCount) {
      return {
        sampleCount: 0,
        inTunePercent: null,
        meanAbsoluteCents: null,
      };
    }
    return {
      sampleCount: this.sampleCount,
      inTunePercent: Math.round(this.inTuneCount / this.sampleCount * 100),
      meanAbsoluteCents: this.absoluteCentsTotal / this.sampleCount,
    };
  }
}

function unavailable(reason) {
  return {
    available: false,
    evidenceClass: 'unknown',
    reason,
    display: '—',
    detail: reason,
  };
}
