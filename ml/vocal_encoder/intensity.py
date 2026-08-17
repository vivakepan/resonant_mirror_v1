"""
Pairwise human-perceived expressive-intensity ranking (Phase 8).

The model must outperform or meaningfully differ from a loudness-only
baseline before intensity is exposed to users.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PairwiseAnnotation:
    performance_id: str
    a_id: str
    b_id: str
    prefer: str  # 'a' | 'b' | 'disagree'
    votes: list[str]
    disagreement_rate: float
    loudness_a: float
    loudness_b: float
    pitch_height_a: float
    pitch_height_b: float
    distortion_a: float
    distortion_b: float


def aggregate_votes(votes: list[str]) -> tuple[str, float]:
    if not votes:
        return "disagree", 1.0
    a = votes.count("a")
    b = votes.count("b")
    if a == b:
        return "disagree", 1.0
    winner = "a" if a > b else "b"
    rate = 1 - max(a, b) / len(votes)
    return winner, rate


def loudness_baseline_prefer(pair: PairwiseAnnotation) -> str:
    if abs(pair.loudness_a - pair.loudness_b) < 1e-6:
        return "disagree"
    return "a" if pair.loudness_a > pair.loudness_b else "b"


def ranking_accuracy(pairs: list[PairwiseAnnotation], prefer_fn) -> float:
    labeled = [p for p in pairs if p.prefer in ("a", "b")]
    if not labeled:
        return 0.0
    correct = sum(1 for p in labeled if prefer_fn(p) == p.prefer)
    return correct / len(labeled)


def shortcut_score(pairs: list[PairwiseAnnotation], prefer_fn, feature: str) -> float:
    """How often the predictor agrees with a trivial feature shortcut."""
    def feat_pref(p: PairwiseAnnotation) -> str:
        va = getattr(p, f"{feature}_a")
        vb = getattr(p, f"{feature}_b")
        if abs(va - vb) < 1e-9:
            return "disagree"
        return "a" if va > vb else "b"
    labeled = [p for p in pairs if p.prefer in ("a", "b")]
    if not labeled:
        return 0.0
    return sum(1 for p in labeled if prefer_fn(p) == feat_pref(p)) / len(labeled)


def may_expose_intensity(learned_acc: float, loudness_acc: float, min_delta: float = 0.05) -> bool:
    """Gate: learned ranking must beat or meaningfully differ from loudness."""
    return learned_acc >= loudness_acc + min_delta


def pairwise_margin_loss(score_chosen, score_other, margin: float = 1.0):
    # max(0, margin - (chosen - other))
    diff = margin - (score_chosen - score_other)
    return diff if diff > 0 else 0.0
