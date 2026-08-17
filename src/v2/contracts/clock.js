/**
 * Shared logical clock (spec REQ-008, REQ-011).
 *
 * Microphone and reference features MUST share one timestamp system.
 * Default dense tick is 20 milliseconds — PROVISIONAL and configurable.
 */

export const DEFAULT_TICK_SECONDS = 0.02; // PROVISIONAL

export class SharedClock {
  /**
   * @param {object} options
   * @param {number} [options.tickSeconds]
   * @param {number} [options.originSeconds] audio-context or wall origin
   * @param {string} [options.originKind] 'audioContext' | 'performance' | 'unix'
   */
  constructor({
    tickSeconds = DEFAULT_TICK_SECONDS,
    originSeconds = 0,
    originKind = 'audioContext',
  } = {}) {
    if (!(tickSeconds > 0) || tickSeconds > 1) {
      throw new Error('tickSeconds must be in (0, 1]');
    }
    this.tickSeconds = tickSeconds;
    this.originSeconds = originSeconds;
    this.originKind = originKind;
    this.startedAtUnixSeconds = Date.now() / 1000;
  }

  /** Quantize an audio-context time onto the shared tick grid. */
  tickIndex(audioTimeSeconds) {
    const rel = audioTimeSeconds - this.originSeconds;
    return Math.round(rel / this.tickSeconds);
  }

  timestampSeconds(audioTimeSeconds) {
    return this.tickIndex(audioTimeSeconds) * this.tickSeconds;
  }

  align(userAudioTime, referenceAudioTime) {
    return {
      userTick: this.tickIndex(userAudioTime),
      referenceTick: this.tickIndex(referenceAudioTime),
      withinOneTick: Math.abs(this.tickIndex(userAudioTime) - this.tickIndex(referenceAudioTime)) <= 1,
    };
  }

  metadata() {
    return {
      tickSeconds: this.tickSeconds,
      tickSecondsProvisional: true,
      originSeconds: this.originSeconds,
      originKind: this.originKind,
      startedAtUnixSeconds: this.startedAtUnixSeconds,
    };
  }
}

export function createSharedClock(options) {
  return new SharedClock(options);
}
