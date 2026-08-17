#!/usr/bin/env python3
"""
ingest.py — Reads session JSONL exports from the browser and writes
typed nodes + morphisms to the local SQLite graph.

Per AIN-RS-014 and §6.5 of the refinement roadmap:
  - Offline-only. No cloud. No PII.
  - Songs are hashed before storage; raw audio is never persisted.
  - Sessions are opaque fingerprints (random UUIDs from the browser).

Input format (one JSON object per line):
  {
    "session_id": "<uuid>",
    "song_hash":  "<sha256 or null>",
    "events": [
      {
        "t":           <seconds-into-session>,
        "internal_f":  <Hz>,
        "external_fs": [<Hz>, ...],          # external driver peaks at this frame
        "amps":        [<10 zone amps in [0,1]>],
        "sysAmp":      <float>,
        "arActive":    null | {<ar object>}
      },
      ...
    ]
  }
"""

import argparse, json, os, sqlite3, sys, time, hashlib
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))
from zones import ZONE_NAMES  # noqa: E402 — must match src/physics.js ZONE_IDS
N_BANDS    = 32
BAND_LO_HZ = 70.0
BAND_HI_HZ = 3000.0

# ─── Band binning ──────────────────────────────────────────────
# Log-spaced over [70, 3000) Hz — matches the slider range plus the
# upper formant band from §12.6 multi-modal zones.
import math
def band_for(hz):
    if hz < BAND_LO_HZ: return 0
    if hz >= BAND_HI_HZ: return N_BANDS - 1
    lo, hi = math.log(BAND_LO_HZ), math.log(BAND_HI_HZ)
    frac = (math.log(hz) - lo) / (hi - lo)
    return min(N_BANDS - 1, max(0, int(frac * N_BANDS)))


def upsert_node(con, type_, key, data=None):
    now = time.time()
    cur = con.execute("SELECT id FROM node WHERE type=? AND key=?", (type_, key))
    row = cur.fetchone()
    if row:
        return row[0]
    cur = con.execute(
        "INSERT INTO node (type, key, data_json, created_at) VALUES (?, ?, ?, ?)",
        (type_, key, json.dumps(data) if data is not None else None, now))
    return cur.lastrowid


def upsert_morphism(con, src, dst, type_, warrant='empirical-weak'):
    now = time.time()
    cur = con.execute(
        "SELECT id, resonance_depth FROM morphism WHERE src=? AND dst=? AND type=?",
        (src, dst, type_))
    row = cur.fetchone()
    if row:
        mid, depth = row
        # Promote warrant as depth grows: weak → strong at d=10.
        new_warrant = 'empirical-strong' if depth + 1 >= 10 else warrant
        con.execute(
            "UPDATE morphism SET resonance_depth=?, last_seen=?, warrant=? WHERE id=?",
            (depth + 1, now, new_warrant, mid))
        return mid
    cur = con.execute(
        """INSERT INTO morphism
           (src, dst, type, resonance_depth, warrant, is_open, first_seen, last_seen)
           VALUES (?, ?, ?, 1, ?, 1, ?, ?)""",
        (src, dst, type_, warrant, now, now))
    return cur.lastrowid


def ingest_session(con, sess):
    sid = sess['session_id']
    song_hash = sess.get('song_hash')

    session_node = upsert_node(con, 'session', sid)
    song_node = upsert_node(con, 'song', song_hash) if song_hash else None

    # Pre-create zone nodes (idempotent across runs).
    zone_ids = {z: upsert_node(con, 'zone', z) for z in ZONE_NAMES}

    last_band = None
    # Prefer events[] (graph schema); accept legacy frames[] as minimal events.
    raw_events = sess.get('events') or []
    if not raw_events and sess.get('frames'):
        for fr in sess['frames']:
            raw_events.append({
                't': (fr.get('t', 0) / 1000.0) if fr.get('t', 0) > 500 else fr.get('t', 0),
                'internal_f': fr.get('internal_f', fr.get('f', 0)),
                'external_fs': fr.get('external_fs', []),
                'amps': fr.get('amps', []),
                'sysAmp': fr.get('sysAmp', 0),
                'arActive': fr.get('arActive'),
            })
    for ev in raw_events:
        band = band_for(ev['internal_f'])
        band_id = upsert_node(con, 'band', f'b_{band:02d}',
                              data={'lo': BAND_LO_HZ * (BAND_HI_HZ/BAND_LO_HZ)**(band/N_BANDS),
                                    'hi': BAND_LO_HZ * (BAND_HI_HZ/BAND_LO_HZ)**((band+1)/N_BANDS)})

        # Causal morphisms: band → zone for every zone above threshold.
        amps = list(ev.get('amps') or [])
        if len(amps) != len(ZONE_NAMES):
            if len(amps) == 0:
                continue
            amps = (amps + [0.0] * len(ZONE_NAMES))[:len(ZONE_NAMES)]
        for zi, amp in enumerate(amps):
            if amp > 0.40:
                upsert_morphism(con, band_id, zone_ids[ZONE_NAMES[zi]], 'causal')

        # Structural morphisms: pairs of co-firing zones within this event.
        firing = [ZONE_NAMES[i] for i, a in enumerate(amps) if a > 0.40]
        for i, a in enumerate(firing):
            for b in firing[i+1:]:
                # Order pairs lexically so structural is symmetric (undirected).
                lo, hi = (a, b) if a < b else (b, a)
                upsert_morphism(con, zone_ids[lo], zone_ids[hi], 'structural')

        # Temporal morphisms: band(t-1) → band(t) — exploration path.
        if last_band is not None and last_band != band_id:
            upsert_morphism(con, last_band, band_id, 'temporal')
        last_band = band_id

        # Event node — one per "constellation snapshot" worth keeping
        # (only events with sysAmp > 0.30 to avoid bloat).
        if ev.get('sysAmp', 0) > 0.30:
            ev_key = f"{sid}:{ev['t']:.2f}"
            ev_id = upsert_node(con, 'event', ev_key,
                                data={'amps': amps, 'internal_f': ev['internal_f'],
                                      'sysAmp': ev['sysAmp']})
            upsert_morphism(con, session_node, ev_id, 'structural', warrant='empirical-strong')
            if song_node:
                upsert_morphism(con, song_node, ev_id, 'analogical', warrant='empirical-weak')
            # Event→zone causal links: which zones actually fired.
            # These are the neti-neti test surface — the paths from an event
            # through its zone activations are what structural similarity compares.
            for zi, amp in enumerate(amps):
                if amp > 0.40:
                    upsert_morphism(con, ev_id, zone_ids[ZONE_NAMES[zi]],
                                    'causal', warrant='empirical-strong')

    con.commit()


def main():
    ap = argparse.ArgumentParser(description="Ingest browser session JSONL → SQLite graph")
    ap.add_argument('--db', default='graph.db', help='SQLite database path')
    ap.add_argument('--schema', default=str(Path(__file__).parent / 'schema.sql'))
    ap.add_argument('jsonl', nargs='+', help='Session JSONL file(s) to ingest')
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    with open(args.schema) as f:
        con.executescript(f.read())

    total = 0
    for path in args.jsonl:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line: continue
                sess = json.loads(line)
                ingest_session(con, sess)
                total += 1
    print(f"Ingested {total} session(s) → {args.db}", file=sys.stderr)


if __name__ == '__main__':
    main()
