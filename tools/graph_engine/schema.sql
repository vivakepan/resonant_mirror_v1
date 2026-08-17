-- ─── Graph Engine schema (§6.1) ────────────────────────────────────
-- A morphism graph for Resonant Singer, aligned with Presence Engine v2.2.
--
-- Nodes are typed (zone, band, song, session, event, opening).
-- Morphisms are typed and carry epistemic warrant + resonance depth.
--
-- Storage = local SQLite (~/.resonant-singer/graph.db or in-repo for dev).
-- No PII; songs are hashed; sessions are opaque fingerprints.
--
-- Per AIN-RS-014 and the anti-recommendation discipline in §6.4:
--   - Nothing in this schema captures user identity or predictions.
--   - Every morphism is past-tense (it observed X) — never future-tense.
--   - "openness" is first-class via the `opening` node type and the
--     `is_open` flag on morphism records.
-- ───────────────────────────────────────────────────────────────────

PRAGMA foreign_keys = ON;

-- ─── Nodes ─────────────────────────────────────────────────────
-- Five concrete node types + one structural type for openings.
--   zone     — one of the 10 anatomical zones (or a sub-mode of a multi-modal zone)
--   band     — log-spaced frequency bin in [70, 3000) Hz
--   song     — uploaded audio (hashed, no raw audio retained)
--   session  — opaque session fingerprint (random UUID per browser session)
--   event    — discrete "constellation snapshot" — which zones fired, in what amplitudes
--   opening  — explicit unexplored marker ("no session has tested X")

CREATE TABLE IF NOT EXISTS node (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL CHECK (type IN ('zone','band','song','session','event','opening')),
  key          TEXT NOT NULL,        -- type-scoped identifier (e.g. zone="larynx", band="b_18", song="<sha256>")
  data_json    TEXT,                  -- type-specific blob (zone modes, band Hz range, event amplitudes, …)
  created_at   REAL NOT NULL,         -- epoch seconds, first observation
  UNIQUE (type, key)
);
CREATE INDEX IF NOT EXISTS idx_node_type ON node(type);


-- ─── Morphisms ─────────────────────────────────────────────────
-- Typed relations between nodes. Each morphism carries:
--   - resonance_depth: how many independent observations confirm it
--   - warrant: how strong the evidence is (mathematical → speculative)
--   - is_open: explicit "we have not yet closed this" flag (PE deferred closure)
--   - first_seen / last_seen: temporal weight vector (when first observed; recency)
--
-- Morphism types map to PE v2.2 §3 categories:
--   causal       — frequency band → zone activation
--   structural   — zone–zone co-firing pattern within an event
--   temporal     — preset_A → preset_B (exploration paths)
--   analogical   — song_X "sounds-like" song_Y (NOT used until §6.3 passes)
--   constitutive — zone-pair → anti-resonance node (geometric mean)
--   negatory     — explicit "song_X does NOT resonate at band_Y"
--                  (the deferred-closure discipline — refutations are first-class)
--   homological  — "activation pattern of X is structurally like Y" — the prize.
--                  Only persisted AFTER neti-neti rejection survival (§6.3).

CREATE TABLE IF NOT EXISTS morphism (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  src             INTEGER NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  dst             INTEGER NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN
                    ('causal','structural','temporal','analogical',
                     'constitutive','negatory','homological')),
  resonance_depth INTEGER NOT NULL DEFAULT 1,
  warrant         TEXT NOT NULL CHECK (warrant IN
                    ('mathematical','empirical-strong','empirical-weak',
                     'analogical','speculative')),
  is_open         INTEGER NOT NULL DEFAULT 1,   -- 1 = open (PE default), 0 = closed
  first_seen      REAL NOT NULL,
  last_seen       REAL NOT NULL,
  evidence_json   TEXT,                          -- pointer to backing event ids, scorer params, etc.
  UNIQUE (src, dst, type)
);
CREATE INDEX IF NOT EXISTS idx_morphism_src   ON morphism(src);
CREATE INDEX IF NOT EXISTS idx_morphism_dst   ON morphism(dst);
CREATE INDEX IF NOT EXISTS idx_morphism_type  ON morphism(type);


-- ─── Homology candidates ───────────────────────────────────────
-- Candidates produced by the L1 async homology engine. They are NOT
-- promoted to the morphism table until neti-neti rejection survival.
-- This table is the buffer between detection (§6.2) and confirmation (§6.3).

CREATE TABLE IF NOT EXISTS homology_candidate (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  src               INTEGER NOT NULL REFERENCES node(id),
  dst               INTEGER NOT NULL REFERENCES node(id),
  similarity        REAL NOT NULL,                -- Jaccard-or-better score in [0, 1]
  neighborhood_d    INTEGER NOT NULL DEFAULT 2,   -- typed-path depth examined
  status            TEXT NOT NULL CHECK (status IN
                      ('pending','passed_neti_neti','rejected_neti_neti','promoted')),
  rejection_reason  TEXT,                          -- e.g. "explained by shared zone X"
  detected_at       REAL NOT NULL,
  tested_at         REAL,
  UNIQUE (src, dst, neighborhood_d)
);


-- ─── Articulation surface (§6.4) ───────────────────────────────
-- Generated read-only by articulate.py, consumed by the browser.
-- Strictly past-tense, strictly passive — never recommendations.
-- Each row pairs a *recognition* with at least one *opening* it implies.

CREATE TABLE IF NOT EXISTS articulation (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  recognition     TEXT NOT NULL,           -- e.g. "chest+heart co-fired in 14 sessions"
  opening         TEXT NOT NULL,           -- e.g. "no session tested band 380-420 Hz with this song"
  warrant         TEXT NOT NULL,
  morphism_id     INTEGER REFERENCES morphism(id),
  generated_at    REAL NOT NULL
);
