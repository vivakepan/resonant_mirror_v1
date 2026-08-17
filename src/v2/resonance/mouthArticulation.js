/**
 * Mouth and jaw aperture from the vocalist's acoustics.
 *
 * F1 is the primary correlate of jaw opening (Fant; Stevens). A close-front
 * vowel stays relatively closed even when loud. A scream or belt can open
 * farther, including when LPC formants drop out, by using level, periodicity,
 * and brightness. Percussion and pitched instruments do not open the mouth.
 *
 * This is a simulated teaching pose, not lip tracking or a camera model.
 * Offline pre-training can later map audio (and optional video) onto
 * technique geometry; live sessions must not update weights.
 */

import { tractConfigurationFromFormants } from './tractShape.js';

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

export function mouthArticulationFromAcoustics(features = {}, extras = {}) {
  const rms = clamp(Number(features.rmsAmplitude) || 0);
  const periodicity = clamp(Number(features.periodicity) || 0);
  const f0 = Number(features.fundamentalFrequencyHertz) || 0;
  const formants = Array.isArray(features.formantsHertz) ? features.formantsHertz : [];
  const f1 = Number(formants[0]) || 0;
  const f2 = Number(formants[1]) || 0;
  const conf = Array.isArray(features.formantConfidence) ? features.formantConfidence : [];
  const f1Conf = Number(conf[0]) || (f1 > 180 ? 0.5 : 0);
  const centroid = Number(features.spectralCentroidHertz) || 0;
  const db = Number(features.relativeLevelDecibelsFullScale);
  const harm = Number(features.harmonicity);
  const pitchConfidence = clamp(Number(features.pitchConfidence) || 0);
  const techniqueId = extras.techniqueId || null;
  const hasFormantPair = f1 > 220 && f1 < 1200 && f2 > 550 && f2 < 3400 && f2 > f1 + 120;
  const pitchedInstrument = extras.pitchedInstrument === true
    || (
      extras.pitchedInstrument == null
      && periodicity > 0.75
      && pitchConfidence > 0.55
      && f0 > 70
      && !hasFormantPair
      && (!Number.isFinite(harm) || harm > 0.65)
    );
  const percussion = extras.percussion === true
    || (
      extras.percussion == null
      && rms > 0.05
      && periodicity < 0.22
      && !(f0 > 60)
      && !hasFormantPair
    );

  if (pitchedInstrument || percussion) {
    return {
      mouthOpen: 0.05,
      jawDrop: 0.07,
      lipSpread: 0.2,
      jawRetract: 0,
      headTuck: 0,
      velumOpen: 0,
      vowelOpen: 0,
      screamOpen: 0,
      hold: false,
      tract: tractConfigurationFromFormants([]),
      evidenceClass: 'unknown',
      label: pitchedInstrument ? 'instrument · mouth stays rest' : 'percussion · mouth stays rest',
    };
  }

  const tract = tractConfigurationFromFormants(formants, {
    spectralCentroidHertz: centroid,
  });
  const vowelReliable = tract.evidenceClass === 'derived' && f1Conf >= 0.22;
  const closeFrontClean = vowelReliable
    && tract.height > 0.62
    && tract.front > 0.62
    && periodicity > 0.62;
  const loud = rms > 0.055 || (Number.isFinite(db) && db > -30);
  const noisy = periodicity < 0.48 || (Number.isFinite(harm) && harm < 0.5);
  const bright = centroid > 1900;
  const screamOpen = (!closeFrontClean && loud && noisy && (bright || !vowelReliable || f1 > 560))
    ? clamp(
      0.72
      + Math.min(0.28, rms * 1.8)
      + (bright ? 0.08 : 0)
      + (Number.isFinite(db) && db > -20 ? 0.06 : 0),
    )
    : 0;

  const intensity = clamp(rms * 5.4);
  const vowelBoosted = vowelReliable
    ? clamp(tract.mouthOpen + (1 - tract.height) * intensity * 0.22)
    : 0;
  const phonated = extras.sung === true
    || extras.distorted === true
    || (periodicity > 0.28 && f0 > 60 && rms > 0.01);
  const unknownPhonationOpen = !vowelReliable && phonated
    ? clamp(0.24 + intensity * 0.42)
    : 0;

  let cap = 1;
  if (techniqueId === 'fry') cap = 0.3;
  else if (techniqueId === 'whistle') cap = 0.24;
  else if (techniqueId === 'falsetto') cap = 0.5;
  else if (techniqueId === 'twang') cap = 0.55;

  const beltFloor = techniqueId === 'belt' && loud
    ? Math.max(vowelBoosted, 0.56)
    : 0;

  const mouthOpen = Math.min(cap, clamp(Math.max(
    vowelBoosted,
    screamOpen,
    unknownPhonationOpen,
    beltFloor,
  )));
  const jawDrop = Math.min(cap, clamp(Math.max(
    vowelReliable ? tract.jawDrop + (1 - tract.height) * intensity * 0.18 : 0,
    screamOpen * 0.92,
    unknownPhonationOpen * 0.78,
    beltFloor * 0.9,
  )));
  const lipSpread = vowelReliable
    ? tract.lipSpread
    : screamOpen > 0.4
      ? 0.2
      : 0.32;
  const hold = screamOpen > 0.35
    || beltFloor > 0.5
    || (vowelReliable && tract.mouthOpen > 0.48 && intensity > 0.3);

  return {
    mouthOpen,
    jawDrop,
    lipSpread,
    jawRetract: tract.jawRetract || 0,
    headTuck: tract.headTuck || 0,
    velumOpen: tract.velumOpen || 0,
    vowelOpen: vowelReliable ? tract.mouthOpen : 0,
    screamOpen,
    hold,
    tract,
    evidenceClass: vowelReliable ? 'derived' : (screamOpen > 0 || phonated ? 'inferred' : 'unknown'),
    label: screamOpen > 0.4
      ? 'wide aperture · scream / distortion acoustics'
      : vowelReliable
        ? `tract aperture · F1 ${Math.round(f1)} Hz`
        : phonated
          ? 'aperture from level · formants unknown'
          : 'aperture unknown',
  };
}
