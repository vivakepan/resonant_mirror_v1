/**
 * Vowel candidate from F1/F2, plus the modest chest/mixed/head *sensation*
 * coupling that pedagogy talks about. Vowels are filter (tract shape).
 * Chest / mixed / head as register are source (fold mechanism). One does
 * not prove the other.
 */

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

/** Approximate adult F1/F2 centroids (Hz). */
export const VOWEL_CENTROIDS = Object.freeze({
  i: [280, 2260],
  ɪ: [400, 1920],
  ɛ: [530, 1650],
  æ: [660, 1720],
  a: [750, 1180],
  ʌ: [640, 1220],
  ɔ: [570, 840],
  o: [450, 800],
  ʊ: [440, 1020],
  u: [310, 870],
  ə: [500, 1420],
});

export function classifyVowel(formantsHertz = []) {
  const f1 = Number(formantsHertz[0]) || 0;
  const f2 = Number(formantsHertz[1]) || 0;
  if (!(f1 > 180) || !(f2 > 400)) {
    return {
      symbol: null,
      label: 'unknown',
      f1: f1 || null,
      f2: f2 || null,
      confidence: 0,
      evidenceClass: 'unknown',
    };
  }
  let best = null;
  let bestDist = Infinity;
  for (const [symbol, [c1, c2]] of Object.entries(VOWEL_CENTROIDS)) {
    const d1 = (f1 - c1) / 280;
    const d2 = (f2 - c2) / 700;
    const dist = d1 * d1 + d2 * d2;
    if (dist < bestDist) {
      bestDist = dist;
      best = symbol;
    }
  }
  const confidence = clamp(1 - Math.sqrt(bestDist) * 0.55);
  return {
    symbol: confidence > 0.18 ? best : null,
    label: confidence > 0.18 ? `/${best}/` : 'unknown',
    f1,
    f2,
    confidence,
    evidenceClass: confidence > 0.18 ? 'derived' : 'unknown',
  };
}

export function vowelResonanceRelation(vowel = {}) {
  const symbol = vowel.symbol;
  if (!symbol) {
    return {
      chest: 0,
      mixed: 0,
      head: 0,
      sensation: 'unknown',
      coupling: 'none',
      significant: false,
      detail: 'No reliable vowel candidate. Vowels do not select chest, mixed, or head register.',
      caveat: 'Vowel is vocal-tract filter. Register is fold mechanism. They can co-occur; neither proves the other.',
    };
  }

  const open = 'aæɑɔʌ'.includes(symbol);
  const closeFront = 'iɪ'.includes(symbol);
  const closeBack = 'uʊo'.includes(symbol);
  const frontMid = symbol === 'ɛ';
  const filterCaveat = 'Vowel is vocal-tract filter. Register is fold mechanism. They can co-occur; neither proves the other.';

  if (open) {
    return {
      chest: 0.72,
      mixed: 0.22,
      head: 0.06,
      sensation: 'oral / chest space',
      coupling: 'open-vowel space',
      significant: true,
      detail: `/${symbol}/ is open or open-mid (higher F1): more oral–pharyngeal space. That can *feel* chesty. It does not mean the folds are in chest register.`,
      caveat: filterCaveat,
    };
  }
  if (closeFront) {
    return {
      chest: 0.08,
      mixed: 0.32,
      head: 0.6,
      sensation: 'palatal / head sensation',
      coupling: 'close-front brightness',
      significant: true,
      detail: `/${symbol}/ is close-front (low F1, high F2): palatal brightness and “mask” sensation. That can *feel* like head voice. It does not prove M2/head register.`,
      caveat: filterCaveat,
    };
  }
  if (closeBack) {
    return {
      chest: 0.18,
      mixed: 0.54,
      head: 0.28,
      sensation: 'pharyngeal / mixed',
      coupling: 'close-back rounding',
      significant: true,
      detail: `/${symbol}/ is close-back: velar/pharyngeal space and rounding. Sensation is mixed more than purely chest or head.`,
      caveat: filterCaveat,
    };
  }
  if (frontMid) {
    return {
      chest: 0.28,
      mixed: 0.46,
      head: 0.26,
      sensation: 'front-mid oral',
      coupling: 'open-mid front',
      significant: true,
      detail: `/${symbol}/ is open-mid front: some palatal brightness with oral space. Modest mixed sensation — not a register cue.`,
      caveat: filterCaveat,
    };
  }
  return {
    chest: 0.22,
    mixed: 0.56,
    head: 0.22,
    sensation: 'mixed oral',
    coupling: 'weak',
    significant: false,
    detail: `/${symbol}/ is a mid vowel. No strong chest/head coupling — mixed oral sensation only.`,
    caveat: filterCaveat,
  };
}

export function vowelMapFromFormants(formantsHertz = []) {
  const vowel = classifyVowel(formantsHertz);
  const relation = vowelResonanceRelation(vowel);
  return {
    ...vowel,
    ...relation,
    label: vowel.label,
  };
}

function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

/** Compact HUD line: chest / mixed / head sensation, never register. */
export function formatVowelSensationLine(vowel) {
  if (!vowel?.symbol) {
    return {
      title: 'unknown',
      detail: 'vowel is filter; chest / mixed / head register is source',
    };
  }
  if (!vowel.significant) {
    return {
      title: `${vowel.label} · no strong chest / mixed / head coupling`,
      detail: vowel.detail || 'mid vowel · sensation only, not register',
    };
  }
  return {
    title: `${vowel.label} · chest ${pct(vowel.chest)} · mixed ${pct(vowel.mixed)} · head ${pct(vowel.head)}`,
    detail: `${vowel.sensation} · sensation, not register`,
  };
}
