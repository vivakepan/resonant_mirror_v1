"""
Small convolutional vocal encoder (REQ-048–051A).

The training loop is written out explicitly: dataset → batch → forward →
loss → backward → optimizer step → checkpoint. Do not hide this behind
an opaque AutoML framework.
"""

from __future__ import annotations

import json
from pathlib import Path

EMBEDDING_DIM = 64
MODEL_ID = "vocal-encoder"
MODEL_VERSION = "vocal-encoder-0"


def count_parameters(module) -> int:
    return sum(p.numel() for p in module.parameters())


def build_model(embedding_dim: int = EMBEDDING_DIM):
    try:
        import torch
        from torch import nn
    except ImportError as exc:
        raise ImportError("PyTorch is required to construct VocalEncoder") from exc

    class VocalEncoder(nn.Module):
        def __init__(self, dim: int):
            super().__init__()
            self.conv = nn.Sequential(
                nn.Conv2d(1, 16, kernel_size=3, padding=1),
                nn.ReLU(),
                nn.MaxPool2d(2),
                nn.Conv2d(16, 32, kernel_size=3, padding=1),
                nn.ReLU(),
                nn.MaxPool2d(2),
                nn.Conv2d(32, 64, kernel_size=3, padding=1),
                nn.ReLU(),
                nn.AdaptiveAvgPool2d((4, 4)),
            )
            self.proj = nn.Linear(64 * 4 * 4, dim)

        def forward(self, x):
            # x: (batch, 1, n_mels, time)
            h = self.conv(x)
            h = h.flatten(1)
            z = self.proj(h)
            return torch.nn.functional.normalize(z, dim=-1)

    return VocalEncoder(embedding_dim)


def reconstruction_loss(embeddings, positives, negatives=None):
    import torch
    import torch.nn.functional as F
    # Simple contrastive / identity loss for first training: pull a window
    # toward a second window from the same session when provided.
    if positives is None:
        return embeddings.pow(2).mean() * 0  # no-op placeholder never used in train()
    return F.mse_loss(embeddings, positives)


def train_one_epoch(model, optimizer, batches, device="cpu"):
    """Explicit lifecycle: forward, loss, backward, optimizer step."""
    import torch

    model.train()
    total = 0.0
    n = 0
    for batch in batches:
        x = batch["mel"].to(device)
        optimizer.zero_grad()
        embeddings = model(x)
        target = batch.get("target_embedding")
        if target is not None:
            loss = reconstruction_loss(embeddings, target.to(device))
        else:
            # First-run unsupervised: spread-preserving identity regularizer.
            loss = (1 - embeddings.norm(dim=-1)).pow(2).mean()
        loss.backward()
        optimizer.step()
        total += float(loss.item())
        n += 1
    return total / max(n, 1)


def save_checkpoint(model, path: str | Path, metadata: dict) -> None:
    import torch

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "model_id": MODEL_ID,
        "model_version": metadata.get("model_version", MODEL_VERSION),
        "embedding_dim": EMBEDDING_DIM,
        "state_dict": model.state_dict(),
        "metadata": metadata,
    }
    torch.save(payload, path)
    meta_path = path.with_suffix(".json")
    json.dump({k: v for k, v in payload.items() if k != "state_dict"}, meta_path.open("w"), indent=2)


def load_checkpoint(path: str | Path, map_location="cpu"):
    import torch

    payload = torch.load(path, map_location=map_location)
    model = build_model(payload.get("embedding_dim", EMBEDDING_DIM))
    model.load_state_dict(payload["state_dict"])
    model.eval()
    return model, payload


def infer_embedding(model, mel, model_version: str = MODEL_VERSION):
    import torch

    model.eval()
    with torch.no_grad():
        x = torch.as_tensor(mel, dtype=torch.float32)
        if x.ndim == 2:
            x = x.unsqueeze(0).unsqueeze(0)
        elif x.ndim == 3:
            x = x.unsqueeze(0)
        z = model(x).cpu().numpy()[0]
    return {
        "embedding": z.tolist(),
        "model_id": MODEL_ID,
        "model_version": model_version,
        "embedding_dim": len(z),
    }
