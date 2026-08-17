/**
 * Simulated respiratory pose. Microphone audio does not measure these
 * displacements; the pose is a teaching animation driven by an inferred
 * respiratory class (REQ-042, REQ-043).
 */

import { tractConfigurationFromFormants } from '../resonance/tractShape.js';
import { mouthArticulationFromAcoustics } from '../resonance/mouthArticulation.js';

export const REST_POSE = Object.freeze({
  lungVolume: 0.38,
  diaphragmDescent: 0.32,
  ribExpansion: 0.28,
  abdominalExpansion: 0.22,
  clavicleRise: 0.08,
  glottisOpen: 0.45,
  mouthOpen: 0.12,
  jawDrop: 0.12,
  lipSpread: 0.28,
  jawRetract: 0,
  headTuck: 0,
  flowDirection: 0,
  flowRate: 0,
  nasalShare: 0.45,
});

/** Residual interior↔exterior leak while the net breath is held. */
export const HOLD_TIDAL_FLOW = 0.22;

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t);
}

function smoothstep(t) {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
}

/**
 * Calm 12-second idle loop shown before microphone capture starts:
 * 4 s inhale · 1 s pause · 6 s exhale · 1 s pause.
 *
 * This is a simulated orientation demo, never microphone evidence.
 */
export function defaultBreathDemo(timeMs) {
  const cycleSeconds = 12;
  const t = ((timeMs / 1000) % cycleSeconds + cycleSeconds) % cycleSeconds;
  let className;
  let fill;
  let flowRate;
  let glottisOpen;

  if (t < 4) {
    className = 'inhale';
    const p = smoothstep(t / 4);
    fill = p;
    flowRate = Math.sin(p * Math.PI) * 0.62;
    glottisOpen = lerp(0.3, 0.88, p);
  } else if (t < 5) {
    className = 'pause';
    const p = smoothstep(t - 4);
    fill = 1;
    flowRate = HOLD_TIDAL_FLOW;
    glottisOpen = lerp(0.88, 0.3, p);
  } else if (t < 11) {
    className = 'unphonated_exhale';
    const p = smoothstep((t - 5) / 6);
    fill = 1 - p;
    flowRate = Math.sin(p * Math.PI) * 0.48;
    glottisOpen = 0.3 + Math.sin(p * Math.PI) * 0.28;
  } else {
    className = 'pause';
    fill = 0;
    flowRate = HOLD_TIDAL_FLOW;
    glottisOpen = 0.3;
  }

  return {
    className,
    phaseSeconds: t,
    evidenceClass: 'simulated',
    label: 'idle breathing demo · simulated',
    pose: {
      lungVolume: lerp(0.24, 0.9, fill),
      diaphragmDescent: lerp(0.18, 0.88, fill),
      ribExpansion: lerp(0.18, 0.86, fill),
      abdominalExpansion: lerp(0.14, 0.74, fill),
      clavicleRise: lerp(0.05, 0.4, fill),
      glottisOpen,
      mouthOpen: lerp(0.1, 0.22, glottisOpen),
      jawDrop: lerp(0.08, 0.16, glottisOpen),
      flowDirection: className === 'inhale' ? -1 : className === 'unphonated_exhale' ? 1 : 0,
      flowRate,
      nasalShare: className === 'inhale' ? 0.7 : 0.35,
    },
  };
}

