"""
Log-scaled mel-frequency spectrogram (REQ-048).

Implemented with the Python standard library so dataset tests do not require
NumPy. Training code may still convert the result to tensors later.
"""

from __future__ import annotations

import cmath
import math

PROVISIONAL_WINDOW_SECONDS = (0.5, 2.0)
PROVISIONAL_EMBEDDING_DIM = 64


def hz_to_mel(hz: float) -> float:
    return 2595.0 * math.log10(1.0 + hz / 700.0)


def mel_to_hz(mel: float) -> float:
    return 700.0 * (10 ** (mel / 2595.0) - 1.0)


def _rfft_mag(frame: list[float]) -> list[float]:
    n = len(frame)
    mags = []
    for k in range(n // 2 + 1):
        acc = 0j
        for i, x in enumerate(frame):
            acc += x * cmath.exp(-2j * math.pi * k * i / n)
        mags.append(abs(acc))
    return mags


def log_mel_spectrogram(
    samples,
    sample_rate: int = 16000,
    n_fft: int = 256,
    hop: int = 128,
    n_mels: int = 64,
) -> list[list[float]]:
    x = [float(v) for v in samples]
    n = len(x)
    frames = 1 + max(0, (n - n_fft) // hop)
    window = [0.5 - 0.5 * math.cos(2 * math.pi * i / (n_fft - 1)) for i in range(n_fft)]

    n_spec = n_fft // 2 + 1
    fmin, fmax = 20.0, sample_rate / 2
    mels = [hz_to_mel(fmin) + i * (hz_to_mel(fmax) - hz_to_mel(fmin)) / (n_mels + 1) for i in range(n_mels + 2)]
    hz = [mel_to_hz(m) for m in mels]
    bins = [min(n_spec - 1, max(0, int((n_fft + 1) * h / sample_rate))) for h in hz]

    fb = [[0.0] * n_spec for _ in range(n_mels)]
    for i in range(n_mels):
        left, center, right = bins[i], bins[i + 1], bins[i + 2]
        if center <= left or right <= center:
            continue
        for j in range(left, center):
            fb[i][j] = (j - left) / (center - left)
        for j in range(center, right):
            fb[i][j] = (right - j) / (right - center)

    out = [[0.0] * frames for _ in range(n_mels)]
    for t in range(frames):
        start = t * hop
        frame = [0.0] * n_fft
        for i in range(n_fft):
            if start + i < n:
                frame[i] = x[start + i] * window[i]
        mag = _rfft_mag(frame)
        for m in range(n_mels):
            s = 0.0
            row = fb[m]
            for k, coeff in enumerate(row):
                if coeff:
                    s += coeff * mag[k]
            out[m][t] = math.log(s + 1e-6)
    return out
