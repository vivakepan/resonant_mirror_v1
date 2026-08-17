#!/usr/bin/env python3
"""
homology.py — Asynchronous structural-homology engine (§6.2 / PE v2.2 L1).

Runs offline between sessions. For each pair of "candidate" nodes
(typically two events or two songs), it:

  1. Extracts the typed-morphism neighborhood of depth d around each.
  2. Strips the node labels — keeps only the *type sequence* of edges.
  3. Computes structural similarity (Jaccard on typed-path multisets).
  4. Writes candidates above τ to the `homology_candidate` table with status='pending'.

Candidates are NOT promoted to homological morphisms here — they pass
through neti-neti elimination first (neti_neti.py, §6.3).
"""

import argparse, json, sqlite3, sys, time
from collections import Counter
from pathlib import Path

# Similarity threshold and confirmation-neighborhood requirement.
SIMILARITY_TAU = 0.55      # τ
DEPTH = 2                  # neighborhood depth
MIN_NEIGHBORHOOD_SIZE = 4  # tiny neighborhoods produce spurious 1.0 matches


def typed_paths(con, node_id, depth=DEPTH):
    """
    Return the multiset of *typed paths* of length ≤ depth originating
    at node_id. A typed path is the sequence of morphism types along a
    walk, with node TYPES (not keys) at each step. This is what the
    neti-neti permutation test will probe.

    Example path: ('event', 'structural', 'zone', 'structural', 'zone')
    """
    paths = Counter()
    frontier = [(node_id, [])]
    visited_at_depth = set()

    for d in range(depth):
        next_frontier = []
        for nid, trail in frontier:
            rows = con.execute("""
                SELECT m.type, n.id, n.type FROM morphism m
                JOIN node n ON n.id = m.dst
                WHERE m.src = ?
                UNION
                SELECT m.type, n.id, n.type FROM morphism m
                JOIN node n ON n.id = m.src
                WHERE m.dst = ?
            """, (nid, nid)).fetchall()
            for mtype, dst_id, dst_type in rows:
                if (dst_id, d) in visited_at_depth: continue
                visited_at_depth.add((dst_id, d))
                step = trail + [mtype, dst_type]
                paths[tuple(step)] += 1
                next_frontier.append((dst_id, step))
        frontier = next_frontier
    return paths


def jaccard(a: Counter, b: Counter) -> float:
    if not a and not b: return 0.0
    keys = set(a) | set(b)
    inter = sum(min(a[k], b[k]) for k in keys)
    union = sum(max(a[k], b[k]) for k in keys)
    return inter / union if union else 0.0


def detect(con, candidate_types=('event', 'song'), max_candidates=500):
    """
    For each pair of nodes of an interesting type, compute typed-path
    Jaccard similarity. Write everything ≥ τ to homology_candidate.

    `max_candidates` caps the candidate table per run to keep neti_neti.py
    tractable. With O(n²) event pairs and N_PERMUTATIONS=50, unbounded
    detection quickly exceeds the frame budget for the offline process.
    Default 500 is the verified-safe upper bound for the current path
    computation speed (~0.5–2s on 500 with default N_PERMUTATIONS).

    For production-scale data, replace this O(n²) scan with an LSH-backed
    approximate nearest-neighbor index over path-multisets.
    """
    now = time.time()
    nodes = con.execute(
        f"SELECT id, type FROM node WHERE type IN ({','.join('?'*len(candidate_types))})",
        candidate_types).fetchall()

    found = 0
    for i, (a_id, a_type) in enumerate(nodes):
        if found >= max_candidates: break
        a_paths = typed_paths(con, a_id)
        if sum(a_paths.values()) < MIN_NEIGHBORHOOD_SIZE: continue
        for b_id, b_type in nodes[i+1:]:
            if found >= max_candidates: break
            if b_type != a_type: continue  # only same-type comparisons
            b_paths = typed_paths(con, b_id)
            if sum(b_paths.values()) < MIN_NEIGHBORHOOD_SIZE: continue
            sim = jaccard(a_paths, b_paths)
            if sim >= SIMILARITY_TAU:
                con.execute("""
                    INSERT OR IGNORE INTO homology_candidate
                    (src, dst, similarity, neighborhood_d, status, detected_at)
                    VALUES (?, ?, ?, ?, 'pending', ?)
                """, (a_id, b_id, sim, DEPTH, now))
                found += 1
    con.commit()
    return found


def main():
    ap = argparse.ArgumentParser(description="Async structural-homology detection (§6.2)")
    ap.add_argument('--db', default='graph.db')
    ap.add_argument('--types', nargs='+', default=['event', 'song'],
                    help='Node types eligible for homology detection')
    ap.add_argument('--max-candidates', type=int, default=500,
                    help='Cap candidate table per run (default 500, see docstring)')
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    n = detect(con, tuple(args.types), max_candidates=args.max_candidates)
    print(f"Detected {n} candidate(s) ≥ τ={SIMILARITY_TAU}", file=sys.stderr)


if __name__ == '__main__':
    main()
