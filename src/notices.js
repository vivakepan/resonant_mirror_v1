/**
 * notices.js — AIN-RS-008 passive in-browser state notices
 *
 * Rule-based state machine that detects sustained resonance events and
 * surfaces past-tense recognitions in the UI. Strict guardrails:
 *   - Past-tense only. Never "try X" or "move to Y".
 *   - Only fires after a state has been *sustained* for SUSTAINED_MS.
 *   - Per-event cooldown prevents notice spam.
 *   - No ML, no weights, no user-behavior feedback loop.
 *
 * Three events tracked:
 *   whole_system  — sysAmp > 0.55, activeCount ≥ 5 (whole-system resonance)
 *   null_<Hz>     — spectral null active (α, geometric-mean notch)
 *   spatial_node  — field cancellation suppressing a zone (β)
 */

const SUSTAINED_MS = 3000;
const DISPLAY_MS   = 6000;
const COOLDOWN_MS  = 15000;

export class NoticeEngine {
  constructor() {
    this._states  = {};   // key → { enteredAt, firedAt }
    this._current = null; // { text, shownAt }
  }

  /**
   * Call once per frame (or throttled to ~4 Hz).
   * @param {object} s
   *   s.realT        — real wall-clock ms (Date.now())
   *   s.sysAmp       — 0..1
   *   s.activeCount  — integer
   *   s.arActive     — same shape as activeAntiResonance() return, or null
   *   s.spatialNode  — boolean
   * @returns {string|null} — text to show, or null
   */
  tick(s) {
    const now    = s.realT;
    const active = this._activeKey(s);

    if (active) {
      if (!this._states[active]) {
        this._states[active] = { enteredAt: now, firedAt: 0 };
      }
      const st     = this._states[active];
      const dwell  = now - st.enteredAt;
      const since  = now - st.firedAt;
      if (dwell >= SUSTAINED_MS && since >= COOLDOWN_MS) {
        st.firedAt     = now;
        this._current  = { text: this._textFor(s, active), shownAt: now };
      }
    } else {
      this._states = {};
    }

    if (this._current) {
      if (now - this._current.shownAt < DISPLAY_MS) return this._current.text;
      this._current = null;
    }
    return null;
  }

  _activeKey(s) {
    if (s.arActive && s.arActive.strength > 0.45) return `null_${s.arActive.ar.f | 0}`;
    if (s.sysAmp > 0.55 && s.activeCount >= 5)   return 'whole_system';
    if (s.spatialNode)                             return 'spatial_node';
    return null;
  }

  _textFor(s, key) {
    if (key === 'whole_system') {
      return `Whole-system resonance sustained — ${s.activeCount} zones in simultaneous harmonic response.`;
    }
    if (key === 'spatial_node') {
      return 'Zone at interference cancellation node — external source nulling internal response at this position.';
    }
    if (key.startsWith('null_')) {
      const a = s.arActive.ar.a.name.split(' ')[0];
      const b = s.arActive.ar.b.name.split(' ')[0];
      return `Spectral null sustained — drive is between the natural modes of ${a} and ${b}.`;
    }
    return null;
  }
}
