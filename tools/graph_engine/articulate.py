#!/usr/bin/env python3
"""
articulate.py — §6.4 articulation surface generator.

Reads the morphism graph and emits a read-only `articulation.json` that
the browser can OPTIONALLY load to enrich its badge tooltip.

Hard guardrails (the anti-recommendation discipline from §6.4):
  - Strictly past-tense and passive. Never predictive, never prescriptive.
  - Every recognition statement MUST be paired with at least one
    open-horizon statement (what is NOT known) — the deferred-closure
    discipline from PE v2.2.
  - No claim about the *current* user's body. Recognitions reference
    prior observations only.

Output schema (one JSON file consumed by src/articulation.js):
  {
    "generated_at": <epoch>,
    "items": [
      {
        "recognition": "...",
        "opening":     "...",
        "warrant":     "empirical-strong" | ...,
      },
      ...
    ]
  }
"""

import argparse, json, sqlite3, sys, time
from pathlib import Path


def collect_strong_structural(con, min_depth=10):
    """
    Zone-zone structural co-firing pairs with depth ≥ min_depth.
    These are the safest things to articulate — both endpoints are
    deterministic concepts (zone names), and the evidence is repeated.
    """
    return con.execute("""
        SELECT a.key, b.key, m.resonance_depth, m.warrant
        FROM morphism m
        JOIN node a ON a.id = m.src
        JOIN node b ON b.id = m.dst
        WHERE m.type = 'structural'
          AND a.type = 'zone' AND b.type = 'zone'
          AND m.resonance_depth >= ?
        ORDER BY m.resonance_depth DESC
        LIMIT 20
    """, (min_depth,)).fetchall()


def collect_unexplored_bands(con, total_band_count=32, min_sessions=3):
    """
    Bands that have been touched by FEWER than min_sessions distinct
    sessions are "open horizons" — explicit unexplored zones, per the
    PE deferred-closure discipline.
    """
    rows = con.execute("""
        SELECT n.key, COUNT(DISTINCT m.src) as sess_count
        FROM node n
        LEFT JOIN morphism m ON m.dst = n.id AND m.type = 'causal'
        WHERE n.type = 'band'
        GROUP BY n.id
        HAVING sess_count < ?
    """, (min_sessions,)).fetchall()
    return rows


def render(con):
    items = []

    structurals = collect_strong_structural(con)
    unexplored  = collect_unexplored_bands(con)

    # Pair each strong recognition with at least one opening — that's
    # the hard rule. If we have no openings, we emit NOTHING. Silence
    # is preferable to a recognition without revealed limits.
    if not unexplored:
        return {'generated_at': time.time(),
                'items': [],
                'note': 'No open horizons currently registered — withholding articulation per §6.4'}

    # Recognitions: zone-zone structural co-firings (past-tense, passive).
    for a_key, b_key, depth, warrant in structurals:
        opening = unexplored[len(items) % len(unexplored)]  # cycle through openings
        items.append({
            'recognition': f"{a_key.capitalize()} and {b_key} co-activated across "
                           f"{depth} independent observations.",
            'opening':     f"No session has yet explored band {opening[0]} "
                           f"({opening[1]} sessions touched it).",
            'warrant':     warrant,
        })

    return {'generated_at': time.time(), 'items': items}


def main():
    ap = argparse.ArgumentParser(description="Generate read-only articulation.json")
    ap.add_argument('--db', default='graph.db')
    ap.add_argument('--out', default='articulation.json')
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    doc = render(con)
    Path(args.out).write_text(json.dumps(doc, indent=2))
    print(f"Wrote {len(doc.get('items', []))} articulation item(s) → {args.out}",
          file=sys.stderr)


if __name__ == '__main__':
    main()
