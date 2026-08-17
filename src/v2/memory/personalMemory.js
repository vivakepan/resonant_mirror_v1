/**
 * Fast personal memory (REQ-063–069). Stores embeddings without changing weights.
 */

import { validatePersonalPrototype } from '../contracts/schemas.js';

export const DEFAULT_EMBEDDING_VERSION = 'vocal-encoder-0';

export function cosineSimilarity(a, b) {
  if (!a?.length || a.length !== b.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den > 0 ? dot / den : null;
}

export function meanVector(vectors) {
  if (!vectors.length) return [];
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) throw new Error('embedding-version mismatch: dimension');
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

function id(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export class PersonalMemory {
  constructor({ embeddingVersion = DEFAULT_EMBEDDING_VERSION } = {}) {
    this.embeddingVersion = embeddingVersion;
    this.examples = new Map();
    this.prototypes = new Map();
    this.weightsFrozen = true;
  }

  storeExample({ exampleId, embedding, embeddingVersion, labels = [], sessionId, phraseId = null, features = {} }) {
    this._assertVersion(embeddingVersion);
    const rec = {
      exampleId: exampleId || id('ex'),
      embedding: [...embedding],
      embeddingVersion,
      labels: [...labels],
      sessionId,
      phraseId,
      features,
      createdAt: Date.now(),
    };
    this.examples.set(rec.exampleId, rec);
    return rec;
  }

  createPrototype({ name, exampleIds = [] }) {
    const proto = this._rebuildPrototype(id('pr'), name, exampleIds);
    this.prototypes.set(proto.prototypeId, proto);
    return proto;
  }

  renamePrototype(prototypeId, name) {
    const proto = this._get(prototypeId);
    proto.name = name;
    proto.updatedAt = Date.now();
    return proto;
  }

  deletePrototype(prototypeId) {
    return this.prototypes.delete(prototypeId);
  }

  addExampleToPrototype(prototypeId, exampleId) {
    const proto = this._get(prototypeId);
    if (!proto.exampleIds.includes(exampleId)) proto.exampleIds.push(exampleId);
    return this._rebuildPrototype(proto.prototypeId, proto.name, proto.exampleIds);
  }

  mergePrototypes(aId, bId, name) {
    const a = this._get(aId);
    const b = this._get(bId);
    const merged = this._rebuildPrototype(id('pr'), name || a.name, [...a.exampleIds, ...b.exampleIds]);
    this.prototypes.set(merged.prototypeId, merged);
    this.deletePrototype(aId);
    this.deletePrototype(bId);
    return merged;
  }

  similarity(embedding, embeddingVersion, prototypeId = null) {
    this._assertVersion(embeddingVersion);
    if (prototypeId) {
      const proto = this._get(prototypeId);
      return { prototypeId, name: proto.name, similarity: cosineSimilarity(embedding, proto.centroid) };
    }
    const scores = [];
    for (const proto of this.prototypes.values()) {
      scores.push({
        prototypeId: proto.prototypeId,
        name: proto.name,
        similarity: cosineSimilarity(embedding, proto.centroid),
      });
    }
    scores.sort((x, y) => (y.similarity ?? -1) - (x.similarity ?? -1));
    return scores;
  }

  repeatability(exampleIds) {
    const vecs = exampleIds.map((id) => this.examples.get(id)?.embedding).filter(Boolean);
    if (vecs.length < 2) return { n: vecs.length, meanSimilarity: null };
    let s = 0, c = 0;
    for (let i = 0; i < vecs.length; i++) {
      for (let j = i + 1; j < vecs.length; j++) {
        s += cosineSimilarity(vecs[i], vecs[j]);
        c += 1;
      }
    }
    return { n: vecs.length, meanSimilarity: s / c };
  }

  editLabels(exampleId, labels) {
    const ex = this.examples.get(exampleId);
    if (!ex) throw new Error('unknown example');
    ex.labels = [...labels];
    return ex;
  }

  deleteExample(exampleId) {
    this.examples.delete(exampleId);
    for (const proto of [...this.prototypes.values()]) {
      proto.exampleIds = proto.exampleIds.filter((id) => id !== exampleId);
      this._rebuildPrototype(proto.prototypeId, proto.name, proto.exampleIds);
    }
  }

  deleteSession(sessionId) {
    for (const [id, ex] of this.examples) {
      if (ex.sessionId === sessionId) this.deleteExample(id);
    }
  }

  _assertVersion(version) {
    if (version !== this.embeddingVersion) {
      const err = new Error('embedding-version mismatch');
      err.qualityFlag = 'embedding_version_mismatch';
      throw err;
    }
  }

  _get(prototypeId) {
    const proto = this.prototypes.get(prototypeId);
    if (!proto) throw new Error('unknown prototype');
    return proto;
  }

  _rebuildPrototype(prototypeId, name, exampleIds) {
    const vecs = exampleIds.map((id) => this.examples.get(id)?.embedding).filter(Boolean);
    const proto = {
      prototypeId,
      name,
      exampleIds: [...exampleIds],
      embeddingVersion: this.embeddingVersion,
      centroid: meanVector(vecs),
      dispersion: { n: vecs.length },
      userConfidence: null,
      createdAt: this.prototypes.get(prototypeId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    const result = validatePersonalPrototype(proto);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    this.prototypes.set(prototypeId, proto);
    return proto;
  }
}
