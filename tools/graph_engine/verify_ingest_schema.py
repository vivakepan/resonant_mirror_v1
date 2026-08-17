#!/usr/bin/env python3
"""
Smoke test: browser-shaped session JSONL must produce morphisms in graph.db.
Run from repo root: python3 tools/graph_engine/verify_ingest_schema.py
"""

import json
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE = Path(__file__).resolve().parent

# One event with chest + larynx hot — should create band, causal, structural edges.
SAMPLE = {
    "session_id": "verify-schema-001",
    "song_hash": None,
    "events": [
        {
            "t": 0.5,
            "internal_f": 220.0,
            "external_fs": [440.0],
            "amps": [0.85, 0.2, 0.5, 0.9, 0.4, 0.1, 0.1, 0.15, 0.1, 0.1],
            "sysAmp": 0.55,
            "arActive": None,
        }
    ],
}


def main():
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        jsonl = td_path / "sessions.jsonl"
        db = td_path / "graph.db"
        jsonl.write_text(json.dumps(SAMPLE) + "\n", encoding="utf-8")

        subprocess.check_call(
            [sys.executable, str(ENGINE / "ingest.py"), "--db", str(db), str(jsonl)],
            cwd=str(ENGINE),
        )

        con = sqlite3.connect(db)
        n_morph = con.execute("SELECT COUNT(*) FROM morphism").fetchone()[0]
        n_event = con.execute("SELECT COUNT(*) FROM node WHERE type='event'").fetchone()[0]
        con.close()

        if n_morph < 1 or n_event < 1:
            print(f"FAIL: expected morphisms and event nodes, got morph={n_morph} event={n_event}")
            sys.exit(1)
        print(f"OK: ingest produced {n_event} event node(s), {n_morph} morphism(s)")


if __name__ == "__main__":
    main()
