"""Environment-driven configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Settings:
    mongodb_uri: str | None = None
    mongodb_db: str = "idle_dynasty"
    static_dir: Path = Path("./static")
    port: int = 8080
    cors_origins: list[str] = field(default_factory=list)
    token_secret: str | None = None  # reserved; tokens are opaque random strings
    google_client_id: str | None = None  # OAuth 2.0 Web client ID; enables Sign in with Google

    @classmethod
    def from_env(cls) -> "Settings":
        origins = os.environ.get("CORS_ORIGINS", "")
        return cls(
            mongodb_uri=os.environ.get("MONGODB_URI") or None,
            mongodb_db=os.environ.get("MONGODB_DB") or "idle_dynasty",
            static_dir=Path(os.environ.get("STATIC_DIR") or "./static"),
            port=int(os.environ.get("PORT") or 8080),
            cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
            token_secret=os.environ.get("TOKEN_SECRET") or None,
            google_client_id=os.environ.get("GOOGLE_CLIENT_ID") or None,
        )
