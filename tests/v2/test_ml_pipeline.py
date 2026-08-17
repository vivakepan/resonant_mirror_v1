"""Phase 7–8 dataset, holdout, and ranking tests. Torch is optional."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ml.vocal_encoder.dataset import (  # noqa: E402
    AudioWindow,
    assert_no_session_leakage,
    speaker_held_out,
    split_sessions,
    windows_for_split,
)
from ml.vocal_encoder.mel import log_mel_spectrogram  # noqa: E402
from ml.vocal_encoder.intensity import (  # noqa: E402
    PairwiseAnnotation,
    aggregate_votes,
    loudness_baseline_prefer,
    may_expose_intensity,
    pairwise_margin_loss,
    ranking_accuracy,
    shortcut_score,
)


def windows_for_sessions(n_sessions: int = 10, windows_each: int = 5) -> list[AudioWindow]:
    out = []
    for s in range(1, n_sessions + 1):
        sid = f"session-{s}"
        for w in range(windows_each):
            out.append(AudioWindow(
                session_id=sid,
                singer_id="singer-a" if s < 9 else "singer-b",
                start_seconds=w * 0.5,
                end_seconds=w * 0.5 + 0.5,
                samples=[0.0] * 800,
            ))
    return out


class DatasetTests(unittest.TestCase):
    def test_entire_session_holdout(self):
        windows = windows_for_sessions(10)
        ids = list(dict.fromkeys(w.session_id for w in windows))
        splits = split_sessions(ids)
        train = windows_for_split(windows, splits["train"])
        val = windows_for_split(windows, splits["validation"])
        test = windows_for_split(windows, splits["test"])
        assert_no_session_leakage(train, val, test)
        self.assertTrue(splits["train"])
        self.assertTrue(splits["validation"])
        self.assertTrue(splits["test"])
        # Neighboring windows of session-1 cannot appear in two splits.
        s1_splits = set()
        for name, group in [("train", train), ("val", val), ("test", test)]:
            if any(w.session_id == "session-1" for w in group):
                s1_splits.add(name)
        self.assertEqual(len(s1_splits), 1)

    def test_speaker_held_out(self):
        windows = windows_for_sessions(10)
        train, test = speaker_held_out(windows, ["singer-b"])
        self.assertTrue(all(w.singer_id != "singer-b" for w in train))
        self.assertTrue(all(w.singer_id == "singer-b" for w in test))

    def test_log_mel_shape(self):
        import math
        tone = [math.sin(2 * math.pi * 220 * i / 16000) for i in range(2048)]
        mel = log_mel_spectrogram(tone, 16000, n_fft=256, hop=128, n_mels=64)
        self.assertEqual(len(mel), 64)
        self.assertGreater(len(mel[0]), 4)


class IntensityTests(unittest.TestCase):
    def test_preserves_disagreement(self):
        pref, rate = aggregate_votes(["a", "b", "a"])
        self.assertEqual(pref, "a")
        self.assertGreater(rate, 0)

    def test_loudness_baseline_and_gate(self):
        pairs = [
            PairwiseAnnotation("p", "1", "2", "b", ["b"], 0, 0.9, 0.2, 200, 400, 0.1, 0.8),
            PairwiseAnnotation("p", "3", "4", "a", ["a"], 0, 0.3, 0.2, 180, 190, 0.0, 0.0),
        ]
        loud_acc = ranking_accuracy(pairs, loudness_baseline_prefer)
        # Human preferred quieter clip in first pair, so loudness baseline is imperfect.
        self.assertLess(loud_acc, 1.0)
        self.assertFalse(may_expose_intensity(loud_acc, loud_acc))
        self.assertTrue(may_expose_intensity(0.8, 0.5))
        self.assertGreater(pairwise_margin_loss(0.1, 0.9), 0)
        self.assertEqual(pairwise_margin_loss(2.0, 0.1), 0.0)
        # Shortcut diagnostic exists for loudness / pitch / distortion.
        self.assertGreaterEqual(shortcut_score(pairs, loudness_baseline_prefer, "loudness"), 0)


class OptionalTorchTests(unittest.TestCase):
    def test_encoder_forward_and_checkpoint_metadata(self):
        try:
            import torch
            from ml.vocal_encoder.model import (
                MODEL_VERSION,
                build_model,
                count_parameters,
                infer_embedding,
                train_one_epoch,
            )
        except ImportError:
            self.skipTest("PyTorch not installed")
        model = build_model()
        self.assertLess(count_parameters(model), 500_000)
        x = torch.randn(2, 1, 64, 32)
        z = model(x)
        self.assertEqual(tuple(z.shape), (2, 64))
        opt = torch.optim.Adam(model.parameters(), lr=1e-3)
        loss = train_one_epoch(model, opt, [{"mel": x}])
        self.assertTrue(loss >= 0)
        out = infer_embedding(model, x[0, 0].numpy())
        self.assertEqual(out["model_version"], MODEL_VERSION)
        self.assertEqual(len(out["embedding"]), 64)


if __name__ == "__main__":
    unittest.main()
