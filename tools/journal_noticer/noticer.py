#!/usr/bin/env python3
"""
noticer.py — Fixed-pipeline weekly journal from session JSONL (§ journal-noticer design).

No learned weights. Reads append-only session exports, computes simple pattern
statistics, and writes a past-tense markdown entry (including explicit null weeks).
"""

from __future__ import annotations
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def iter_samples(session: dict):
    """Yield frame dicts from events[] (preferred) or legacy frames[]."""
    for ev in session.get("events") or []:
        yield {
            "f": ev.get("internal_f", ev.get("f", 0)),
            "sysAmp": ev.get("sysAmp", 0),
            "activeCount": ev.get("activeCount", 0),
            "arActive": ev.get("arActive"),
        }
    if session.get("events"):
        return
    for fr in session.get("frames") or []:
        yield {
            "f": fr.get("f", 0),
            "sysAmp": fr.get("sysAmp", 0),
            "activeCount": fr.get("activeCount", 0),
            "arActive": fr.get("arActive"),
        }


def load_sessions(paths: list[Path]) -> list[dict]:
    rows = []
    for p in paths:
        with p.open() as fh:
            for line in fh:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    return rows


def analyze(sessions: list[dict]) -> dict:
    if not sessions:
        return {"n": 0, "null": True, "reason": "no sessions ingested"}
    strong = 0
    ar_hits = 0
    freqs: list[float] = []
    for s in sessions:
        for fr in iter_samples(s):
            freqs.append(fr.get("f", 0))
            if fr.get("sysAmp", 0) >= 0.45 and fr.get("activeCount", 0) >= 5:
                strong += 1
            if fr.get("arActive"):
                ar_hits += 1
    band = Counter(int(f // 50) * 50 for f in freqs if f > 0)
    top_band, top_count = (band.most_common(1) or [(None, 0)])[0]
    return {
        "n": len(sessions),
        "null": strong < 2 and ar_hits < 2,
        "strong_coupling_frames": strong,
        "ar_frames": ar_hits,
        "top_band_hz": top_band,
        "top_band_count": top_count,
    }


def render(stats: dict) -> str:
    week = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [f"# Resonant Singer journal · week of {week}", ""]
    if stats.get("null"):
        lines += [
            "**Nothing statistically notable this week.**",
            "",
            f"Sessions analyzed: {stats['n']}. "
            "Thresholds for coupling and anti-resonance activity were not met.",
            "",
            "_This null entry is first-class output, not an error._",
        ]
    else:
        lines += [
            f"**Pattern note** (warrant: empirical-weak, n={stats['n']} sessions).",
            "",
            f"- Strong coupling frames: {stats['strong_coupling_frames']}",
            f"- Anti-resonance frames: {stats['ar_frames']}",
        ]
        if stats.get("top_band_hz") is not None:
            lines.append(
                f"- Most visited band center: ~{stats['top_band_hz']} Hz "
                f"({stats['top_band_count']} samples)"
            )
        lines += [
            "",
            "**Opening:** No session in this batch tested whether the same band "
            "behaves differently under song-driven vs slider-only drives.",
        ]
    lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Weekly journal-noticer (fixed pipeline)")
    ap.add_argument("--sessions", nargs="+", required=True, help="Session JSONL file(s)")
    ap.add_argument("--out", default="journal", help="Output directory")
    args = ap.parse_args()
    paths = [Path(p) for p in args.sessions]
    stats = analyze(load_sessions(paths))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    name = f"entry-{datetime.now(timezone.utc).strftime('%Y%m%d')}.md"
    path = out_dir / name
    path.write_text(render(stats), encoding="utf-8")
    print(f"Wrote {path} (null={stats.get('null')})")


if __name__ == "__main__":
    main()