export function snapshotPoseForClass(className) {
  switch (className) {
    case 'inhale':
      return {
        lungVolume: 0.88,
        diaphragmDescent: 0.86,
        ribExpansion: 0.84,
        abdominalExpansion: 0.72,
        clavicleRise: 0.42,
        glottisOpen: 0.88,
        mouthOpen: 0.2,
        jawDrop: 0.14,
        flowDirection: -1,
        flowRate: 0.9,
        nasalShare: 0.7,
      };
    case 'phonated_exhale':
      return {
        lungVolume: 0.48,
        diaphragmDescent: 0.4,
        ribExpansion: 0.36,
        abdominalExpansion: 0.28,
        clavicleRise: 0.12,
        glottisOpen: 0.14,
        mouthOpen: 0.86,
        jawDrop: 0.78,
        flowDirection: 1,
        flowRate: 0.62,
        nasalShare: 0.12,
      };
    case 'unphonated_exhale':
      return {
        lungVolume: 0.28,
        diaphragmDescent: 0.22,
        ribExpansion: 0.2,
        abdominalExpansion: 0.16,
        clavicleRise: 0.06,
        glottisOpen: 0.55,
        mouthOpen: 0.28,
        jawDrop: 0.2,
        flowDirection: 1,
        flowRate: 0.7,
        nasalShare: 0.35,
      };
    case 'pause':
      return {
        ...REST_POSE,
        lungVolume: 0.52,
        diaphragmDescent: 0.44,
        ribExpansion: 0.4,
        abdominalExpansion: 0.32,
        flowDirection: 0,
        flowRate: HOLD_TIDAL_FLOW,
        glottisOpen: 0.28,
        mouthOpen: 0.08,
        jawDrop: 0.1,
      };
    default:
      return { ...REST_POSE };
  }
}

/**
 * Continuous mechanism: lung volume integrates over time, then the
 * diaphragm, ribs, abdomen, and clavicles follow it. Inhale fills
 * quickly; phonated exhale empties slowly, the way a sung phrase uses air.
 */
export class BreathKinematics {
  constructor() {
    this.pose = { ...REST_POSE };
    this.lastMs = null;
    this.className = 'unknown';
  }

  step(className, timeMs) {
    const dt = this.lastMs == null ? 1 / 60 : Math.min(0.05, Math.max(0, (timeMs - this.lastMs) / 1000));
    this.lastMs = timeMs;
    this.className = className || 'unknown';
    const p = this.pose;

    switch (this.className) {
      case 'inhale':
        p.lungVolume = clamp(p.lungVolume + 1.45 * dt);
        p.flowDirection = lerp(p.flowDirection, -1, 10 * dt);
        p.flowRate = lerp(p.flowRate, 0.55 + 0.45 * (1 - p.lungVolume), 8 * dt);
        p.glottisOpen = lerp(p.glottisOpen, 0.9, 9 * dt);
        p.mouthOpen = lerp(p.mouthOpen, 0.2, 8 * dt);
        p.jawDrop = lerp(p.jawDrop, 0.14, 7 * dt);
        p.nasalShare = lerp(p.nasalShare, 0.72, 4 * dt);
        break;
      case 'phonated_exhale':
        p.lungVolume = clamp(p.lungVolume - 0.26 * dt, 0.1, 1);
        p.flowDirection = lerp(p.flowDirection, 1, 10 * dt);
        p.flowRate = lerp(p.flowRate, 0.45 + 0.4 * p.lungVolume, 6 * dt);
        p.glottisOpen = lerp(p.glottisOpen, 0.12, 10 * dt);
        p.mouthOpen = lerp(p.mouthOpen, 0.82, 10 * dt);
        p.jawDrop = lerp(p.jawDrop, 0.7, 8 * dt);
        p.nasalShare = lerp(p.nasalShare, 0.1, 4 * dt);
        break;
      case 'unphonated_exhale':
        p.lungVolume = clamp(p.lungVolume - 0.85 * dt, 0.08, 1);
        p.flowDirection = lerp(p.flowDirection, 1, 10 * dt);
        p.flowRate = lerp(p.flowRate, 0.75, 8 * dt);
        p.glottisOpen = lerp(p.glottisOpen, 0.58, 8 * dt);
        p.mouthOpen = lerp(p.mouthOpen, 0.26, 8 * dt);
        p.jawDrop = lerp(p.jawDrop, 0.18, 7 * dt);
        p.nasalShare = lerp(p.nasalShare, 0.38, 4 * dt);
        break;
      case 'pause':
        p.flowDirection = lerp(p.flowDirection, 0, 8 * dt);
        p.flowRate = lerp(p.flowRate, HOLD_TIDAL_FLOW, 8 * dt);
        p.glottisOpen = lerp(p.glottisOpen, 0.28, 5 * dt);
        p.mouthOpen = lerp(p.mouthOpen, 0.08, 8 * dt);
        p.jawDrop = lerp(p.jawDrop, 0.1, 6 * dt);
        break;
      default:
        p.lungVolume = lerp(p.lungVolume, REST_POSE.lungVolume, 1.6 * dt);
        p.flowDirection = lerp(p.flowDirection, 0, 6 * dt);
        p.flowRate = lerp(p.flowRate, 0, 8 * dt);
        p.glottisOpen = lerp(p.glottisOpen, REST_POSE.glottisOpen, 4 * dt);
        p.mouthOpen = lerp(p.mouthOpen, REST_POSE.mouthOpen, 5 * dt);
        p.jawDrop = lerp(p.jawDrop, REST_POSE.jawDrop, 5 * dt);
        p.nasalShare = lerp(p.nasalShare, REST_POSE.nasalShare, 3 * dt);
        break;
    }

    const follow = this.className === 'unknown' ? 3.2 * dt : 7.5 * dt;
    p.diaphragmDescent = lerp(p.diaphragmDescent, 0.12 + 0.82 * p.lungVolume, follow);
    p.ribExpansion = lerp(p.ribExpansion, 0.1 + 0.84 * p.lungVolume, follow * 0.9);
    p.abdominalExpansion = lerp(p.abdominalExpansion, 0.08 + 0.7 * p.lungVolume, follow * 0.75);
    p.clavicleRise = lerp(p.clavicleRise, 0.04 + 0.42 * p.lungVolume, follow * 0.7);
    return p;
  }
}

