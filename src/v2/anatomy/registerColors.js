/**
 * Chest and head are two mixable primaries. Mixed voice is the color
 * they make together — not a third independent hue.
 */

export const CHEST_VOICE_RGB = Object.freeze({ r: 255, g: 108, b: 36 });
export const HEAD_VOICE_RGB = Object.freeze({ r: 56, g: 176, b: 255 });

/**
 * Layer palette so systems do not share a hue.
 * Outline = body contour. Air = mint. Bone = ribs/sternum.
 * Tract walls = magenta bridge between chest-orange and head-blue.
 * Resonance chambers (filter) are a separate triad from register (source):
 *   chest = amber gold, throat = lemon, head = electric cyan.
 * Felt vibration on skull/ribs uses the same mint as breath — a reminder
 * that register transition and maintenance need breath control.
 * Airway column (xiphoid → cranial spine) is hot rose; the voice box is
 * electric indigo so larynx cartilage stays readable in the clutter.
 * Lungs = visible teal under bright ribs. Circulation stays red/blue.
 */
export const OUTLINE_RGB = Object.freeze({ r: 198, g: 214, b: 228 });
export const BONE_RGB = Object.freeze({ r: 236, g: 242, b: 250 });
export const AIRFLOW_RGB = Object.freeze({ r: 36, g: 255, b: 164 });
export const STRUCTURE_VIBRATION_RGB = AIRFLOW_RGB;
export const AIRWAY_COLUMN_RGB = Object.freeze({ r: 255, g: 40, b: 110 });
export const LARYNX_RGB = Object.freeze({ r: 92, g: 96, b: 255 });
export const TRACT_RGB = Object.freeze({ r: 216, g: 64, b: 255 });
export const MUSCLE_RGB = Object.freeze({ r: 148, g: 86, b: 90 });
export const LUNG_RGB = Object.freeze({ r: 62, g: 138, b: 158 });

/** Filter chambers — not register orange/blue, and not the tract-wall magenta. */
export const CHEST_CHAMBER_RGB = Object.freeze({ r: 255, g: 176, b: 24 });
export const THROAT_CHAMBER_RGB = Object.freeze({ r: 255, g: 236, b: 72 });
export const SKULL_CHAMBER_RGB = Object.freeze({ r: 48, g: 232, b: 255 });

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

/** Weighted additive mix of chest-orange and head-blue. */
export function mixedVoiceRgb(chestAmount = 0.5, headAmount = 0.5) {
  const chest = clamp(Number(chestAmount) || 0);
  const head = clamp(Number(headAmount) || 0);
  const sum = chest + head;
  const c = sum > 0 ? chest / sum : 0.5;
  const h = sum > 0 ? head / sum : 0.5;
  return {
    r: Math.min(255, Math.round(CHEST_VOICE_RGB.r * c + HEAD_VOICE_RGB.r * h)),
    g: Math.min(255, Math.round(CHEST_VOICE_RGB.g * c + HEAD_VOICE_RGB.g * h)),
    b: Math.min(255, Math.round(CHEST_VOICE_RGB.b * c + HEAD_VOICE_RGB.b * h)),
  };
}

export function rgbaVoice(rgb, a) {
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

/**
 * Mixed coordination is the blend color in its own zone.
 * Chest and head stay in their own regions and are not lit by mixed.
 */
export function registerVoiceAmounts(registration = {}) {
  const chest = clamp(Number(registration.chestGlow) || 0);
  const head = clamp(Number(registration.skullRim) || 0);
  const mixed = clamp(Number(registration.mixedField) || 0);
  return {
    chest,
    head,
    mixed,
    mixedRgb: mixedVoiceRgb(chest > 0.04 ? chest : mixed, head > 0.04 ? head : mixed),
  };
}

/**
 * Mixed voice is a source coordination, not a proof that the whole body
 * is a resonator. This maps mixed amount × acoustic energy onto a
 * pitch-linked vibration of the vocal architecture (folds + tract),
 * labeled inferred.
 */
export function mixedSystemVibration({
  mixedAmount = 0,
  rmsAmplitude = 0,
  energy = 0,
  frequencyHertz = 0,
  formantsHertz = [],
} = {}) {
  const mixed = clamp(Number(mixedAmount) || 0);
  const drive = clamp(Math.max(Number(energy) || 0, (Number(rmsAmplitude) || 0) * 5.2));
  const amount = mixed * drive;
  const f0 = Number(frequencyHertz) || 0;
  const f1 = Number(formantsHertz?.[0]) || 0;
  const freq = f0 > 60 ? f0 : (f1 > 180 ? f1 : 0);
  if (!(amount > 0.05) || !(freq > 0)) {
    return {
      amount: 0,
      frequencyHertz: 0,
      visualHz: 0,
      chestCoupling: 0,
      tractCoupling: 0,
      evidenceClass: 'unknown',
      label: 'no mixed-coordination vibration',
    };
  }
  return {
    amount,
    frequencyHertz: freq,
    visualHz: Math.min(8, Math.max(1.15, freq / 48)),
    chestCoupling: amount * 0.52,
    tractCoupling: amount,
    evidenceClass: 'inferred',
    label: 'mixed-coordination vibration · source–filter coupling at pitch, not whole-body resonance',
  };
}

/**
 * Pitch-linked felt vibration on bone and cartilage.
 * Head/mixed shake the skull rim. Chest/mixed shake ribs, spine, and
 * laryngeal cartilages. Humming adds nasal/skull coupling.
 * This is inferred sensation, not proof that the skeleton is a resonator.
 */
export function structureVibrationFromVoice({
  chestAmount = 0,
  mixedAmount = 0,
  headAmount = 0,
  hummingAmount = 0,
  rmsAmplitude = 0,
  energy = 0,
  frequencyHertz = 0,
} = {}) {
  const drive = clamp(Math.max(
    Number(energy) || 0,
    (Number(rmsAmplitude) || 0) * 5.2,
    Number(hummingAmount) || 0,
  ));
  const f0 = Number(frequencyHertz) || 0;
  const chest = clamp(chestAmount) * drive;
  const mixed = clamp(mixedAmount) * drive;
  const head = clamp(headAmount) * drive;
  const hum = clamp(hummingAmount);
  const skullRim = clamp(head + mixed * 0.88 + hum * 0.95);
  const chestBones = clamp(chest + mixed * 0.82 + hum * 0.48);
  const spine = clamp(chest * 0.78 + mixed * 0.9 + hum * 0.38);
  const throatCartilage = clamp(chest * 0.72 + mixed * 0.86 + hum * 0.42);
  const amount = Math.max(skullRim, chestBones, spine, throatCartilage);
  if (!(amount > 0.06) || !(f0 > 60)) {
    return {
      amount: 0,
      visualHz: 0,
      frequencyHertz: 0,
      skullRim: 0,
      chestBones: 0,
      spine: 0,
      throatCartilage: 0,
      humming: 0,
      evidenceClass: 'unknown',
      label: 'no bone/cartilage vibration',
    };
  }
  return {
    amount,
    visualHz: Math.min(8, Math.max(1.15, f0 / 48)),
    frequencyHertz: f0,
    skullRim,
    chestBones,
    spine,
    throatCartilage,
    humming: hum,
    evidenceClass: 'inferred',
    label: hum > 0.42
      ? 'inferred humming vibration on skull, nasal path, and coupled bones — not a skeletal resonator'
      : 'inferred felt vibration on bone/cartilage at pitch — not whole-body resonance',
  };
}
