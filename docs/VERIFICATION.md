# Verification

Runnable checks aligned with [README.md](../README.md). Each claim should be falsifiable in practice.

**Parent:** [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Browser (manual)

| Check | Steps | Pass criterion |
|-------|-------|----------------|
| Zone envelopes | Hold **A3 · 220** several seconds | Sidebar bars rise smoothly to plateau; decay when leaving preset |
| Spectral null | **◊ DEAD · 355** | Affected zone bars drop below idle; violet node between pharynx and mouth |
| Field beats | Load sine WAV ~chest Hz; internal slider at first harmonic | Visible beat / pulsing in field layer (FIELD on) |
| Breath | **BREATH** on, synth mode | Vagus speed and aura vary at breath period (~5 s default) |
| Mic | **LISTEN · MIC**, hum steadily | Internal frequency readout tracks pitch; no upload required |
| View modes | Cycle Organs → Flow → … | Caption changes; relative zone weights shift |
| Export | **EXPORT SESSION** | Downloads `sessions.jsonl` with one JSON object |

Dev hook: `window.__rs` → `{ state, audio, zones }`.

---

## Synthetic ML

```bash
cd tools/synthetic_sessions
python3 generate.py -n 4000 --balance -o sessions_balanced.jsonl
python3 train.py --data sessions_balanced.jsonl
```

After editing `src/physics.js`, update `physics.py` and re-run. **Pass:** test accuracy within ±2 percentage points of pre-change baseline on the same seed/data.

---

## Graph engine

```bash
# Schema smoke test (synthetic one-line session → must create morphisms)
python3 tools/graph_engine/verify_ingest_schema.py

cd tools/graph_engine
python3 ingest.py path/to/sessions.jsonl
python3 homology.py
python3 neti_neti.py
python3 articulate.py
```

**Pass (ingest):** `verify_ingest_schema.py` exits 0; SQLite shows ≥1 `event` node and ≥1 `morphism`.  
**Pass (export):** browser **EXPORT SESSION** line contains `events[]` with `internal_f`, `amps` (length 10), and `meta.zone_ids` matching [`zones.py`](../tools/graph_engine/zones.py).

**Neti-neti controlled construction** (from refinement plan §9): two patterns sharing only high chest amplitude — pre-permutation similarity high, post-permutation collapses, candidate **rejected**.

See [tools/graph_engine/README.md](../tools/graph_engine/README.md).

---

## Journal-noticer

```bash
cd tools/journal_noticer
python3 noticer.py --sessions path/to/sessions.jsonl --out journal/
```

**Pass:** produces dated markdown; empty or low-signal weeks emit an explicit **null** entry.

---

## Automated (pre-release)

Run from repo root: `./tools/verify_all.sh`

Checks run in order:
1. JS syntax — `node --check` on all `src/*.js`
2. Zone list parity — `physics.js` zone IDs match `tools/graph_engine/zones.py`
3. DOM id audit — all `getElementById` calls have matching `id=` in `index.html`
4. Graph ingest schema — `verify_ingest_schema.py` smoke test
5. Graph pipeline smoke — ingest → homology → neti_neti → articulate on a synthetic session
6. Journal-noticer — produces dated markdown output
7. Synthetic ML (numpy) — `train.py` runs without error
8. **§9 Field interference beat tests** — `tools/verify_field_beats.py`: Python port of `field.js computeField()`, 6 tests confirming genuine interference geometry (node/antinode structure, bipolarity, superposition, frequency scaling)
9. esbuild bundle — single-file build completes and is non-empty

---

## Portable bundle

```bash
npm run verify      # pre-release checks (JS, schema, graph, esbuild)
npm run build:dist  # writes dist/vocal_resonance.html
```

After `src/` changes, rebuild before claiming `file://` parity. Modular app over HTTP (`npm run serve`) remains the dev source of truth.
