/**
 * Support-related coordination evidence (REQ-031–033).
 * Not diaphragm truth. Comparisons must cite prior labeled examples.
 */

export const SUPPORT_LABELS = Object.freeze([
  'supported',
  'comfortable',
  'effortless',
  'running out of breath',
  'pressed',
  'strained',
  'unstable',
]);

export function phraseEndDegradation(levelDb, periodicity, lastThirdRatio = 0.33) {
  if (!levelDb?.length) return { degradation: null, evidenceClass: 'unknown' };
  const split = Math.floor(levelDb.length * (1 - lastThirdRatio));
  const head = levelDb.slice(0, split).filter(Number.isFinite);
  const tail = levelDb.slice(split).filter(Number.isFinite);
  if (!head.length || !tail.length) return { degradation: null, evidenceClass: 'unknown' };
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const levelDrop = mean(head) - mean(tail);
  const perHead = periodicity?.slice(0, split).filter(Number.isFinite) || [];
  const perTail = periodicity?.slice(split).filter(Number.isFinite) || [];
  const perDrop = perHead.length && perTail.length ? mean(perHead) - mean(perTail) : 0;
  return {
    degradation: Math.max(0, (levelDrop / 20) * 0.6 + perDrop * 0.4),
    levelDropDb: levelDrop,
    periodicityDrop: perDrop,
    evidenceClass: 'derived',
  };
}

export function supportEvidenceFromMemory(memory, embedding, embeddingVersion, { phraseEnd = null } = {}) {
  const labeled = [...memory.examples.values()].filter((ex) =>
    ex.labels.some((l) => SUPPORT_LABELS.includes(l)),
  );
  if (!labeled.length || !embedding) {
    return {
      value: null,
      confidence: 0,
      evidenceClass: 'unknown',
      wording: 'support-related coordination evidence',
      citedExamples: [],
    };
  }
  const ranked = labeled.map((ex) => ({
    exampleId: ex.exampleId,
    labels: ex.labels,
    sessionId: ex.sessionId,
    similarity: cosine(embedding, ex.embedding),
  })).sort((a, b) => b.similarity - a.similarity);

  const top = ranked[0];
  const positive = ['supported', 'comfortable', 'effortless'];
  const negative = ['running out of breath', 'pressed', 'strained', 'unstable'];
  let value = 0.5;
  if (top.labels.some((l) => positive.includes(l))) value = 0.5 + 0.5 * Math.max(0, top.similarity);
  if (top.labels.some((l) => negative.includes(l))) value = 0.5 - 0.5 * Math.max(0, top.similarity);
  if (phraseEnd?.degradation) value = Math.max(0, value - phraseEnd.degradation * 0.3);

  return {
    value,
    confidence: Math.min(0.6, Math.abs(top.similarity)),
    evidenceClass: 'personal_inference',
    wording: 'support-related coordination evidence',
    diaphragmClaim: false,
    citedExamples: ranked.slice(0, 3),
    summary: top.labels.includes('running out of breath')
      ? `This phrase increasingly resembles takes you previously labeled “running out of breath.”`
      : `Compared with your labeled examples (${top.labels.join(', ')}).`,
  };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den > 0 ? dot / den : 0;
}

export class SupportEstimator {
  infer(frame, { memory = null, embedding = null, embeddingVersion = null, phraseEnd = null } = {}) {
    if (!memory || !embedding) {
      frame.inferences.supportEvidence = {
        value: null,
        confidence: 0,
        evidenceClass: 'unknown',
        wording: 'support-related coordination evidence',
        citedExamples: [],
      };
      return frame.inferences.supportEvidence;
    }
    const state = supportEvidenceFromMemory(memory, embedding, embeddingVersion, { phraseEnd });
    frame.inferences.supportEvidence = state;
    return state;
  }
}
