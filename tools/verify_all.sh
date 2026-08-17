#!/usr/bin/env bash
# Pre-release verification — run from repo root: ./tools/verify_all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== JS syntax =="
while IFS= read -r f; do node --check "$f"; done < <(find src -name '*.js' | sort)

echo "== DOM id audit =="
python3 -c "
import re
from pathlib import Path
html = Path('index.html').read_text()
ids_html = set(re.findall(r'id=\"([^\"]+)\"', html))
missing = []
for p in Path('src/v2').rglob('*.js'):
    for m in re.finditer(r\"getElementById\\('([^']+)'\\)\", p.read_text()):
        if m.group(1) not in ids_html:
            missing.append((p.name, m.group(1)))
if missing:
    raise SystemExit('Missing DOM ids: ' + str(missing))
print('OK — all getElementById targets present in index.html')
"

echo "== Resonant Mirror v2 tests =="
node --test tests/v2/*.test.js
python3 tests/v2/test_ml_pipeline.py

echo ""
echo "All checks passed."
