/**
 * Closed-lip humming candidate from acoustics.
 *
 * Humming is inferred, not lip-tracked: voiced, modest level, closed oral
 * cavity (low F1), and not a bright open vowel or scream. Live sessions
 * do not train a model.
 */

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, Number(v) || 0));
}

export function inferHumming(features = {}, extras = {}) {
  const f0 = Number(features.fundamentalFrequencyHertz) || 0;
  const periodicity = clamp(features.periodicity);
  const rms = clamp(features.rmsAmplitude);
  const pitchConfidence = clamp(features.pitchConfidence);
  const centroid = Number(features.spectralCentroidHertz) || 0;
  const harm = Number(features.harmonicity);
  const formants = Array.isArray(features.formantsHertz) ? features.formantsHertz : [];
  const f1 = Number(formants[0]) || 0;
  const f2 = Number(formants[1]) || 0;
  const mouthOpen = extras.mouthOpen;
  const nasalShare = clamp(extras.nasalShare);

  const voiced = f0 > 70
    && periodicity > 0.48
    && rms > 0.012
    && pitchConfidence > 0.32;
  if (!voiced) {
    return {
      amount: 0,
      active: false,
      evidenceClass: 'unknown',
      label: 'no humming evidence',
    };
  }

  const closedOral = (Number.isFinite(mouthOpen) && mouthOpen < 0.18)
    || (f1 > 0 && f1 < 400)
    || !(f1 > 180);
  const notOpenVowel = !(f1 > 520);
  const closeFrontVowel = f1 > 220 && f1 < 400 && f2 > 2000;
  const notScream = periodicity > 0.5 && !(centroid > 2400) && rms < 0.32;
  const harmonic = !Number.isFinite(harm) || harm > 0.48;

  let score = 0;
  if (closedOral && notOpenVowel) score += 0.44;
  if (closeFrontVowel) score -= 0.4;
  else score += 0.1;
  if (notScream) score += 0.18;
  if (harmonic) score += 0.1;
  if (Number.isFinite(mouthOpen) && mouthOpen < 0.14) score += 0.16;
  if (nasalShare > 0.42) score += 0.14;
  if (centroid > 400 && centroid < 1700) score += 0.08;

  const amount = clamp(score);
  const active = amount > 0.42;
  return {
    amount: active ? amount : 0,
    active,
    evidenceClass: active ? 'inferred' : 'unknown',
    label: active
      ? 'humming candidate · closed-lip voiced nasal, inferred — not lip tracking'
      : 'not a humming candidate',
  };
}
