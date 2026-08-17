"""
train.py — Train a model to predict non-obvious discovery from a session.

This is a LEARNING-PROJECT scaffold. The point is not the accuracy number;
it's the end-to-end loop on data whose generative process you fully control.
Because we generated the labels from known physics, we can check whether the
model learns the structure we put in.

Two backends:
  - TensorFlow/Keras (1D-CNN over the frequency trajectory) if installed
  - A dependency-free numpy logistic-regression fallback on summary features

Usage:
    python train.py --data sessions_balanced.jsonl
    python train.py --data sessions_balanced.jsonl --backend numpy

WHAT THE MODEL SEES:
    Input  = the session's frequency trajectory (the sequence of visited
             frequencies), normalized to [0,1] over the 70-900 Hz band,
             padded/truncated to a fixed length.
    Output = P(session found a non-obvious state).

WHY THIS IS A HONEST LEARNING SETUP:
    The label is a deterministic function of the trajectory (via the physics).
    So a good model is *recovering the physics* from raw trajectories — it has
    to implicitly learn where the interesting frequencies are. If it can't beat
    the summary-feature baseline, that tells you the sequence signal is weak;
    if it can, it has learned spectral structure from scratch.
"""

from __future__ import annotations
import argparse
import json
import math
import random

FREQ_MIN, FREQ_MAX = 70, 900
MAX_LEN = 48  # pad/truncate trajectories to this length


def load(path):
    rows = []
    with open(path) as fh:
        for line in fh:
            rows.append(json.loads(line))
    return rows


def to_sequence(traj):
    """Normalize + pad/truncate a frequency trajectory to MAX_LEN."""
    norm = [(min(FREQ_MAX, max(FREQ_MIN, f)) - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)
            for f in traj]
    if len(norm) >= MAX_LEN:
        return norm[:MAX_LEN]
    return norm + [0.0] * (MAX_LEN - len(norm))


def to_summary(row):
    """Hand-crafted summary features for the baseline model."""
    return [
        row["max_sysamp"],
        row["max_active"] / 10.0,
        row["max_ar_strength"],
        row["n_coupling_states"] / max(1, row["n_steps"]),
        row["n_antires_states"] / max(1, row["n_steps"]),
        row["n_steps"] / 48.0,
    ]


def split(rows, frac=0.8, seed=0):
    rng = random.Random(seed)
    rng.shuffle(rows)
    k = int(len(rows) * frac)
    return rows[:k], rows[k:]


# ─── numpy logistic-regression baseline (no deps) ──────────────

def train_numpy(train_rows, test_rows):
    import statistics
    # Features: summary vector. Target: label.
    Xtr = [to_summary(r) for r in train_rows]
    ytr = [r["label_nonobvious"] for r in train_rows]
    Xte = [to_summary(r) for r in test_rows]
    yte = [r["label_nonobvious"] for r in test_rows]

    d = len(Xtr[0])
    w = [0.0] * d
    b = 0.0
    lr = 0.5
    epochs = 300

    def sigmoid(z):
        if z < -60: return 0.0
        if z > 60:  return 1.0
        return 1.0 / (1.0 + math.exp(-z))

    n = len(Xtr)
    for _ in range(epochs):
        gw = [0.0] * d
        gb = 0.0
        for x, y in zip(Xtr, ytr):
            p = sigmoid(sum(wi * xi for wi, xi in zip(w, x)) + b)
            err = p - y
            for j in range(d):
                gw[j] += err * x[j]
            gb += err
        for j in range(d):
            w[j] -= lr * gw[j] / n
        b -= lr * gb / n

    def predict(x):
        return sigmoid(sum(wi * xi for wi, xi in zip(w, x)) + b)

    correct = sum(1 for x, y in zip(Xte, yte) if (predict(x) >= 0.5) == y)
    acc = correct / len(yte)

    # Baseline: predict majority class
    maj = max(set(ytr), key=ytr.count)
    base = sum(1 for y in yte if y == maj) / len(yte)

    print(f"[numpy logistic regression on summary features]")
    print(f"  test accuracy:     {acc:.3f}")
    print(f"  majority baseline: {base:.3f}")
    print(f"  feature weights:   {[round(wi,2) for wi in w]}")
    print(f"  (features: max_sysamp, max_active, max_ar, coupling_frac, antires_frac, len)")
    return acc


# ─── TensorFlow 1D-CNN over the trajectory ─────────────────────

def train_tf(train_rows, test_rows):
    import numpy as np
    import tensorflow as tf

    Xtr = np.array([to_sequence(r["trajectory"]) for r in train_rows], dtype="float32")[..., None]
    ytr = np.array([r["label_nonobvious"] for r in train_rows], dtype="float32")
    Xte = np.array([to_sequence(r["trajectory"]) for r in test_rows], dtype="float32")[..., None]
    yte = np.array([r["label_nonobvious"] for r in test_rows], dtype="float32")

    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(MAX_LEN, 1)),
        tf.keras.layers.Conv1D(16, 5, activation="relu", padding="same"),
        tf.keras.layers.Conv1D(32, 5, activation="relu", padding="same"),
        tf.keras.layers.GlobalMaxPooling1D(),
        tf.keras.layers.Dense(16, activation="relu"),
        tf.keras.layers.Dense(1, activation="sigmoid"),
    ])
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
    model.fit(Xtr, ytr, validation_split=0.15, epochs=15, batch_size=32, verbose=2)

    loss, acc = model.evaluate(Xte, yte, verbose=0)
    maj = 1 if ytr.mean() >= 0.5 else 0
    base = (yte == maj).mean()
    print(f"\n[TensorFlow 1D-CNN on raw trajectory]")
    print(f"  test accuracy:     {acc:.3f}")
    print(f"  majority baseline: {base:.3f}")
    print(f"  The CNN sees only raw visited frequencies — if it beats the")
    print(f"  baseline it has learned WHERE the interesting frequencies are,")
    print(f"  recovering the physics from trajectories alone.")
    return acc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="sessions_balanced.jsonl")
    ap.add_argument("--backend", choices=["auto", "tf", "numpy"], default="auto")
    args = ap.parse_args()

    rows = load(args.data)
    train_rows, test_rows = split(rows)
    print(f"Loaded {len(rows)} sessions ({len(train_rows)} train / {len(test_rows)} test)")
    print(f"Positive rate: {sum(r['label_nonobvious'] for r in rows)/len(rows):.1%}\n")

    backend = args.backend
    if backend == "auto":
        try:
            import tensorflow  # noqa
            backend = "tf"
        except ImportError:
            backend = "numpy"
            print("(TensorFlow not installed — using numpy baseline. "
                  "pip install tensorflow to train the CNN.)\n")

    if backend == "tf":
        train_tf(train_rows, test_rows)
    else:
        train_numpy(train_rows, test_rows)


if __name__ == "__main__":
    main()
