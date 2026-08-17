#!/usr/bin/env bash
# Pre-release verification — run from repo root: ./tools/verify_all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== JS syntax =="
while IFS= read -r f; do node --check "$f"; done < <(find src -name '*.js' | sort)

echo "== Release Principle falsification harness =="
node tools/physics_verify.js

echo "== Zone list parity (physics.js ↔ zones.py) =="
python3 -c "
import re, sys
from pathlib import Path
sys.path.insert(0, 'tools/graph_engine')
from zones import ZONE_NAMES as py
phys = Path('src/physics.js').read_text()
m = re.findall(r\"id: '([^']+)'\", phys.split('export const zones')[1].split('];')[0])
assert m[:10] == py, (m, py)
print('OK', py)
"

echo "== DOM id audit =="
python3 -c "
import re
from pathlib import Path
html = Path('index.html').read_text()
ids_html = set(re.findall(r'id=\"([^\"]+)\"', html))
missing = []
for p in Path('src').glob('*.js'):
    for m in re.finditer(r\"getElementById\\('([^']+)'\\)\", p.read_text()):
        if m.group(1) not in ids_html:
            missing.append((p.name, m.group(1)))
if missing:
    raise SystemExit('Missing DOM ids: ' + str(missing))
print('OK — all getElementById targets present in index.html')
"

echo "== Graph ingest schema =="
python3 tools/graph_engine/verify_ingest_schema.py

echo "== Graph pipeline smoke =="
TMP=$(mktemp -d)
python3 -c "
import json, subprocess, sys
from pathlib import Path
td = Path('$TMP')
sess = {'session_id': 'smoke', 'events': [{
  't': 0.5, 'internal_f': 220.0, 'external_fs': [440.0],
  'amps': [0.85, 0.2, 0.5, 0.9, 0.4, 0.1, 0.1, 0.15, 0.1, 0.1],
  'sysAmp': 0.55, 'arActive': None}]}
jl = td / 's.jsonl'
jl.write_text(json.dumps(sess) + chr(10))
db = td / 'g.db'
subprocess.check_call([sys.executable, 'ingest.py', '--db', str(db), str(jl)], cwd='tools/graph_engine')
subprocess.check_call([sys.executable, 'homology.py', '--db', str(db)], cwd='tools/graph_engine')
subprocess.check_call([sys.executable, 'neti_neti.py', '--db', str(db)], cwd='tools/graph_engine')
subprocess.check_call([sys.executable, 'articulate.py', '--db', str(db), '--out', str(td / 'articulation.json')], cwd='tools/graph_engine')
print('OK pipeline')
"

echo "== Journal-noticer =="
python3 tools/journal_noticer/noticer.py --sessions "$TMP/s.jsonl" --out "$TMP/journal" >/dev/null
test -f "$TMP/journal/"*.md

echo "== Synthetic ML (numpy) =="
(cd tools/synthetic_sessions && python3 train.py --data sessions.jsonl >/dev/null)

echo "== §9 Field interference beat tests =="
python3 tools/verify_field_beats.py

echo "== esbuild bundle =="
npx --yes esbuild src/main.js --bundle --format=iife --target=es2020 --outfile="$TMP/_bundle.js" >/dev/null
test -s "$TMP/_bundle.js"

echo "== Resonant Mirror v2 tests =="
node --test tests/v2/*.test.js
if [ -f tests/v2/test_ml_pipeline.py ]; then
  python3 tests/v2/test_ml_pipeline.py
fi

rm -rf "$TMP"
echo ""
echo "All checks passed."
