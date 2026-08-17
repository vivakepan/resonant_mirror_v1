"""
Canonical zone id order — must match src/physics.js ZONE_IDS (zones[].id) exactly.
Used for amps[] indexing in session export and graph ingest.

If you add/reorder zones in physics.js, update this list and re-run:
  python3 tools/graph_engine/verify_ingest_schema.py
"""

ZONE_NAMES = [
    'chest',
    'heart',
    'tracheal',
    'larynx',
    'pharynx',
    'mouth',
    'nasal',
    'skull',
    'eyes',
    'ears',
]
