"""
generate.py — Synthetic session generator for the Resonant Singer

Produces labeled session traces by simulating users exploring the
frequency spectrum in different styles, then running each visited
frequency through the same physics the artifact uses.

LABEL (default per project decision 1b):
    Did the session find a NON-OBVIOUS coupling / anti-resonance state?

    "Non-obvious" is defined operationally (see did_find_nonobvious):
    a state that is NOT reachable by simply clicking a preset button —
    i.e., the user discovered, through their own exploration, either
      (a) a whole-system coupling state at a frequency that is not a
          labeled preset, OR
      (b) an anti-resonance node (which no preset directly targets).

    This label is interesting precisely because it separates users who
    only clicked the obvious presets from users who explored the spaces
    between them. It is the operational form of "found something the
    UI didn't hand them."

Why this label rather than "reached whole-system resonance":
    Whole-system resonance is reachable by clicking SWEET or A3 — it's
    handed to the user. Non-obvious discovery requires genuine
    exploration, which is the behavior the project actually cares about
    surfacing. (See methodology: the interesting signal is exploration
    that exceeds what was prescribed.)

Output: JSONL, one session per line, plus a summary.
"""

from __future__ import annotations
import argparse
import json
import math
import random
from dataclasses import dataclass, asdict
from physics import system_state, ANTI_RESONANCES

# Preset frequencies the UI hands the user directly (the "obvious" set).
PRESETS = [98, 105, 220, 261.6, 440, 587]
# Anti-resonance button frequencies (also UI-provided, but their *states* are non-obvious).
ANTI_BUTTONS = [78, 147, 355, 467, 628, 845]

FREQ_MIN, FREQ_MAX = 70, 900

# Thresholds defining an "interesting" state when found mid-exploration.
# NOTE (2026-05-21): the original loose coupling bar (sysAmp>=.35 OR active>=3)
# was reached by ~66% of all frequencies, saturating the label at 98.5%.
# Diagnosis across the spectrum showed the discriminating states are:
#   strong coupling (sysAmp>=.45 AND active>=5):  ~2% of spectrum
#   anti-resonance  (ar>=.55):                    ~17% of spectrum
# The label is rebuilt around these rarer, genuinely-non-obvious states.
STRONG_SYSAMP = 0.45
STRONG_ACTIVE = 5
ANTIRES_STRENGTH = 0.55
# A "dwell" in anti-resonance requires staying near the notch, not just
# passing through once — so anti-res only counts if visited >= 2 times.
ANTIRES_MIN_VISITS = 2
PRESET_TOLERANCE = 4.0  # Hz — within this of a preset counts as "clicked the obvious thing"


@dataclass
class Session:
    style: str
    n_steps: int
    trajectory: list           # list of visited frequencies
    max_sysamp: float
    max_active: int
    max_ar_strength: float
    n_coupling_states: int     # how many visited freqs were coupling states
    n_antires_states: int      # how many were anti-resonance states
    visited_offpreset_coupling: bool
    visited_antires: bool
    label_nonobvious: int      # the target label (0/1)


def near_any(f, freqs, tol=PRESET_TOLERANCE):
    return any(abs(f - p) <= tol for p in freqs)


# ─── Exploration-style trajectory generators ───────────────────

def traj_sweeper(rng, n):
    """Smooth sweep across the spectrum, possibly partial, possibly reversed."""
    start = rng.uniform(FREQ_MIN, FREQ_MAX * 0.4)
    end = rng.uniform(FREQ_MAX * 0.6, FREQ_MAX)
    if rng.random() < 0.5:
        start, end = end, start
    return [start + (end - start) * (i / (n - 1)) for i in range(n)]


