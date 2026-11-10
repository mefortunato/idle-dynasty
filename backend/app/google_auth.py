"""Verify Google Identity Services ID tokens (the `credential` from the Sign in with Google button)."""
from __future__ import annotations

from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

_transport = google_requests.Request()  # caches Google's signing certs between calls


class GoogleAuthError(Exception):
    pass


@dataclass
class GoogleIdentity:
    sub: str
    email: str | None


def verify_credential(credential: str, client_id: str) -> GoogleIdentity:
    """Check signature, expiry, issuer and audience. Blocking (may fetch certs); call from a threadpool."""
    try:
        info = id_token.verify_oauth2_token(credential, _transport, client_id)
    except ValueError as e:
        raise GoogleAuthError(str(e)) from e
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise GoogleAuthError("Wrong issuer")
    email = info.get("email") if info.get("email_verified") else None
    return GoogleIdentity(sub=str(info["sub"]), email=email)
