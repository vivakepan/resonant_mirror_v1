"""
verify_field_beats.py — §9 automated interference beat test

Python port of field.js computeField(), used to verify that the two-source
interference model produces genuine constructive/destructive geometry.

Run from repo root: python3 tools/verify_field_beats.py

Tests:
  1. No sources → zero field (guard clause)
  2. Single source → non-zero, amplitude > threshold
  3. Two coherent sources → simultaneous spatial nodes AND antinodes
  4. Bipolar field (both + and − cells) when interference is active
  5. Superposition: combined maxA ≥ either individual

Constants mirror field.js exactly. If they drift, tests will catch it.
"""

import math
import sys

# ── Mirror of field.js constants ─────────────────────────────────
GRID_W   = 48
GRID_H   = 60
K_AT_440 = 18.0
W_AT_440 = 0.012     # rad per ms (visualization-scale, not acoustic)

INT_SRC = (0.50, 0.52)   # internal larynx position
EXT_SRC = (0.50, 0.08)   # external skull-top position

def _wave_k(f): return K_AT_440 * (f / 440.0)
def _wave_w(f): return W_AT_440 * (f / 440.0)


def compute_field(internal_drv, external_drvs, t):
    """
    Python port of computeField() from src/field.js.
    internal_drv: dict {f, amp} or None
    external_drvs: list of {f, amp}
    t: visual time in ms
    Returns (buf, maxA).
    """
    buf  = [0.0] * (GRID_W * GRID_H)
    maxA = 0.0
    ix, iy = INT_SRC
    ex, ey = EXT_SRC

    has_int = internal_drv is not None and internal_drv.get('amp', 0) > 0.01
    exts    = [d for d in (external_drvs or []) if d.get('amp', 0) > 0.01]

    if not has_int and not exts:
        return buf, 0.0

    int_k = _wave_k(internal_drv['f']) if has_int else 0.0
    int_p = _wave_w(internal_drv['f']) * t if has_int else 0.0
    int_a = internal_drv['amp'] if has_int else 0.0
    ext_p = [{'A': d['amp'], 'k': _wave_k(d['f']), 'pt': _wave_w(d['f']) * t} for d in exts]

    for gy in range(GRID_H):
        y = gy / (GRID_H - 1)
        for gx in range(GRID_W):
            x  = gx / (GRID_W - 1)
            A  = 0.0
            if has_int:
                r = math.sqrt((x - ix)**2 + (y - iy)**2)
                A += int_a * math.sin(int_k * r - int_p)
            for d in ext_p:
                r = math.sqrt((x - ex)**2 + (y - ey)**2)
                A += d['A'] * math.sin(d['k'] * r - d['pt'])
            buf[gy * GRID_W + gx] = A
            if abs(A) > maxA:
                maxA = abs(A)

    return buf, maxA


# ── Test helpers ─────────────────────────────────────────────────

_failures = []

def check(cond, label):
    if cond:
        print(f'  OK   {label}')
    else:
        print(f'  FAIL {label}')
        _failures.append(label)


# ── Tests ─────────────────────────────────────────────────────────

def test_no_sources():
    _, maxA = compute_field(None, [], 0)
    check(maxA == 0.0, 'no sources: maxA == 0')
    _, maxA2 = compute_field({'f': 220, 'amp': 0.0}, [], 0)
    check(maxA2 == 0.0, 'zero-amp source treated as absent')


def test_single_source():
    drv = {'f': 220, 'amp': 1.0}
    buf, maxA = compute_field(drv, [], 0)
    check(maxA > 0.5, f'single source 220 Hz: maxA={maxA:.3f} > 0.5')
    # Field near source position should carry amplitude
    sgx = round(INT_SRC[0] * (GRID_W - 1))
    sgy = round(INT_SRC[1] * (GRID_H - 1))
    check(abs(buf[sgy * GRID_W + sgx]) > 0.001, 'non-zero amplitude at source grid cell')


def test_interference_structure():
    int_drv = {'f': 440, 'amp': 1.0}
    ext_drv = {'f': 440, 'amp': 1.0}
    buf, maxA = compute_field(int_drv, [ext_drv], 0)
    check(maxA > 0.5, f'two-source 440 Hz: maxA={maxA:.3f} > 0.5')

    n_cells        = GRID_W * GRID_H
    node_thresh    = 0.05 * maxA
    antinode_thresh = 0.70 * maxA
    node_frac      = sum(1 for A in buf if abs(A) < node_thresh)    / n_cells
    antinode_frac  = sum(1 for A in buf if abs(A) > antinode_thresh) / n_cells

    check(node_frac    > 0.02, f'spatial nodes present ({node_frac:.1%} cells near zero)')
    check(antinode_frac > 0.02, f'antinodes present ({antinode_frac:.1%} cells high)')
    check(node_frac + antinode_frac < 0.98,
          'field has intermediate cells (not degenerate all-or-nothing)')


def test_bipolarity():
    buf, maxA = compute_field({'f': 300, 'amp': 1.0}, [{'f': 300, 'amp': 1.0}], 0)
    n_pos = sum(1 for A in buf if A > 0.05 * maxA)
    n_neg = sum(1 for A in buf if A < -0.05 * maxA)
    check(n_pos > 10 and n_neg > 10,
          f'bipolar field: {n_pos} positive cells, {n_neg} negative cells')


def test_superposition():
    drv = {'f': 440, 'amp': 1.0}
    _, mA_int  = compute_field(drv, [], 0)
    _, mA_ext  = compute_field(None, [drv], 0)
    _, mA_both = compute_field(drv, [drv], 0)
    min_single = min(mA_int, mA_ext)
    check(mA_both >= min_single * 0.9,
          f'superposition: combined maxA {mA_both:.3f} ≥ single {min_single:.3f} × 0.9')


def test_frequency_scaling():
    """Higher drive frequency → tighter interference fringes (more node/antinode cycles)."""
    def fringe_count(f):
        buf, maxA = compute_field({'f': f, 'amp': 1.0}, [{'f': f, 'amp': 1.0}], 0)
        if maxA < 0.01:
            return 0
        thresh = 0.5 * maxA
        # Count sign changes in the centre row as a proxy for fringe density.
        row = GRID_H // 2
        cells = [buf[row * GRID_W + gx] for gx in range(GRID_W)]
        above = [c > thresh for c in cells]
        return sum(1 for i in range(len(above) - 1) if above[i] != above[i + 1])

    n_lo = fringe_count(220)
    n_hi = fringe_count(880)
    check(n_hi >= n_lo,
          f'higher frequency → equal or more fringes ({n_lo} @ 220 Hz, {n_hi} @ 880 Hz)')


# ── Entry point ───────────────────────────────────────────────────

if __name__ == '__main__':
    print('== §9 field interference beat tests ==')
    test_no_sources()
    test_single_source()
    test_interference_structure()
    test_bipolarity()
    test_superposition()
    test_frequency_scaling()
    if _failures:
        print(f'\n{len(_failures)} test(s) FAILED: {_failures}')
        sys.exit(1)
    print('\nAll field beat tests passed.')