export function poseFromBreathInputs({
  className = 'unknown',
  diaphragmOffset = null,
  ribExpansion = null,
  pose = null,
} = {}) {
  if (pose) return { ...REST_POSE, ...pose };
  const snap = snapshotPoseForClass(className);
  if (diaphragmOffset != null) snap.diaphragmDescent = clamp(Number(diaphragmOffset));
  if (ribExpansion != null) snap.ribExpansion = clamp(Number(ribExpansion));
  snap.lungVolume = clamp(0.2 + 0.7 * snap.ribExpansion);
  snap.abdominalExpansion = clamp(0.1 + 0.65 * snap.ribExpansion);
  snap.clavicleRise = clamp(0.05 + 0.4 * snap.ribExpansion);
  return snap;
}

export function voiceActivity(features = {}) {
  const rms = clamp(Number(features.rmsAmplitude) || 0);
  const periodicity = clamp(Number(features.periodicity) || 0);
  const f0 = Number(features.fundamentalFrequencyHertz) || 0;
  const formants = Array.isArray(features.formantsHertz) ? features.formantsHertz : [];
  const f1 = Number(formants.find((hz) => hz > 0)) || 0;
  const f2 = Number(formants[1]) || 0;
  const pitchConfidence = clamp(Number(features.pitchConfidence) || 0);
  const centroid = Number(features.spectralCentroidHertz) || 0;
  const db = Number(features.relativeLevelDecibelsFullScale);
  const harm = Number(features.harmonicity);
  const formantVoice = f1 > 220 && f1 < 1200 && f2 > 550 && f2 < 3400 && f2 > f1 + 120;
  const pitchOk = f0 > 70 && f0 < 1400 && (pitchConfidence > 0.18 || periodicity > 0.32);
  const voiced = rms > 0.008 && periodicity > 0.28 && f0 > 60;
  const pitchedInstrument = voiced
    && !formantVoice
    && (
      (Number.isFinite(harm) && harm > 0.65)
      || (periodicity > 0.75 && pitchConfidence > 0.55 && pitchOk)
    );
  const energy = clamp(rms * 6.2);
  const sung = (voiced && !pitchedInstrument)
    || (formantVoice && periodicity > 0.2 && pitchConfidence > 0.18 && rms > 0.006);
  const distorted = !sung
    && !pitchedInstrument
    && rms > 0.045
    && periodicity < 0.32
    && (formantVoice || (centroid > 900 && centroid < 5200 && (!(Number.isFinite(db)) || db > -32)));
  const percussion = rms > 0.05 && periodicity < 0.22 && !sung && !distorted && !formantVoice && !(f0 > 60);
  const breathNoise = !sung && !pitchedInstrument && !percussion
    && rms > 0.0018
    && periodicity < 0.3
    && !(f0 > 70 && pitchConfidence > 0.35);
  const vocalness = sung ? 1 : distorted ? 0.88 : percussion || pitchedInstrument ? 0 : breathNoise ? 0.2 : 0;
  return {
    rms,
    periodicity,
    f0,
    f1,
    f2,
    voiced,
    energy,
    sung,
    distorted,
    percussion,
    pitchedInstrument,
    breathNoise,
    formantVoice,
    vocalness,
  };
}

