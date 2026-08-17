/**
 * articulation.js — Passive badge enrichment from articulation.json (§6.4)
 *
 * Past-tense recognitions only. Never recommendations. Loaded optionally from
 * tools/graph_engine/articulate.py output at repo root or alongside index.html.
 *
 * When the file is absent the SEEDED_OPENINGS below surface as defaults — so
 * the badge tooltip always shows at least one open-horizon statement on
 * WHOLE-SYSTEM RESONANCE, satisfying §6.4 "every badge fire must surface an
 * opening." The seeded items are AIN-backed, not invented.
 */

const SEEDED_OPENINGS = {
  items: [
    {
      recognition: 'Zone frequencies are phenomenological — hand-tuned to feel right, not measured from bodies.',
      opening: 'No session has tested whether these thresholds match a different vocal range.',
      warrant: 'speculative',
    },
    {
      recognition: 'Whole-system resonance fires at sysAmp > 0.55 with 5+ zones active (acoustic model threshold).',
      opening: 'Whether users actually feel something different at this threshold has not been tested (AIN-RS-003).',
      warrant: 'mathematical',
    },
    {
      recognition: 'Coupling between zones follows a hand-set anatomical adjacency graph.',
      opening: 'Edge weights are subjective — no session data has been used to calibrate them yet.',
      warrant: 'speculative',
    },
  ],
};

let cache = null;
let loadAttempted = false;

export async function loadArticulation(url = 'articulation.json') {
  if (loadAttempted) return cache;
  loadAttempted = true;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { cache = SEEDED_OPENINGS; return cache; }
    cache = await res.json();
    return cache;
  } catch {
    cache = SEEDED_OPENINGS;
    return cache;
  }
}

/** First matching opening for badge tooltip, or null. Rotates through items by sysAmp bucket. */
export function articulationHint(doc, sysAmp, activeCount) {
  if (!doc?.items?.length) return null;
  // Rotate through items so the tooltip varies as state changes, not always showing item[0].
  const idx = Math.floor(sysAmp * doc.items.length) % doc.items.length;
  const item = doc.items[idx];
  const parts = [];
  if (item.recognition) parts.push(item.recognition);
  if (item.opening) parts.push(`Open: ${item.opening}`);
  if (item.warrant) parts.push(`(${item.warrant})`);
  return parts.join(' · ') || null;
}
