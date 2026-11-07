"""Guest auth: opaque random bearer tokens; only the SHA-256 hash is stored."""
from __future__ import annotations

import hashlib
import secrets
import uuid

from fastapi import HTTPException, Request


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_user_id() -> str:
    return uuid.uuid4().hex


def default_display_name() -> str:
    return "Coach-" + secrets.token_hex(2).upper()


async def current_user(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Missing bearer token", headers={"WWW-Authenticate": "Bearer"})
    user = await request.app.state.repo.get_user_by_token_hash(hash_token(token.strip()))
    if not user:
        raise HTTPException(401, "Invalid token", headers={"WWW-Authenticate": "Bearer"})
    return user
