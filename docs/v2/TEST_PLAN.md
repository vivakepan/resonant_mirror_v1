# Resonant Mirror v2 — Test plan

Tests are gated by implementation phase. A later phase MUST NOT be treated as done if its tests are skipped.

Runner:

```bash
./tools/verify_all.sh          # legacy + v2
node --test tests/v2/*.test.js
python3 tests/v2/test_ml_pipeline.py
```

## Phase 0 — Contracts

- Every evidence class is one of the canonical set.
- Session, vocal-frame, phrase, prototype, and visual-state records validate.
- Every planned dynamic visual has an upstream evidence path.
- Stale or missing evidence becomes `unknown`.
- Feature flags exist for every research output.
- Open assumptions are registered and cannot be silently dropped.
- Legacy verification still passes.

## Phase 1 — Dual input

- User and reference frames carry distinct `source` tags.
- Mixing buffers before analysis is rejected.
- Shared timestamps compare within one configured tick.
- Leakage warning is a quality flag, not a claimed detector.
- Latency metadata is present.
- Capture settings are stored on the session.

## Phase 2 — Deterministic acoustics

- A known sine tone yields the expected frequency within tolerance.
- Cents error matches `1200 * log2(measured / target)`.
- Uncalibrated level is labeled dBFS, never sound-pressure level.
- Spectral centroid / rolloff / tilt / periodicity are finite on voiced frames.
- No learned model is required.

## Phase 3 — Resonance and anatomy

- Formant estimates carry confidence and may be `unknown`.
- High-F0 frames are allowed to return unknown formants.
- LPC failure may fall back to smoothed spectral peaks as `inferred`.
- Anatomy motion is tagged `simulated` without a body sensor.
- Mouth aperture follows F1 or scream acoustics; it is not a single phonated preset. Open vowels and screams use a much larger visual jaw/lip range than rest or /i/.
- Zooming the figure keeps the skull above the shoulders; the torso hangs from the jaw.
- The sagittal head overlay is fitted to the vault and seated on the cervical spine.
- Anatomy hues stay distinct: silver outline, mint airflow, magenta tract walls, amber chest / lemon throat / cyan head resonance, visible teal lungs. Oral airflow follows the anterior tract. Breath is intense at the aperture and diffuses into the room.
- Only the winning register lights the figure; leftover class probability does not light the other two. Head-voice glow sits on the brainstem. Throat resonance sits at the top of the neck.
- Head/mixed vibrate the skull rim; chest/mixed vibrate ribs, spine, and laryngeal cartilage. Skull-rim and ribcage vibration uses the mint breath color. The airway is outlined from the xiphoid to the top of the spine; the voice box is a contrasting indigo. Humming is an inferred closed-lip candidate, not lip tracking.
- Simulated voice/air intensity falls with distance instead of cutting off at a hard radius. Open /a/ widens mouth and throat.
- Skull-rim mapping is `inferred` or `simulated`, never cavity proof.

## Phase 4 — Respiration

- Classifier outputs include `unknown`.
- Temporal smoothing suppresses single-frame flicker.
- Event records include confidence, evidence class, source, timestamps, model version.
- Airflow / diaphragm visuals are `simulated`.
- Assertive breath visuals remain gated until held-out validation exists.

## Phase 5 — Registration

- Chest / mixed / head outputs allow `unknown`.
- Labels are probabilistic.
- No “correct register” claim exists in the estimator.

## Phase 6 — Tension

- Wording is “tension evidence”, not diagnosis.
- Orange-red mapping is graded and has a non-color cue.
- Provenance inspector can answer why a visual is active.
- Stale tension evidence fades to unknown.

## Phase 7 — Encoder dataset

- Neighboring windows from one session cannot land in different splits.
- Embeddings record model version.
- Training loop exposes forward, loss, backward, optimizer step, checkpoint.

## Phase 8 — Intensity ranking

- Pairwise objective is defined.
- Loudness-only baseline exists.
- Shortcut tests for loudness, pitch height, and distortion are present.
- Output stays gated until it differs from the loudness baseline.

## Phase 9 — Personal memory

- A prototype can update without changing model weights.
- Rename and delete work.
- Embedding-version mismatch is refused.

## Phase 10 — Support-related coordination

- Output name is support-related evidence.
- Comparisons cite prior labeled examples.
- No diaphragm-certainty string is emitted.

## Phase 11 — Phrase model

- Phrase comparisons use whole-session holdout helpers.
- Two trajectories with similar peaks can differ in path descriptors.

## Phase 12 — Personal training

- Live sessions cannot update weights.
- Training is opt-in, between sessions, and evaluation-gated.
- Rollback and versioning exist.
