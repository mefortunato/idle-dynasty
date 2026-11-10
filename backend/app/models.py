"""Request models and shared constants."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

VARIANTS = frozenset(
    {
        "qb-read", "field-goal", "juke-runner",
        "penalty-shootout", "keepy-uppy", "through-ball",
        "free-throw", "three-point", "fast-break",
        "batting-cage", "paint-corner", "shoestring-catch",
        "slapshot", "goalie-reflex", "stickhandling",
    }
)
MEDALS = frozenset({"none", "bronze", "silver", "gold", "platinum"})
MAX_SAVE_BYTES = 512 * 1024


class SaveIn(BaseModel):
    save: dict[str, Any]
    revision: int | None = None


class ScoreIn(BaseModel):
    variant: str
    score: int
    durationMs: int
    medal: str = "none"


class MeIn(BaseModel):
    displayName: str = Field(min_length=3, max_length=20, pattern=r"^[A-Za-z0-9 _-]+$")


class GoogleIn(BaseModel):
    credential: str = Field(min_length=20, max_length=8192)
