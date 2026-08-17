"""
physics.py — Python port of src/physics.js

A faithful reimplementation of the coupled-oscillator resonance model
so that synthetic sessions are generated from the *same* physics the
artifact renders. If you change src/physics.js, change this to match.

Last synced 2026-05-28 — multi-modal zones (chest, skull), anatomical
adjacency coupling (replaced old Euclidean Gaussian), multi-driver
zone_response, and multi-driver active_anti_resonance.
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Optional


# ─── Zone definitions (must match physics.js) ──────────────────
# Modes: list of (f, Q) pairs. If omitted, falls back to (freq, Q).
# Multi-modal zones (chest, skull) sum contributions across modes,
# matching zoneResponse() in physics.js.

@dataclass(frozen=True)
class Zone:
    id: str
    name: str
    nx: float
    ny: float
    freq: float
    Q: float
    modes: tuple = ()   # tuple of (f, Q) — empty means single-mode at (freq, Q)

    def get_modes(self):
        """Return list of (f, Q) tuples, falling back to (freq, Q)."""
        return list(self.modes) if self.modes else [(self.freq, self.Q)]


ZONES = [
    Zone("chest",    "Chest cavity",    0.50, 0.78, 120, 0.35,
         modes=((120, 0.35), (600, 0.50))),
    Zone("heart",    "Heart",           0.45, 0.69, 105, 0.28,
         modes=((105, 0.28),)),
    Zone("tracheal", "Tracheal column", 0.50, 0.62, 180, 0.45,
         modes=((180, 0.45),)),
    Zone("larynx",   "Larynx",          0.50, 0.52, 220, 0.20,
         modes=((220, 0.20),)),
    Zone("pharynx",  "Pharynx",         0.50, 0.45, 300, 0.50,
         modes=((300, 0.50),)),
    Zone("mouth",    "Oral cavity",     0.56, 0.36, 420, 0.55,
         modes=((420, 0.55),)),
    Zone("nasal",    "Nasal / sinuses", 0.51, 0.30, 580, 0.60,
         modes=((580, 0.60),)),
    Zone("skull",    "Cranial bone",    0.50, 0.20, 520, 0.40,
         modes=((520, 0.40), (1200, 0.35), (2800, 0.30))),
    Zone("eyes",     "Orbital cavities",0.56, 0.26, 680, 0.70,
         modes=((680, 0.70),)),
    Zone("ears",     "Inner ear",       0.42, 0.26, 760, 0.80,
         modes=((760, 0.80),)),
]


# ─── Anti-resonance pairs (must match physics.js derivation) ────

def _build_anti_resonances():
    sorted_zones = sorted(ZONES, key=lambda z: z.freq)
    pairs = []
    for i in range(len(sorted_zones) - 1):
        a, b = sorted_zones[i], sorted_zones[i + 1]
        if b.freq / a.freq > 2.2:
            continue
        f = math.sqrt(a.freq * b.freq)
        gap = b.freq - a.freq
        width = max(6.0, gap * 0.13)
        depth = 0.85
        pairs.append({"a": a, "b": b, "f": f, "width": width, "depth": depth})
    return pairs


ANTI_RESONANCES = _build_anti_resonances()


def anti_resonance_factor(zone: Zone, drive_f: float) -> float:
    factor = 1.0
    for ar in ANTI_RESONANCES:
        if ar["a"] is not zone and ar["b"] is not zone:
            continue
        d = abs(drive_f - ar["f"])
        if d > ar["width"] * 3:
            continue
        dip = ar["depth"] * math.exp(-((d / ar["width"]) ** 2))
        factor *= (1 - dip)
    return factor


def active_anti_resonance(drivers: list[dict]):
    """
    Matches physics.js activeAntiResonance(drivers[]).
    drivers is a list of {f, amp, ...}.
    Returns (ar_pair, strength) or (None, 0.0).
    """
    best, best_score = None, 0.0
    for drv in drivers:
        amp = drv.get("amp", 1.0)
        if amp <= 0.01:
            continue
        drive_f = drv["f"]
        for ar in ANTI_RESONANCES:
            d = abs(drive_f - ar["f"])
            if d > ar["width"] * 2.2:
                continue
            score = math.exp(-((d / ar["width"]) ** 2)) * amp
            if score > best_score:
                best_score, best = score, ar
    return (best, best_score) if best else (None, 0.0)


def zone_response(zone: Zone, drivers: list[dict]) -> float:
    """
    Matches physics.js zoneResponse(zone, drivers).
    Sums per-driver, per-mode harmonic responses.
    """
    modes = zone.get_modes()
    total = 0.0
    for drv in drivers:
        amp = drv.get("amp", 1.0)
        if amp <= 0.01:
            continue
        driver_resp = 0.0
        for (mf, mq) in modes:
            best_h = 0.0
            for h in range(1, 9):
                hf = drv["f"] * h
                ratio = hf / mf
                if ratio < 0.25 or ratio > 4:
                    continue
                cents = abs(math.log2(ratio)) * 1200
                bw = mq * 600
                g = math.exp(-((cents / bw) ** 2))
                r = g / (h ** 0.55)
                if r > best_h:
                    best_h = r
            driver_resp += best_h
        total += driver_resp * amp * anti_resonance_factor(zone, drv["f"])
    return min(1.0, total)


# ─── Anatomical adjacency coupling (matches physics.js adjacency[]) ──
# Topology is the claim; weights are tunable. Each edge has a named
# anatomical pathway justification in physics.js; replicated here.

_ADJACENCY_EDGES = [
    ("chest",    "tracheal", 0.50),
    ("tracheal", "larynx",   0.70),
    ("larynx",   "pharynx",  0.70),
    ("pharynx",  "mouth",    0.60),
    ("pharynx",  "nasal",    0.45),
    ("mouth",    "nasal",    0.30),
    ("chest",    "heart",    0.55),
    ("chest",    "larynx",   0.40),
    ("heart",    "tracheal", 0.30),
    ("nasal",    "skull",    0.45),
    ("skull",    "eyes",     0.50),
    ("skull",    "ears",     0.55),
    ("nasal",    "eyes",     0.30),
]
COUPLING_GAIN = 0.10

_ZONE_INDEX = {z.id: i for i, z in enumerate(ZONES)}

def _build_adjacency_matrix():
    n = len(ZONES)
    m = [[0.0] * n for _ in range(n)]
    for a_id, b_id, w in _ADJACENCY_EDGES:
        ai, bi = _ZONE_INDEX[a_id], _ZONE_INDEX[b_id]
        m[ai][bi] = max(m[ai][bi], w)
        m[bi][ai] = max(m[bi][ai], w)
    return m

_ADJACENCY_MATRIX = _build_adjacency_matrix()


def apply_coupling(raw_amps: list[float]) -> list[float]:
    """Anatomical adjacency coupling — matches physics.js applyCoupling."""
    coupled = list(raw_amps)
    n = len(ZONES)
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            coupled[i] += raw_amps[j] * _ADJACENCY_MATRIX[i][j] * COUPLING_GAIN
        coupled[i] = min(1.0, coupled[i])
    return coupled


def system_state(drive_f: float, extra_drivers: list[dict] | None = None):
    """
    Return (amps, sys_amp, active_count, ar_strength) for a primary
    drive frequency plus optional extra drivers.
    Signature compatible with existing generate.py callers.
    """
    drivers = [{"f": drive_f, "amp": 1.0, "phase": 0.0, "origin": "internal"}]
    if extra_drivers:
        drivers.extend(extra_drivers)
    raw = [zone_response(z, drivers) for z in ZONES]
    amps = apply_coupling(raw)
    sys_amp = sum(amps) / len(amps)
    active_count = sum(1 for a in amps if a > 0.4)
    _, ar_strength = active_anti_resonance(drivers)
    return amps, sys_amp, active_count, ar_strength


if __name__ == "__main__":
    # Self-check: compare key presets against expected qualitative behavior.
    for label, f in [("A3", 220), ("SWEET", 261.6), ("DEAD", 355), ("SKULL", 587),
                     ("CHEST", 98), ("FORMANT", 2800)]:
        amps, sys_amp, active, ar = system_state(f)
        top = sorted(zip([z.name for z in ZONES], amps), key=lambda x: -x[1])[:3]
        top_str = ", ".join(f"{n} {a*100:.0f}%" for n, a in top)
        print(f"{label:7} @ {f:6} Hz | sysAmp {sys_amp:.2f} | active {active} | AR {ar:.2f} | top: {top_str}")
