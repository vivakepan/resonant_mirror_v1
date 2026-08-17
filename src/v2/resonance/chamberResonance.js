/**
 * Pedagogical formant → vocal-tract chamber mapping.
 *
 * Formants are standing-wave resonances of the filter (the tract), not of
 * lungs, abdomen, heart, or brain. A chamber lights while phonated and a
 * formant candidate sits in that chamber's band. If formants are unknown,
 * oral energy may follow spectral centroid as an inferred stand-in.
 *
 * The mapping is illustrative. It does not claim the painted region is the
 * physical resonator, and sinuses are not treated as primary resonators.
 *
 *   F1 (≈250–900 Hz)  → oral cavity / openness
 *   F2 (≈700–2500 Hz) → pharynx / tongue constriction
 *   F3 (≈2000–3500 Hz) → nasal coupling, only if nasalShare is high
 */

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function emptyChambers(formantsHertz = []) {
  return {
    active: false,
    energy: 0,
    oral: 0,
    pharynx: 0,
    nasal: 0,
    lungs: 0,
    abdomen: 0,
    brain: 0,
    heart: 0,
    formantsHertz: formantsHertz.filter((hz) => hz > 0),
    evidenceClass: 'unknown',
    label: 'no tract resonance · chambers stay quiet without phonated formants',
  };
}

export function chamberResonanceFromFormants(formantsHertz = [], {
  phonated = false,
  rmsAmplitude = 0,
  flowRate = 0,
  nasalShare = 0.18,
  spectralCentroidHertz = 0,
} = {}) {
  const list = Array.isArray(formantsHertz) ? formantsHertz : [];
  const f1 = Number(list[0]) || 0;
  const f2 = Number(list[1]) || 0;
  const f3 = Number(list[2]) || 0;
  const drive = clamp(Math.max(
    Number(rmsAmplitude) * 5,
    Number(flowRate) * 0.85,
    phonated ? 0.35 : 0,
  ));
  if (!phonated || !(drive > 0.08)) return emptyChambers([f1, f2, f3]);

  const oral = f1 > 180 && f1 < 1200
    ? clamp(drive * (0.4 + clamp((f1 - 250) / 650) * 0.6))
    : 0;
  const pharynx = f2 > 500 && f2 < 3200
    ? clamp(drive * (0.38 + clamp((f2 - 700) / 1800) * 0.5))
    : 0;
  const nasal = f3 > 1800 && f3 < 4200 && nasalShare > 0.22
    ? clamp(drive * nasalShare * 0.85)
    : 0;
  const energy = Math.max(oral, pharynx, nasal);
  if (energy > 0.08) {
    const lit = [];
    if (oral > 0.08) lit.push(`F1 oral ${Math.round(f1)} Hz`);
    if (pharynx > 0.08) lit.push(`F2 pharynx ${Math.round(f2)} Hz`);
    if (nasal > 0.08) lit.push(`F3 nasal ${Math.round(f3)} Hz`);
    return {
      active: true,
      energy,
      oral,
      pharynx,
      nasal,
      lungs: 0,
      abdomen: 0,
      brain: 0,
      heart: 0,
      formantsHertz: [f1, f2, f3].filter((hz) => hz > 0),
      evidenceClass: 'derived',
      label: `tract resonance · ${lit.join(' · ')}`,
    };
  }

  const centroid = Number(spectralCentroidHertz) || 0;
  if (drive > 0.2) {
    const oralGuess = centroid > 400
      ? clamp(drive * (centroid < 1600 ? 0.62 : centroid < 2800 ? 0.5 : 0.38))
      : clamp(drive * 0.42);
    return {
      active: true,
      energy: oralGuess,
      oral: oralGuess,
      pharynx: 0,
      nasal: 0,
      lungs: 0,
      abdomen: 0,
      brain: 0,
      heart: 0,
      formantsHertz: [],
      evidenceClass: 'inferred',
      label: 'tract energy · formant peaks unknown; chambers follow spectral energy',
    };
  }

  return emptyChambers([f1, f2, f3]);
}
