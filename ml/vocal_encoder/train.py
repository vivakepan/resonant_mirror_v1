"""
Explicit training entry point for the first vocal encoder.

Usage:
  python3 -m ml.vocal_encoder.train --data path/to/windows.jsonl --out checkpoints/vocal-encoder-0.pt
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .dataset import AudioWindow, assert_no_session_leakage, split_sessions, windows_for_split
from .mel import log_mel_spectrogram
from .model import MODEL_VERSION, build_model, save_checkpoint, train_one_epoch


def load_windows(path: Path) -> list[AudioWindow]:
    windows = []
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        windows.append(AudioWindow(
            session_id=rec["session_id"],
            singer_id=rec.get("singer_id"),
            start_seconds=rec["start_seconds"],
            end_seconds=rec["end_seconds"],
            samples=rec["samples"],
            sample_rate=rec.get("sample_rate", 16000),
            labels=rec.get("labels", {}),
        ))
    return windows


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Train a small vocal encoder between sessions only.")
    parser.add_argument("--data", required=True)
    parser.add_argument("--out", default="ml/checkpoints/vocal-encoder-0.pt")
    parser.add_argument("--epochs", type=int, default=3)
    args = parser.parse_args(argv)

    windows = load_windows(Path(args.data))
    session_ids = list(dict.fromkeys(w.session_id for w in windows))
    splits = split_sessions(session_ids)
    train_w = windows_for_split(windows, splits["train"])
    val_w = windows_for_split(windows, splits["validation"])
    test_w = windows_for_split(windows, splits["test"])
    assert_no_session_leakage(train_w, val_w, test_w)

    import torch
    from torch.utils.data import DataLoader, Dataset

    class MelDataset(Dataset):
        def __init__(self, items: list[AudioWindow]):
            self.items = items

        def __len__(self):
            return len(self.items)

        def __getitem__(self, idx):
            w = self.items[idx]
            mel = log_mel_spectrogram(w.samples, w.sample_rate)
            import torch
            x = torch.tensor(mel, dtype=torch.float32).unsqueeze(0)
            return {"mel": x, "session_id": w.session_id}

    model = build_model()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    loader = DataLoader(MelDataset(train_w), batch_size=8, shuffle=True)
    for epoch in range(args.epochs):
        loss = train_one_epoch(model, optimizer, loader)
        print(f"epoch {epoch + 1} train_loss={loss:.4f}")

    save_checkpoint(model, args.out, {
        "model_version": MODEL_VERSION,
        "training_data_version": Path(args.data).name,
        "splits": splits,
        "live_session_weight_updates": False,
    })
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