/**
 * Breath, jaw, and mouth follow the vocalist's acoustic envelope in
 * near-real time. Attack is fast so onsets open the mouth with the
 * phrase; release is short enough to close between lines.
 */
export class VoiceSyncedBreath {
  constructor() {
    this.pose = { ...REST_POSE, mouthOpen: 0.1, jawDrop: 0.12 };
    this.envelope = 0;
    this.silenceSeconds = 0;
    this.lastMs = null;
    this.lastRms = 0;
    this.heldMouth = 0.08;
    this.heldJaw = 0.1;
    this.className = 'pause';
  }

  step(features = {}, timeMs = 0, extras = {}) {
    const dt = this.lastMs == null ? 1 / 60 : Math.min(0.05, Math.max(0, (timeMs - this.lastMs) / 1000));
    this.lastMs = timeMs;
    const v = voiceActivity(features);
    const p = this.pose;
    const resp = extras.respirationClass;
    const dRms = v.rms - this.lastRms;
    this.lastRms = v.rms;
    const envTarget = v.sung
      ? Math.max(v.energy, v.periodicity * 0.55)
      : v.distorted
        ? Math.max(v.energy * 0.92, 0.58)
        : 0;
    const envRate = envTarget > this.envelope ? 32 : 16;
    this.envelope = lerp(this.envelope, envTarget, Math.min(1, envRate * dt));
    if (v.sung || v.distorted || this.envelope > 0.08) this.silenceSeconds = 0;
    else this.silenceSeconds += dt;

    const art = mouthArticulationFromAcoustics(features, {
      sung: v.sung,
      distorted: v.distorted,
      pitchedInstrument: v.pitchedInstrument,
      percussion: v.percussion,
      techniqueId: extras.techniqueId || null,
    });
    const tract = art.tract || tractConfigurationFromFormants(features.formantsHertz || [], {
      spectralCentroidHertz: Number(features.spectralCentroidHertz) || 0,
    });
    const phonating = v.sung || v.distorted || this.envelope > 0.16;
    const restMouth = 0.06;
    const restJaw = 0.08;
    const mouthTarget = phonating ? art.mouthOpen : restMouth;
    const jawTarget = phonating ? art.jawDrop : restJaw;
    if (phonating) {
      const decay = art.hold ? 0.06 : 0.28;
      this.heldMouth = Math.max(mouthTarget, this.heldMouth - decay * dt);
      this.heldJaw = Math.max(jawTarget, this.heldJaw - decay * dt);
    } else {
      this.heldMouth = lerp(this.heldMouth, mouthTarget, Math.min(1, 7 * dt));
      this.heldJaw = lerp(this.heldJaw, jawTarget, Math.min(1, 7 * dt));
    }
    p.mouthOpen = lerp(p.mouthOpen, this.heldMouth, Math.min(1, 28 * dt));
    p.jawDrop = lerp(p.jawDrop, this.heldJaw, Math.min(1, 22 * dt));
    p.lipSpread = lerp(p.lipSpread ?? 0.28, art.lipSpread ?? 0.28, Math.min(1, 14 * dt));

    const follow = 8 * dt;
    const applyFollow = () => {
      p.diaphragmDescent = lerp(p.diaphragmDescent, 0.12 + 0.82 * p.lungVolume, follow);
      p.ribExpansion = lerp(p.ribExpansion, 0.1 + 0.84 * p.lungVolume, follow * 0.9);
      p.abdominalExpansion = lerp(p.abdominalExpansion, 0.08 + 0.7 * p.lungVolume, follow * 0.75);
      p.clavicleRise = lerp(p.clavicleRise, 0.04 + 0.42 * p.lungVolume, follow * 0.7);
    };

    if (v.pitchedInstrument || v.percussion) {
      this.className = 'pause';
      this.silenceSeconds = 0;
      this.heldMouth = lerp(this.heldMouth, 0.06, Math.min(1, 14 * dt));
      this.heldJaw = lerp(this.heldJaw, 0.08, Math.min(1, 12 * dt));
      p.flowDirection = lerp(p.flowDirection, 0, 10 * dt);
      p.flowRate = lerp(p.flowRate, HOLD_TIDAL_FLOW, 10 * dt);
      p.glottisOpen = lerp(p.glottisOpen, 0.26, 8 * dt);
      p.mouthOpen = lerp(p.mouthOpen, 0.06, 12 * dt);
      p.jawDrop = lerp(p.jawDrop, 0.08, 10 * dt);
      applyFollow();
      return p;
    }

    const speculativeInhale = this.silenceSeconds > (p.lungVolume < 0.28 ? 0.14 : 0.26)
      && p.lungVolume < 0.88;
    const risingBreath = v.breathNoise && dRms > 0.0008 && v.rms > 0.0022;
    const forceRecovery = p.lungVolume < 0.16 && this.silenceSeconds > 0.35;

    if (v.sung || v.distorted || this.envelope > 0.16) {
      this.className = 'phonated_exhale';
      p.lungVolume = clamp(p.lungVolume - (0.16 + 0.38 * this.envelope) * dt, 0.12, 1);
      p.flowDirection = lerp(p.flowDirection, 1, 16 * dt);
      p.flowRate = lerp(p.flowRate, 0.38 + 0.58 * this.envelope, 14 * dt);
      p.glottisOpen = lerp(p.glottisOpen, 0.1 + 0.14 * this.envelope, 18 * dt);
      p.nasalShare = lerp(p.nasalShare, 0.08 + (tract.velumOpen || 0) * 0.82, 7 * dt);
      p.jawRetract = lerp(p.jawRetract ?? 0, tract.jawRetract || 0, 8 * dt);
      p.headTuck = lerp(p.headTuck ?? 0, tract.headTuck || 0, 7 * dt);
    } else if (resp === 'inhale' || risingBreath || ((resp !== 'pause' || forceRecovery) && speculativeInhale)) {
      this.className = 'inhale';
      p.lungVolume = clamp(p.lungVolume + 1.85 * dt);
      p.flowDirection = lerp(p.flowDirection, -1, 18 * dt);
      p.flowRate = lerp(p.flowRate, 0.78, 16 * dt);
      p.glottisOpen = lerp(p.glottisOpen, 0.84, 12 * dt);
      p.nasalShare = lerp(p.nasalShare, 0.7, 7 * dt);
      p.jawRetract = lerp(p.jawRetract ?? 0, 0.06, 7 * dt);
      p.headTuck = lerp(p.headTuck ?? 0, 0, 7 * dt);
    } else if (resp === 'unphonated_exhale' || (v.breathNoise && dRms < -0.0006) || this.envelope > 0.05) {
      this.className = 'unphonated_exhale';
      p.lungVolume = clamp(p.lungVolume - 0.7 * dt, 0.1, 1);
      p.flowDirection = lerp(p.flowDirection, 1, 12 * dt);
      p.flowRate = lerp(p.flowRate, 0.45 + this.envelope, 10 * dt);
      p.glottisOpen = lerp(p.glottisOpen, 0.5, 10 * dt);
      p.jawRetract = lerp(p.jawRetract ?? 0, 0.04, 6 * dt);
      p.headTuck = lerp(p.headTuck ?? 0, 0, 6 * dt);
    } else {
      this.className = 'pause';
      p.flowDirection = lerp(p.flowDirection, 0, 10 * dt);
      p.flowRate = lerp(p.flowRate, HOLD_TIDAL_FLOW, 10 * dt);
      p.glottisOpen = lerp(p.glottisOpen, 0.26, 8 * dt);
      p.jawRetract = lerp(p.jawRetract ?? 0, 0, 6 * dt);
      p.headTuck = lerp(p.headTuck ?? 0, 0, 6 * dt);
    }

    applyFollow();
    return p;
  }
}

