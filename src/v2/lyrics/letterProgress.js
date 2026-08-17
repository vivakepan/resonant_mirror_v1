function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

export function normalizeLyricText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function timedLetterCount(text = '', start = 0, end = 0, time = 0) {
  const len = String(text).length;
  if (!len) return 0;
  const span = Math.max(0.35, (end || start + 2) - start);
  const progress = clamp((time - start) / span);
  return Math.min(len, Math.max(0, Math.round(progress * len)));
}

/**
 * How many original characters should light given live recognized speech.
 * Matches a growing prefix of the line inside the recent heard window.
 */
export function heardLetterCount(lineText = '', heardText = '') {
  const original = String(lineText);
  const line = normalizeLyricText(original);
  const heard = normalizeLyricText(heardText);
  if (!line || !heard) return 0;
  const window = heard.slice(-Math.max(line.length + 16, 48));
  let matchedNorm = 0;
  for (let len = line.length; len > 0; len--) {
    if (window.includes(line.slice(0, len))) {
      matchedNorm = len;
      break;
    }
  }
  if (!matchedNorm) return 0;
  let seen = 0;
  for (let i = 0; i < original.length; i++) {
    const ch = original[i].toLowerCase().replace(/['’]/g, '');
    if (/[a-z0-9]/.test(ch)) seen += 1;
    if (seen >= matchedNorm) return i + 1;
  }
  return original.length;
}

export function letterCountForLine({
  text = '',
  start = 0,
  end = 0,
  time = 0,
  heardText = '',
} = {}) {
  return Math.max(
    timedLetterCount(text, start, end, time),
    heardLetterCount(text, heardText),
  );
}
