"""Rating module. The engine is pure; see docs/RATING.md."""

from .engine import MatchDelta, MatchInput, RatingResult, compute

__all__ = ["MatchDelta", "MatchInput", "RatingResult", "compute"]
