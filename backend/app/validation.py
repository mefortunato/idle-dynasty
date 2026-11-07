"""Casual anti-cheat for client-authoritative saves.

The game is simulated entirely on the client, so the server cannot truly verify
a save. Goals here are modest:

1. HARD checks reject obviously malformed/corrupt data (422): wrong types,
   negative/NaN/infinite currencies, absurd array sizes.
2. SOFT checks compare the new save to the previous one and the wall-clock time
   between the two uploads. Impossible-looking progress is still ACCEPTED (we
   never want to destroy a legit player's save over a heuristic), but a warning
   is returned and the record is flagged, which hides the user from public
   leaderboards. Flags are sticky.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

CURRENCY_FIELDS = ("cash", "fans", "trophies", "lifetimeTrophies", "legacy", "tokens", "shards")
MAX_LINEUP = 10
MAX_ATHLETES = 200


class ValidationError(Exception):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


@dataclass
class Result:
    warnings: list[str] = field(default_factory=list)
    flagged: bool = False


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _num(save: dict, key: str) -> float:
    v = save.get(key)
    return float(v) if _is_num(v) and math.isfinite(v) else 0.0


def check_hard(save: Any) -> None:
    """Raise ValidationError if the save is structurally unacceptable."""
    if not isinstance(save, dict):
        raise ValidationError(["save must be an object"])
    errors: list[str] = []
    if not _is_int(save.get("version")):
        errors.append("version must be an integer")
    for key in CURRENCY_FIELDS:
        if key not in save:
            continue
        v = save[key]
        if not _is_num(v) or not math.isfinite(v):
            errors.append(f"{key} must be a finite number")
        elif v < 0:
            errors.append(f"{key} must not be negative")
    for key, limit in (("lineup", MAX_LINEUP), ("athletes", MAX_ATHLETES)):
        if key in save:
            v = save[key]
            if not isinstance(v, list):
                errors.append(f"{key} must be a list")
            elif len(v) > limit:
                errors.append(f"{key} too long (max {limit})")
    for key in ("bestTier", "ascensions"):
        if key in save and (not _is_num(save[key]) or not math.isfinite(save[key]) or save[key] < 0):
            errors.append(f"{key} must be a non-negative number")
    if errors:
        raise ValidationError(errors)


def check_soft(new: dict, prev: dict | None, elapsed_seconds: float | None) -> Result:
    """Compare against the previous save. Never rejects; may flag."""
    res = Result()
    if prev is None or elapsed_seconds is None:
        return res
    hours = max(elapsed_seconds, 0) / 3600
    minutes = max(elapsed_seconds, 0) / 60
    tier = max(1.0, _num(new, "bestTier"))

    d_trophies = _num(new, "lifetimeTrophies") - _num(prev, "lifetimeTrophies")
    allowed = (hours * 40 + 50) * tier
    if d_trophies > allowed:
        res.warnings.append(f"lifetimeTrophies rose by {d_trophies:g} (allowed ~{allowed:g})")

    d_asc = _num(new, "ascensions") - _num(prev, "ascensions")
    if d_asc > minutes / 5 + 1:
        res.warnings.append(f"ascensions rose by {d_asc:g} in {minutes:.1f} min")

    d_tier = _num(new, "bestTier") - _num(prev, "bestTier")
    if d_tier > minutes / 10 + 2:
        res.warnings.append(f"bestTier jumped by {d_tier:g} in {minutes:.1f} min")

    res.flagged = bool(res.warnings)
    return res