def traj_dweller(rng, n):
    """Picks 1-2 points and lingers hard, with small jitter. A true dweller
    barely moves — so it often never finds the interesting spaces."""
    n_anchors = rng.randint(1, 2)
    anchors = [rng.uniform(FREQ_MIN, FREQ_MAX) for _ in range(n_anchors)]
    out = []
    per = max(1, n // n_anchors)
    for a in anchors:
        for _ in range(per):
            out.append(min(FREQ_MAX, max(FREQ_MIN, a + rng.gauss(0, 4))))
    return out[:n]


def traj_preset_hopper(rng, n):
    """Mostly jumps between preset/anti-button frequencies, rarely strays."""
    pool = PRESETS + ANTI_BUTTONS
    out = []
    for _ in range(n):
        if rng.random() < 0.85:
            out.append(rng.choice(pool) + rng.gauss(0, 1.5))
        else:
            out.append(rng.uniform(FREQ_MIN, FREQ_MAX))
    return out


def traj_random_walk(rng, n):
    """Brownian-ish wander — the genuine explorer."""
    f = rng.uniform(FREQ_MIN, FREQ_MAX)
    out = [f]
    for _ in range(n - 1):
        f = min(FREQ_MAX, max(FREQ_MIN, f + rng.gauss(0, 45)))
        out.append(f)
    return out


STYLES = {
    "sweeper": traj_sweeper,
    "dweller": traj_dweller,
    "preset_hopper": traj_preset_hopper,
    "random_walk": traj_random_walk,
}


# ─── Label logic ───────────────────────────────────────────────

def did_find_nonobvious(trajectory):
    """
    Returns (label, stats). label=1 if the session found a non-obvious state:
      (a) a STRONG coupling state (sysAmp>=.45 AND active>=5) at an
          off-preset frequency — genuine discovery, not a preset click, OR
      (b) lingered in an anti-resonance node (ar>=.55 on >=2 visits).
    Both require real exploration of the spaces between the preset buttons.
    """
    max_sysamp = 0.0
    max_active = 0
    max_ar = 0.0
    n_coupling = 0          # strong coupling visits
    n_antires = 0           # anti-resonance visits
    offpreset_strong = False
    antires_visits = 0

    for f in trajectory:
        amps, sys_amp, active, ar = system_state(f)
        max_sysamp = max(max_sysamp, sys_amp)
        max_active = max(max_active, active)
        max_ar = max(max_ar, ar)

        is_strong = (sys_amp >= STRONG_SYSAMP) and (active >= STRONG_ACTIVE)
        is_antires = ar >= ANTIRES_STRENGTH

        if is_strong:
            n_coupling += 1
            if not near_any(f, PRESETS):
                offpreset_strong = True
        if is_antires:
            n_antires += 1
            antires_visits += 1

    visited_antires = antires_visits >= ANTIRES_MIN_VISITS
    label = 1 if (offpreset_strong or visited_antires) else 0
    stats = dict(
        max_sysamp=round(max_sysamp, 3),
        max_active=max_active,
        max_ar_strength=round(max_ar, 3),
        n_coupling_states=n_coupling,
        n_antires_states=n_antires,
        visited_offpreset_coupling=offpreset_strong,
        visited_antires=visited_antires,
    )
    return label, stats


# ─── Session generation ────────────────────────────────────────

def make_session(rng, style=None):
    style = style or rng.choice(list(STYLES.keys()))
    # Shorter, more realistic sessions: most people try a handful of things.
    # Long sessions trivially stumble into interesting states, which washes
    # out the label. Geometric-ish distribution favors short sessions.
    n = min(40, max(4, int(rng.expovariate(1 / 12)) + 4))
    trajectory = [round(min(FREQ_MAX, max(FREQ_MIN, f)), 1)
                  for f in STYLES[style](rng, n)]
    label, stats = did_find_nonobvious(trajectory)
    return Session(
        style=style,
        n_steps=len(trajectory),
        trajectory=trajectory,
        label_nonobvious=label,
        **stats,
    )


def main():
    ap = argparse.ArgumentParser(description="Generate synthetic Resonant Singer sessions.")
    ap.add_argument("-n", "--n-sessions", type=int, default=3000)
    ap.add_argument("-o", "--out", default="sessions.jsonl")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--balance", action="store_true",
                    help="Resample to ~50/50 class balance (caps the majority class).")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    sessions = [make_session(rng) for _ in range(args.n_sessions)]

    if args.balance:
        pos = [s for s in sessions if s.label_nonobvious == 1]
        neg = [s for s in sessions if s.label_nonobvious == 0]
        k = min(len(pos), len(neg))
        rng.shuffle(pos); rng.shuffle(neg)
        sessions = pos[:k] + neg[:k]
        rng.shuffle(sessions)

    with open(args.out, "w") as fh:
        for s in sessions:
            fh.write(json.dumps(asdict(s)) + "\n")

    # Summary
    n = len(sessions)
    pos = sum(s.label_nonobvious for s in sessions)
    by_style = {}
    for s in sessions:
        d = by_style.setdefault(s.style, [0, 0])
        d[0] += 1
        d[1] += s.label_nonobvious

    print(f"Wrote {n} sessions to {args.out}")
    print(f"Positive label (found non-obvious state): {pos} ({100*pos/n:.1f}%)")
    print("\nBy exploration style:")
    print(f"  {'style':16} {'count':>6} {'pos':>6} {'rate':>7}")
    for style, (cnt, p) in sorted(by_style.items()):
        print(f"  {style:16} {cnt:>6} {p:>6} {100*p/cnt:>6.1f}%")
    print(f"\nClass balance: {pos}/{n} positive, {n-pos}/{n} negative")
    print("Note: preset_hopper should have a HIGH rate (it hits anti-buttons),")
    print("      random_walk a MODERATE rate (genuine exploration),")
    print("      sweeper a HIGH rate (crosses everything),")
    print("      dweller a LOW rate (lingers, may miss the interesting spots).")


if __name__ == "__main__":
    main()
