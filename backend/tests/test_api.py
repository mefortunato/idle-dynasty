import hashlib
from datetime import datetime, timedelta, timezone

from app.routes import api

GOOD = {"version": 1, "cash": 10, "fans": 0, "trophies": 1, "lifetimeTrophies": 5, "legacy": 0,
        "tokens": 0, "shards": 0, "bestTier": 2, "ascensions": 1, "lineup": [], "athletes": []}


def put(client, user, save, rev=None):
    return client.put("/api/save", headers=user["h"], json={"save": save, "revision": rev})


def test_health(client):
    assert client.get("/api/health").json() == {"ok": True, "db": "memory"}


def test_guest_auth_and_hash_storage(client):
    d = client.post("/api/auth/guest").json()
    assert d["displayName"].startswith("Coach-") and len(d["token"]) >= 43
    h = {"Authorization": f"Bearer {d['token']}"}
    assert client.get("/api/me", headers=h).json()["userId"] == d["userId"]
    repo = client.app.state.repo
    assert hashlib.sha256(d["token"].encode()).hexdigest() in repo.by_token
    assert d["token"] not in repo.by_token
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_display_name(client, user):
    assert client.patch("/api/me", headers=user["h"], json={"displayName": "Big Coach_1"}).json()["displayName"] == "Big Coach_1"
    for bad in ("ab", "x" * 21, "bad!name"):
        assert client.patch("/api/me", headers=user["h"], json={"displayName": bad}).status_code == 422


def test_save_roundtrip_and_conflict(client, user):
    assert client.get("/api/save", headers=user["h"]).status_code == 404
    r = put(client, user, GOOD)
    assert r.status_code == 200 and r.json()["revision"] == 1 and r.json()["warnings"] == []
    g = client.get("/api/save", headers=user["h"]).json()
    assert g["save"] == GOOD and g["revision"] == 1 and g["updatedAt"]
    assert put(client, user, GOOD, 1).json()["revision"] == 2
    c = put(client, user, {**GOOD, "cash": 99}, 1)  # stale
    assert c.status_code == 409 and c.json()["server"]["revision"] == 2
    assert put(client, user, GOOD, None).status_code == 409  # null but save exists


def test_save_too_large(client, user):
    big = {**GOOD, "log": ["x" * 1000] * 600}
    assert put(client, user, big).status_code == 413


def test_validation_rejects(client, user):
    bads = [
        {**GOOD, "version": "1"}, {**GOOD, "version": 1.5}, {k: v for k, v in GOOD.items() if k != "version"},
        {**GOOD, "cash": -1}, {**GOOD, "fans": "5"}, {**GOOD, "shards": -0.5},
        {**GOOD, "lineup": list(range(11))}, {**GOOD, "athletes": list(range(201))},
    ]
    for b in bads:
        assert put(client, user, b).status_code == 422, b
    # NaN / Infinity literals
    for lit in ("NaN", "Infinity"):
        raw = '{"save": {"version": 1, "cash": %s}, "revision": null}' % lit
        r = client.put("/api/save", headers={**user["h"], "Content-Type": "application/json"}, content=raw)
        assert r.status_code == 422
    r = client.put("/api/save", headers=user["h"], json={"save": [1], "revision": None})
    assert r.status_code == 422


def test_flagging_excludes_from_leaderboard(client, user):
    assert put(client, user, GOOD).status_code == 200
    r = put(client, user, {**GOOD, "lifetimeTrophies": 10_000_000, "ascensions": 500, "bestTier": 90}, 1)
    assert r.status_code == 200 and len(r.json()["warnings"]) == 3
    assert client.get("/api/leaderboard/dynasty").json()["entries"] == []
    # sticky
    assert put(client, user, GOOD, 2).status_code == 200
    assert client.get("/api/leaderboard/dynasty").json()["entries"] == []


def test_elapsed_time_allows_progress(client, user):
    put(client, user, GOOD)
    rec = client.app.state.repo.saves[user["userId"]]
    rec["updatedAt"] = (datetime.now(timezone.utc) - timedelta(hours=10)).isoformat().replace("+00:00", "Z")
    r = put(client, user, {**GOOD, "lifetimeTrophies": 300, "bestTier": 3}, 1)
    assert r.json()["warnings"] == []
    row = client.get("/api/leaderboard/dynasty").json()["entries"][0]
    assert row["bestTier"] == 3 and row["lifetimeTrophies"] == 300


def test_dynasty_order(client):
    def mk(tier, trophies):
        d = client.post("/api/auth/guest").json()
        u = {"h": {"Authorization": f"Bearer {d['token']}"}}
        put(client, u, {**GOOD, "bestTier": tier, "lifetimeTrophies": trophies})
    mk(2, 10); mk(5, 1); mk(5, 50)
    e = client.get("/api/leaderboard/dynasty").json()["entries"]
    assert [(x["bestTier"], x["lifetimeTrophies"]) for x in e] == [(5, 50), (5, 1), (2, 10)]


def score(client, user, **kw):
    body = {"variant": "qb-read", "score": 500, "durationMs": 20000, "medal": "gold", **kw}
    return client.post("/api/scores", headers=user["h"], json=body)


