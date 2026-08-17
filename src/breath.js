/**
 * breath.js — Breath layer (§5b)
 *
 * Adds breath as a first-class autonomic rhythm alongside heartbeat and vagus.
 * Modulates: internal driver amplitude, vagus particle velocity, system aura
 * saturation, and a subtle chest sway in the silhouette. Together with the
 * existing heartbeat (~1 Hz independent) and vagus flow, the three rhythms
 * trace the parasympathetic axis.
 *
 * Three signal sources (chosen at runtime via setMode):
 *   - 'sine'  (default): synthesized cosine envelope, 12–15 BPM by default,
 *              ranges 0..1 (0 = full inhale, 1 = full exhale).
 *   - 'mic':   RMS envelope of microphone input (≥1 s window, low-passed).
 *              Inhale = quiet; exhale = vocal energy.
 *   - 'tap':   spacebar held during inhale, released during exhale.
 *
 * Per the plan §5b: synth is the recommended default — preserves silent-
 * practice phenomenology, no permission prompt, no posture shift.
 *
 * AIN-RS-015 (registered when this lands): "is synthesized breath enough to
 * make the visual feel embodied, or is mic/tap required for the phenomenology
 * to land?" — answer pending opt-in journal-noticer feedback.
 */

const DEFAULT_PERIOD_S = 5.0;  // 12 BPM
const MIN_PERIOD_S     = 3.0;  // 20 BPM
const MAX_PERIOD_S     = 8.0;  // 7.5 BPM

export class BreathEngine {
  constructor() {
    this.mode      = 'sine';
    this.periodMs  = DEFAULT_PERIOD_S * 1000;
    this.t0        = 0;
    this.tapState  = 0;          // 0 = exhale, 1 = inhale (held)
    this.tapHeldAt = 0;
    this.tapPhase  = 0;
    this.micCtx    = null;
    this.micRms    = 0;
    this.micEnv    = 0;
    this.enabled   = true;
  }

  setMode(mode) { this.mode = mode; }
  setPeriodSeconds(s) {
    this.periodMs = Math.max(MIN_PERIOD_S * 1000, Math.min(MAX_PERIOD_S * 1000, s * 1000));
  }
  setEnabled(b) { this.enabled = !!b; }

  // Returns a breath envelope in [0, 1]: 0 = inhale-top, 1 = exhale-mid.
  // The envelope is intentionally smooth — vocalization rides on the exhale
  // half so amplitude modulation should be gradual, not sharp.
  envelope(t) {
    if (!this.enabled) return 1;  // disabled → constant exhale = no modulation
    if (this.mode === 'sine') {
      const phase = ((t - this.t0) % this.periodMs) / this.periodMs;
      // Cosine envelope: starts at 0 (inhale-top), rises to 1 at half-period (exhale-mid),
      // returns to 0. Smooth across the inhale/exhale transition.
      return 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);
    }
    if (this.mode === 'tap') {
      // Tap: spacebar held = inhale → envelope decays toward 0; released = exhale → rises to 1.
      const target = this.tapState === 1 ? 0 : 1;
      // Simple low-pass on the binary target with a tau of 800 ms.
      const dt = t - this.tapHeldAt;
      const alpha = 1 - Math.exp(-dt / 800);
      this.tapPhase += alpha * (target - this.tapPhase);
      this.tapHeldAt = t;
      return this.tapPhase;
    }
    if (this.mode === 'mic') {
      // RMS envelope is updated externally via feedMicSample(); this just reads it.
      return this.micEnv;
    }
    return 1;
  }

  feedMicSample(rms) {
    // Smooth with a 1-second time constant. RMS rises during vocalization
    // (exhale phase), drops during silence (inhale phase).
    this.micRms = rms;
    const alpha = 0.02;
    this.micEnv += alpha * (rms - this.micEnv);
  }

  onTapDown(t) { this.tapState = 1; this.tapHeldAt = t; }
  onTapUp(t)   { this.tapState = 0; this.tapHeldAt = t; }

  // For UI display: a [-1, 1] signed phase indicating inhale (-) or exhale (+).
  signedPhase(t) {
    const e = this.envelope(t);
    return e * 2 - 1;
  }
}
