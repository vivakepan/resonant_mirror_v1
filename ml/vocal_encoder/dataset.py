"""
Session-aware dataset construction (REQ-079).

Neighboring windows from one recording MUST NOT be randomly split across
train/validation/test. Entire sessions are assigned as units.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


@dataclass(frozen=True)
class AudioWindow:
    session_id: str
    singer_id: str | None
    start_seconds: float
    end_seconds: float
    samples: list[float] = field(repr=False)
    sample_rate: int = 16000
    labels: dict = field(default_factory=dict)


def split_sessions(session_ids: list[str], train_ratio: float = 0.8) -> dict[str, list[str]]:
    """
    Illustrative default: first 80% of session ids by order → train,
    next 10% → validation, last 10% → test.

    The grouping rule is mandatory; the exact counts are configurable.
    """
    ids = list(session_ids)
    n = len(ids)
    if n < 3:
        raise ValueError("Need at least three sessions for train/validation/test holdout.")
    n_train = max(1, int(round(n * train_ratio)))
    n_val = max(1, int(round(n * 0.1)))
    if n_train + n_val >= n:
        n_train = n - 2
        n_val = 1
    train = ids[:n_train]
    val = ids[n_train:n_train + n_val]
    test = ids[n_train + n_val:]
    return {"train": train, "validation": val, "test": test}


def windows_for_split(windows: Iterable[AudioWindow], session_ids: Iterable[str]) -> list[AudioWindow]:
    allowed = set(session_ids)
    return [w for w in windows if w.session_id in allowed]


def assert_no_session_leakage(train: Iterable[AudioWindow], val: Iterable[AudioWindow], test: Iterable[AudioWindow]) -> None:
    t = {w.session_id for w in train}
    v = {w.session_id for w in val}
    s = {w.session_id for w in test}
    overlap = (t & v) | (t & s) | (v & s)
    if overlap:
        raise AssertionError(f"Session leakage across splits: {sorted(overlap)}")


def speaker_held_out(windows: Iterable[AudioWindow], held_out_singers: Iterable[str]) -> tuple[list[AudioWindow], list[AudioWindow]]:
    held = set(held_out_singers)
    train = [w for w in windows if w.singer_id not in held]
    test = [w for w in windows if w.singer_id in held]
    return train, test