def test_scores_best_of_day(client, user):
    assert score(client, user, score=400).json()["improved"] is True
    r = score(client, user, score=300).json()
    assert r["best"] == 400 and r["improved"] is False
    assert score(client, user, score=700).json()["best"] == 700
    e = client.get("/api/leaderboard/scores/qb-read").json()["entries"]
    assert e == [{"displayName": user["displayName"], "score": 700}]
    old = client.get("/api/leaderboard/scores/qb-read?day=2020-01-01").json()
    assert old["entries"] == []
    assert client.get("/api/leaderboard/scores/qb-read?day=bad").status_code == 422
    assert client.get("/api/leaderboard/scores/nope").status_code == 404


def test_score_validation(client, user):
    for kw in ({"variant": "nope"}, {"score": -1}, {"score": 1001}, {"durationMs": 5999},
               {"durationMs": 40001}, {"medal": "diamond"}):
        assert score(client, user, **kw).status_code == 422, kw
    assert client.post("/api/scores", json={}).status_code in (401, 422)


def test_score_rate_limit(client, user):
    codes = [score(client, user).status_code for _ in range(32)]
    assert codes[:30] == [200] * 30 and codes[30:] == [429, 429]


def test_api_404_json(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")
    assert client.post("/api/nope/deeper").status_code == 404


def test_spa(client):
    r = client.get("/")
    assert r.text == "<html>SPA</html>" and r.headers["cache-control"] == "no-cache"
    r = client.get("/play/some/route")
    assert r.text == "<html>SPA</html>"
    r = client.get("/_app/immutable/a.js")
    assert "immutable" in r.headers["cache-control"]
    assert client.get("/manifest.webmanifest").headers["cache-control"] == "no-cache"
    assert client.get("/missing.js").status_code == 404
    assert client.get("/../../etc/passwd").text == "<html>SPA</html>"


# ───────────────────────── Google sign-in ─────────────────────────

import pytest  # noqa: E402

from app import google_auth  # noqa: E402
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture
def gclient(static_dir, monkeypatch):
    """Client with Google sign-in enabled; credentials of the form 'test-cred:<sub>' verify as that sub."""

    def fake_verify(credential: str, client_id: str):
        assert client_id == "test-client.apps.googleusercontent.com"
        if not credential.startswith("test-cred:"):
            raise google_auth.GoogleAuthError("bad")
        sub = credential.split(":", 1)[1]
        return google_auth.GoogleIdentity(sub=sub, email=f"{sub}@example.com")

    monkeypatch.setattr(google_auth, "verify_credential", fake_verify)
    app = create_app(Settings(static_dir=static_dir, google_client_id="test-client.apps.googleusercontent.com"))
    with TestClient(app) as c:
        yield c


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def test_config_exposes_client_id(client, gclient):
    assert client.get("/api/config").json() == {"googleClientId": None}
    assert gclient.get("/api/config").json()["googleClientId"].endswith(".apps.googleusercontent.com")


def test_google_not_configured(client):
    r = client.post("/api/auth/google", json={"credential": "test-cred:abcdefghijklmnopqrstu"})
    assert r.status_code == 503


def test_google_rejects_bad_credential(gclient):
    r = gclient.post("/api/auth/google", json={"credential": "x" * 40})
    assert r.status_code == 401


def test_google_links_guest_and_keeps_progress(gclient):
    g = gclient.post("/api/auth/guest").json()
    assert gclient.put("/api/save", json={"save": {"version": 1, "cash": 5}, "revision": None}, headers=_bearer(g["token"])).status_code == 200
    r = gclient.post("/api/auth/google", json={"credential": "test-cred:sub-111111111111111"}, headers=_bearer(g["token"]))
    d = r.json()
    assert r.status_code == 200 and d["linked"] is True and d["userId"] == g["userId"]
    assert d["google"] == {"email": "sub-111111111111111@example.com"}
    # New token reaches the same save; the old guest token keeps working too.
    assert gclient.get("/api/save", headers=_bearer(d["token"])).json()["save"]["cash"] == 5
    assert gclient.get("/api/me", headers=_bearer(g["token"])).json()["google"] is not None


def test_google_second_device_signs_into_same_account(gclient):
    first = gclient.post("/api/auth/google", json={"credential": "test-cred:sub-222222222222222"}).json()
    other_guest = gclient.post("/api/auth/guest").json()
    second = gclient.post(
        "/api/auth/google", json={"credential": "test-cred:sub-222222222222222"}, headers=_bearer(other_guest["token"])
    ).json()
    assert second["linked"] is False and second["userId"] == first["userId"] != other_guest["userId"]
    assert second["token"] != first["token"]
    assert gclient.get("/api/me", headers=_bearer(second["token"])).json()["userId"] == first["userId"]


def test_logout_revokes_session_token(gclient):
    first = gclient.post("/api/auth/google", json={"credential": "test-cred:sub-333333333333333"}).json()
    second = gclient.post("/api/auth/google", json={"credential": "test-cred:sub-333333333333333"}).json()
    assert gclient.post("/api/auth/logout", headers=_bearer(second["token"])).json() == {"ok": True}
    assert gclient.get("/api/me", headers=_bearer(second["token"])).status_code == 401
    assert gclient.get("/api/me", headers=_bearer(first["token"])).status_code == 200


def test_already_linked_account_cannot_be_relinked(gclient):
    a = gclient.post("/api/auth/google", json={"credential": "test-cred:sub-444444444444444"}).json()
    b = gclient.post("/api/auth/google", json={"credential": "test-cred:sub-555555555555555"}, headers=_bearer(a["token"])).json()
    assert b["userId"] != a["userId"] and b["linked"] is False
    assert gclient.get("/api/me", headers=_bearer(a["token"])).json()["google"]["email"].startswith("sub-444")
