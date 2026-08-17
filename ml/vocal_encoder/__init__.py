"""Small inspectable vocal-encoder package. Training happens between sessions only."""

from .dataset import split_sessions, assert_no_session_leakage
from .mel import log_mel_spectrogram, PROVISIONAL_EMBEDDING_DIM

__all__ = [
    "split_sessions",
    "assert_no_session_leakage",
    "log_mel_spectrogram",
    "PROVISIONAL_EMBEDDING_DIM",
]
