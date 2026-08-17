#!/usr/bin/env python3
"""
neti_neti.py — The elimination test (§6.3 / PE v2.2 §7.2).

A homology candidate (src, dst) claims that two events/songs are
*structurally* alike — not merely surface-similar. The neti-neti test:

  1. Read the candidate's structural similarity (pre-permutation).
  2. Strip identity: replace zone identities in both neighborhoods
     with a random permutation of the zone set.
  3. Recompute structural similarity (post-permutation).
  4. If similarity is preserved under permutation:
        → match is STRUCTURAL → passes neti-neti → status='passed_neti_neti'
  5. If similarity collapses under permutation:
        → match was STATISTICAL PROXIMITY → fails → status='rejected_neti_neti'
        → write rejection_reason = "explained by shared zone identity"

This is the prize research contribution back to Presence Engine: a small,
finite, testable instance of the elimination test on a bounded domain.

The permutation test is repeated N times to compute a *collapse ratio*.
Default decision: pass if post-permutation similarity is within COLLAPSE_TOL
of pre-permutation similarity, averaged over N=50 trials.
"""

import argparse, random, sqlite3, sys, time
from collections import Counter
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))
from zones import ZONE_NAMES  # noqa: E402
from homology import typed_paths, jaccard, DEPTH

N_PERMUTATIONS = 50          # trials per candidate
COLLAPSE_TOL   = 0.10        # post-perm avg must be within this of pre-perm
                              # to count as "structural" (passing).


def permuted_paths(con, node_id, perm_map, depth=DEPTH):
    """
    Like typed_paths(), but every encountered zone key is rewritten via
    perm_map BEFORE the typed-path is recorded. Because typed_paths uses
    only type names (not keys), permutation operates by aliasing zone IDs.

    Trick: we rebuild the path with synthetic zone tags so that structurally
    similar paths still match across two permuted neighborhoods. The point
    is that PRE- and POST-permutation Jaccard between THE SAME PAIR of nodes
    is what we compare.
    """
    paths = Counter()
    # Resolve the zone-id → permuted-zone-id mapping once.
    zone_rows = con.execute(
        "SELECT id, key FROM node WHERE type='zone'").fetchall()
    zone_id_to_key = {nid: k for nid, k in zone_rows}

    frontier = [(node_id, ())]
    visited = set()
    for d in range(depth):
        next_frontier = []
        for nid, trail in frontier:
            rows = con.execute("""
                SELECT m.type, n.id, n.type, n.key FROM morphism m
                JOIN node n ON n.id = m.dst
                WHERE m.src = ?
                UNION
                SELECT m.type, n.id, n.type, n.key FROM morphism m
                JOIN node n ON n.id = m.src
                WHERE m.dst = ?
            """, (nid, nid)).fetchall()
            for mtype, dst_id, dst_type, dst_key in rows:
                if (dst_id, d) in visited: continue
                visited.add((dst_id, d))
                # Encode each node by (type, key). Zones get their key
                # remapped via perm_map — that's the test surface. Bands,
                # songs, sessions, events keep their real keys, because
                # those are the things we WANT to disambiguate by identity
                # (so neti-neti can detect whether the match was driven
                # by shared zones vs. genuinely shared graph structure).
                if dst_type == 'zone':
                    # Zones are the test surface — permute their identities.
                    tag = f"zone:{perm_map.get(dst_key, dst_key)}"
                elif dst_type in ('band', 'song'):
                    # Frequency bands and song hashes are stable identifiers
                    # worth preserving — they carry structural frequency-location
                    # information that real structural matches should also share.
                    tag = f"{dst_type}:{dst_key}"
                else:
                    # Sessions and events are ephemeral identifiers; strip to
                    # type-only so they contribute pattern without noise.
                    tag = dst_type
                step = trail + (mtype, tag)
                paths[step] += 1
                next_frontier.append((dst_id, step))
        frontier = next_frontier
    return paths


def keyed_paths(con, node_id, depth=DEPTH):
    """Pre-permutation version of permuted_paths — uses real zone keys."""
    return permuted_paths(con, node_id, perm_map={}, depth=depth)


def neti_neti(con, src_id, dst_id):
    """
    Returns (passed, pre_sim, post_avg, reason_or_none).
    """
    a_pre = keyed_paths(con, src_id)
    b_pre = keyed_paths(con, dst_id)
    pre_sim = jaccard(a_pre, b_pre)

    post_sims = []
    for _ in range(N_PERMUTATIONS):
        # CRITICAL: apply INDEPENDENT permutations to each side.
        # If both nodes were really matching via shared zone IDENTITY
        # (e.g., "they both fire chest+heart"), then breaking the
        # identity correspondence by relabeling each side differently
        # collapses Jaccard → match was statistical proximity (reject).
        # If both nodes share the *structural pattern* of typed paths
        # regardless of which zones host them, Jaccard stays high
        # (the pattern survives any consistent renaming) → real
        # structural match (pass).
        perm_a = list(ZONE_NAMES); random.shuffle(perm_a)
        perm_b = list(ZONE_NAMES); random.shuffle(perm_b)
        a_post = permuted_paths(con, src_id, dict(zip(ZONE_NAMES, perm_a)))
        b_post = permuted_paths(con, dst_id, dict(zip(ZONE_NAMES, perm_b)))
        post_sims.append(jaccard(a_post, b_post))
    post_avg = sum(post_sims) / len(post_sims)

    delta = pre_sim - post_avg
    if abs(delta) <= COLLAPSE_TOL:
        return True, pre_sim, post_avg, None
    if delta > COLLAPSE_TOL:
        return False, pre_sim, post_avg, "collapsed under permutation — shared zone identity drove the match"
    return True, pre_sim, post_avg, None  # post > pre is structurally fine


def process_candidates(con):
    rows = con.execute(
        "SELECT id, src, dst FROM homology_candidate WHERE status='pending'"
    ).fetchall()
    now = time.time()
    passed, rejected = 0, 0
    for cid, src, dst in rows:
        ok, pre, post, reason = neti_neti(con, src, dst)
        if ok:
            con.execute("""
                UPDATE homology_candidate
                SET status='passed_neti_neti', tested_at=?
                WHERE id=?
            """, (now, cid))
            # Promote to homological morphism with the appropriate warrant.
            warrant = 'empirical-strong' if pre > 0.75 else 'empirical-weak'
            con.execute("""
                INSERT OR IGNORE INTO morphism
                (src, dst, type, resonance_depth, warrant, is_open, first_seen, last_seen, evidence_json)
                VALUES (?, ?, 'homological', 1, ?, 1, ?, ?, ?)
            """, (src, dst, warrant, now, now,
                  f'{{"pre_sim": {pre:.3f}, "post_avg": {post:.3f}}}'))
            passed += 1
        else:
            con.execute("""
                UPDATE homology_candidate
                SET status='rejected_neti_neti', rejection_reason=?, tested_at=?
                WHERE id=?
            """, (reason, now, cid))
            rejected += 1
    con.commit()
    return passed, rejected


def main():
    ap = argparse.ArgumentParser(description="Neti-neti elimination test (§6.3)")
    ap.add_argument('--db', default='graph.db')
    args = ap.parse_args()
    con = sqlite3.connect(args.db)
    passed, rejected = process_candidates(con)
    print(f"Neti-neti: passed={passed}, rejected={rejected}", file=sys.stderr)


if __name__ == '__main__':
    main()
