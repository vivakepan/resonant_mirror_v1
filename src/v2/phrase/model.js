/**
 * Phrase segmentation and trajectory descriptors (REQ-052–053).
 */

export function segmentPhrases(frames, { minSeconds = 0.4, source = 'user' } = {}) {
  const mine = frames.filter((f) => f.source === source);
  const phrases = [];
  let start = null;
  const voiced = (f) => (f.features.relativeLevelDecibelsFullScale ?? -120) > -45
    && (f.features.periodicity ?? 0) > 0.25;

  for (const frame of mine) {
    const on = voiced(frame);
    if (on && start == null) start = frame;
    if (!on && start) {
      const end = frame;
      if (end.timestampSeconds - start.timestampSeconds >= minSeconds) {
        phrases.push({
          phraseId: `ph-${start.timestampSeconds.toFixed(3)}`,
          sessionId: start.sessionId || null,
          source,
          startSeconds: start.timestampSeconds,
          endSeconds: end.timestampSeconds,
          frameRange: [start.timestampSeconds, end.timestampSeconds],
          humanLabels: [],
        });
      }
      start = null;
    }
  }
  return phrases;
}

export function phraseRepresentation(localEmbeddings, levelDb, hopSeconds = 0.02) {
  if (!localEmbeddings?.length) {
    return { phraseEmbedding: [], trajectory: null };
  }
  const dim = localEmbeddings[0].length;
  const mean = new Array(dim).fill(0);
  for (const v of localEmbeddings) {
    for (let i = 0; i < dim; i++) mean[i] += v[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= localEmbeddings.length;

  const xs = levelDb.filter(Number.isFinite);
  let peakIdx = 0;
  let peak = -Infinity;
  for (let i = 0; i < levelDb.length; i++) {
    if (levelDb[i] > peak) { peak = levelDb[i]; peakIdx = i; }
  }
  const trajectory = {
    buildShape: peakIdx / Math.max(1, levelDb.length - 1),
    peakTiming: peakIdx * hopSeconds,
    releaseShape: 1 - peakIdx / Math.max(1, levelDb.length - 1),
    peakValue: peak,
    path: xs,
  };
  return { phraseEmbedding: mean, trajectory };
}

export function trajectorySimilarity(a, b) {
  if (!a?.path?.length || !b?.path?.length) return null;
  const n = Math.min(a.path.length, b.path.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a.path[i] * b.path[i];
    na += a.path[i] ** 2;
    nb += b.path[i] ** 2;
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  const shape = den > 0 ? dot / den : 0;
  const peakClose = Math.abs((a.peakValue ?? 0) - (b.peakValue ?? 0)) < 3;
  const timingDelta = Math.abs((a.peakTiming ?? 0) - (b.peakTiming ?? 0));
  const buildDelta = Math.abs((a.buildShape ?? 0) - (b.buildShape ?? 0));
  return {
    pathSimilarity: shape,
    peakTimingDelta: (a.peakTiming ?? 0) - (b.peakTiming ?? 0),
    similarPeakDifferentPath: peakClose && (shape < 0.92 || timingDelta > 0.05 || buildDelta > 0.15),
  };
}
