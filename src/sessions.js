/**
 * sessions.js — Opt-in session export for graph engine + journal-noticer
 *
 * Emits JSONL matching tools/graph_engine/ingest.py (events[]) plus legacy
 * frames[] for older noticer runs. No PII: opaque session id, hashed song name.
 */

import { ZONE_IDS } from './physics.js';

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function sha256(text) {
  if (!text || !globalThis.crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function roundAmp(a) {
  return Math.round(a * 1000) / 1000;
}

export function createSessionRecorder(state, zones) {
  const sessionId = uuid();
  const startedAt = Date.now();
  const events = [];
  let lastSampleT = 0;

  if (zones.length !== ZONE_IDS.length) {
    console.warn('sessions: zones.length !== ZONE_IDS.length — export order may be wrong');
  }

  return {
    sessionId,
    /**
     * @param {number[]} amps - rendered zone amplitudes (same order as zones / ZONE_IDS)
     * @param {number[]} externalFs - external driver frequencies this frame (Hz)
     */
    sample(sysAmp, activeCount, arActive, primaryFHz, amps, externalFs = []) {
      const now = Date.now();
      if (now - lastSampleT < 250) return;
      lastSampleT = now;

      const tSec = (now - startedAt) / 1000;
      const ampVec = amps.map(roundAmp);
      const ar = arActive
        ? { f: arActive.ar.f, strength: arActive.strength }
        : null;

      events.push({
        t: tSec,
        internal_f: primaryFHz,
        external_fs: externalFs.map(f => Math.round(f * 10) / 10),
        amps: ampVec,
        sysAmp: roundAmp(sysAmp),
        activeCount,
        arActive: ar,
      });
    },
    async toJsonlLine(songFileName) {
      const song_hash = songFileName ? await sha256(songFileName) : null;
      // Legacy frames[] mirrors events for journal-noticer / old tooling.
      const frames = events.map(ev => ({
        t: ev.t * 1000,
        f: ev.internal_f,
        sysAmp: ev.sysAmp,
        activeCount: ev.activeCount,
        arActive: ev.arActive,
      }));
      return JSON.stringify({
        session_id: sessionId,
        started_at: new Date(startedAt).toISOString(),
        song_hash,
        events,
        frames,
        meta: {
          zone_ids: ZONE_IDS,
          viewMode: state.viewMode,
          envType: state.envType,
          fieldEnabled: state.fieldEnabled,
          breathEnabled: state.breathEnabled,
        },
      });
    },
  };
}

export function downloadSessionsJsonl(lines, filename = 'sessions.jsonl') {
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/jsonl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
