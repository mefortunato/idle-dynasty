from __future__ import annotations

import json
import time
from collections import defaultdict, deque
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from .. import auth, validation
from ..models import MAX_SAVE_BYTES, MEDALS, VARIANTS, MeIn, SaveIn, ScoreIn

router = APIRouter(prefix="/api")

RATE_MAX = 30
RATE_WINDOW_S = 600
_rate: dict[str, deque] = defaultdict(deque)


def _repo(request: Request):
    return request.app.state.repo


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


@router.get("/health")
async def health(request: Request):
    return {"ok": True, "db": _repo(request).kind}


@router.post("/auth/guest")
async def guest(request: Request):
    token = auth.new_token()
    user = {
        "_id": auth.new_user_id(),
        "token": auth.hash_token(token),
        "displayName": auth.default_display_name(),
        "createdAt": _iso(_now()),
    }
    await _repo(request).create_user(user)
    return {"userId": user["_id"], "token": token, "displayName": user["displayName"]}


@router.get("/me")
async def me(user: dict = Depends(auth.current_user)):
    return {"userId": user["_id"], "displayName": user["displayName"]}


@router.patch("/me")
async def patch_me(body: MeIn, request: Request, user: dict = Depends(auth.current_user)):
    name = body.displayName.strip()
    if not 3 <= len(name) <= 20:
        raise HTTPException(422, "displayName must be 3-20 characters")
    await _repo(request).set_display_name(user["_id"], name)
    return {"userId": user["_id"], "displayName": name}


def _save_response(rec: dict) -> dict:
    return {"save": json.loads(rec["data"]), "updatedAt": rec["updatedAt"], "revision": rec["revision"]}


@router.get("/save")
async def get_save(request: Request, user: dict = Depends(auth.current_user)):
    rec = await _repo(request).get_save(user["_id"])
    if not rec:
        raise HTTPException(404, "No save")
    return _save_response(rec)


@router.put("/save")
async def put_save(request: Request, user: dict = Depends(auth.current_user)):
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_SAVE_BYTES:
        raise HTTPException(413, "Save too large")
    raw = await request.body()
    if len(raw) > MAX_SAVE_BYTES:
        raise HTTPException(413, "Save too large")
    try:
        body = SaveIn.model_validate_json(raw)
    except Exception as e:  # pydantic ValidationError / bad JSON
        raise HTTPException(422, f"Invalid body: {str(e)[:200]}")
    try:
        validation.check_hard(body.save)
    except validation.ValidationError as e:
        return JSONResponse({"detail": "Save rejected", "errors": e.errors}, status_code=422)

    repo = _repo(request)
    cur = await repo.get_save(user["_id"])
    cur_rev = cur["revision"] if cur else None
    if cur_rev != body.revision:
        return JSONResponse(
            {"detail": "Revision conflict", "server": _save_response(cur) if cur else None}, status_code=409
        )

    now = _now()
    res = validation.Result()
    if cur:
        elapsed = (now - datetime.fromisoformat(cur["updatedAt"].replace("Z", "+00:00"))).total_seconds()
        res = validation.check_soft(body.save, json.loads(cur["data"]), elapsed)

    s = body.save
    num = lambda k: s[k] if isinstance(s.get(k), (int, float)) and not isinstance(s.get(k), bool) else 0  # noqa: E731
    record = {
        "userId": user["_id"],
        "data": json.dumps(s, separators=(",", ":")),
        "revision": (cur_rev + 1) if cur else 1,
        "updatedAt": _iso(now),
        "bestTier": num("bestTier"),
        "ascensions": num("ascensions"),
        "lifetimeTrophies": num("lifetimeTrophies"),
        "displayName": user["displayName"],
        "flagged": bool(cur and cur.get("flagged")) or res.flagged,  # sticky
    }
    ok = await repo.put_save(user["_id"], record, body.revision)
    if not ok:  # lost a race with another writer
        latest = await repo.get_save(user["_id"])
        return JSONResponse(
            {"detail": "Revision conflict", "server": _save_response(latest) if latest else None}, status_code=409
        )
    return {"revision": record["revision"], "updatedAt": record["updatedAt"], "warnings": res.warnings}


def _check_rate(user_id: str) -> None:
    q = _rate[user_id]
    now = time.monotonic()
    while q and now - q[0] > RATE_WINDOW_S:
        q.popleft()
    if len(q) >= RATE_MAX:
        raise HTTPException(429, "Too many score submissions", headers={"Retry-After": "60"})
    q.append(now)


@router.post("/scores")
async def post_score(body: ScoreIn, request: Request, user: dict = Depends(auth.current_user)):
    if body.variant not in VARIANTS:
        raise HTTPException(422, "Unknown variant")
    if not 0 <= body.score <= 1000:
        raise HTTPException(422, "score must be 0-1000")
    if not 6000 <= body.durationMs <= 40000:
        raise HTTPException(422, "durationMs must be 6000-40000")
    if body.medal not in MEDALS:
        raise HTTPException(422, "Unknown medal")
    _check_rate(user["_id"])
    day = _now().strftime("%Y-%m-%d")
    best, improved = await _repo(request).upsert_best_score(
        body.variant, day, user["_id"], user["displayName"], body.score
    )
    return {"variant": body.variant, "day": day, "score": body.score, "best": best, "improved": improved}


@router.get("/leaderboard/scores/{variant}")
async def score_board(variant: str, request: Request, day: str | None = None):
    if variant not in VARIANTS:
        raise HTTPException(404, "Unknown variant")
    if day is None:
        day = _now().strftime("%Y-%m-%d")
    else:
        try:
            day = date.fromisoformat(day).isoformat()
        except ValueError:
            raise HTTPException(422, "day must be YYYY-MM-DD")
    return {"variant": variant, "day": day, "entries": await _repo(request).top_scores(variant, day, 20)}


@router.get("/leaderboard/dynasty")
async def dynasty_board(request: Request):
    return {"entries": await _repo(request).top_dynasty(20)}
