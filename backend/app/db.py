"""Storage abstraction: in-memory (default) and MongoDB implementations.

Documents are plain dicts. The save payload itself is stored as a JSON string
(`data`) so arbitrary client keys can never trip Mongo's key restrictions;
denormalized leaderboard fields live beside it.
"""
from __future__ import annotations

import asyncio
from typing import Any, Protocol


class Repo(Protocol):
    kind: str

    async def init(self) -> None: ...
    async def close(self) -> None: ...
    async def create_user(self, user: dict) -> None: ...
    async def get_user_by_token_hash(self, token_hash: str) -> dict | None: ...
    async def set_display_name(self, user_id: str, name: str) -> None: ...
    async def add_session(self, token_hash: str, user_id: str) -> None: ...
    async def delete_session(self, token_hash: str) -> None: ...
    async def get_user_by_google_sub(self, sub: str) -> dict | None: ...
    async def link_google(self, user_id: str, sub: str, email: str | None) -> None: ...
    async def get_save(self, user_id: str) -> dict | None: ...
    async def put_save(self, user_id: str, record: dict, expected_revision: int | None) -> bool: ...
    async def upsert_best_score(self, variant: str, day: str, user_id: str, display_name: str, score: int) -> tuple[int, bool]: ...
    async def top_scores(self, variant: str, day: str, limit: int) -> list[dict]: ...
    async def top_dynasty(self, limit: int) -> list[dict]: ...


class MemoryRepo:
    kind = "memory"

    def __init__(self) -> None:
        self.users: dict[str, dict] = {}
        self.by_token: dict[str, str] = {}
        self.sessions: dict[str, str] = {}  # extra device tokens: token_hash -> user_id
        self.saves: dict[str, dict] = {}
        self.scores: dict[tuple[str, str, str], dict] = {}
        self._lock = asyncio.Lock()

    async def init(self) -> None: ...
    async def close(self) -> None: ...

    async def create_user(self, user: dict) -> None:
        self.users[user["_id"]] = dict(user)
        self.by_token[user["token"]] = user["_id"]

    async def get_user_by_token_hash(self, token_hash: str) -> dict | None:
        uid = self.by_token.get(token_hash) or self.sessions.get(token_hash)
        return dict(self.users[uid]) if uid else None

    async def add_session(self, token_hash: str, user_id: str) -> None:
        self.sessions[token_hash] = user_id

    async def delete_session(self, token_hash: str) -> None:
        self.sessions.pop(token_hash, None)

    async def get_user_by_google_sub(self, sub: str) -> dict | None:
        for u in self.users.values():
            if u.get("googleSub") == sub:
                return dict(u)
        return None

    async def link_google(self, user_id: str, sub: str, email: str | None) -> None:
        self.users[user_id]["googleSub"] = sub
        self.users[user_id]["email"] = email

    async def set_display_name(self, user_id: str, name: str) -> None:
        self.users[user_id]["displayName"] = name
        if user_id in self.saves:
            self.saves[user_id]["displayName"] = name
        for (_, _, uid), s in self.scores.items():
            if uid == user_id:
                s["displayName"] = name

    async def get_save(self, user_id: str) -> dict | None:
        s = self.saves.get(user_id)
        return dict(s) if s else None

    async def put_save(self, user_id: str, record: dict, expected_revision: int | None) -> bool:
        async with self._lock:
            cur = self.saves.get(user_id)
            if (cur["revision"] if cur else None) != expected_revision:
                return False
            self.saves[user_id] = dict(record)
            return True

    async def upsert_best_score(self, variant, day, user_id, display_name, score):
        async with self._lock:
            key = (variant, day, user_id)
            cur = self.scores.get(key)
            if cur is None or score > cur["score"]:
                self.scores[key] = {"displayName": display_name, "score": score}
                return score, True
            cur["displayName"] = display_name
            return cur["score"], False

    async def top_scores(self, variant, day, limit):
        rows = [v for (var, d, _), v in self.scores.items() if var == variant and d == day]
        rows.sort(key=lambda r: -r["score"])
        return [{"displayName": r["displayName"], "score": r["score"]} for r in rows[:limit]]

    async def top_dynasty(self, limit):
        rows = [s for s in self.saves.values() if not s.get("flagged")]
        rows.sort(key=lambda s: (-s["bestTier"], -s["lifetimeTrophies"]))
        return [_dynasty_row(s) for s in rows[:limit]]


def _dynasty_row(s: dict) -> dict:
    return {
        "displayName": s["displayName"],
        "bestTier": s["bestTier"],
        "lifetimeTrophies": s["lifetimeTrophies"],
        "ascensions": s["ascensions"],
    }


class MongoRepo:
    kind = "mongo"

    def __init__(self, uri: str, db_name: str) -> None:
        from pymongo import AsyncMongoClient

        self.client = AsyncMongoClient(uri, serverSelectionTimeoutMS=10000)
        self.db = self.client[db_name]

    async def init(self) -> None:
        from pymongo import ASCENDING, DESCENDING

        await self.db.users.create_index("token", unique=True)
        await self.db.users.create_index("googleSub", unique=True, sparse=True)
        await self.db.sessions.create_index("userId")
        await self.db.saves.create_index("userId", unique=True)
        await self.db.saves.create_index(
            [("flagged", ASCENDING), ("bestTier", DESCENDING), ("lifetimeTrophies", DESCENDING)]
        )
        await self.db.scores.create_index([("variant", ASCENDING), ("day", ASCENDING), ("score", DESCENDING)])
        await self.db.scores.create_index([("variant", ASCENDING), ("day", ASCENDING), ("userId", ASCENDING)], unique=True)

    async def close(self) -> None:
        await self.client.close()

    async def create_user(self, user: dict) -> None:
        await self.db.users.insert_one(dict(user))

    async def get_user_by_token_hash(self, token_hash: str) -> dict | None:
        user = await self.db.users.find_one({"token": token_hash})
        if user:
            return user
        sess = await self.db.sessions.find_one({"_id": token_hash})
        return await self.db.users.find_one({"_id": sess["userId"]}) if sess else None

    async def add_session(self, token_hash: str, user_id: str) -> None:
        await self.db.sessions.insert_one({"_id": token_hash, "userId": user_id})

    async def delete_session(self, token_hash: str) -> None:
        await self.db.sessions.delete_one({"_id": token_hash})

    async def get_user_by_google_sub(self, sub: str) -> dict | None:
        return await self.db.users.find_one({"googleSub": sub})

    async def link_google(self, user_id: str, sub: str, email: str | None) -> None:
        await self.db.users.update_one({"_id": user_id}, {"$set": {"googleSub": sub, "email": email}})

    async def set_display_name(self, user_id: str, name: str) -> None:
        await self.db.users.update_one({"_id": user_id}, {"$set": {"displayName": name}})
        await self.db.saves.update_one({"userId": user_id}, {"$set": {"displayName": name}})
        await self.db.scores.update_many({"userId": user_id}, {"$set": {"displayName": name}})

    async def get_save(self, user_id: str) -> dict | None:
        return await self.db.saves.find_one({"userId": user_id}, {"_id": 0})

    async def put_save(self, user_id: str, record: dict, expected_revision: int | None) -> bool:
        from pymongo.errors import DuplicateKeyError

        doc = {**record, "userId": user_id}
        if expected_revision is None:
            try:
                await self.db.saves.insert_one(doc)
                return True
            except DuplicateKeyError:
                return False
        res = await self.db.saves.replace_one({"userId": user_id, "revision": expected_revision}, doc)
        return res.matched_count == 1

    async def upsert_best_score(self, variant, day, user_id, display_name, score):
        from pymongo.errors import DuplicateKeyError

        key = {"variant": variant, "day": day, "userId": user_id}
        # Raise only if strictly better; otherwise just refresh the name.
        for _ in range(2):
            try:
                res = await self.db.scores.update_one(
                    {**key, "score": {"$lt": score}}, {"$set": {"score": score, "displayName": display_name}}
                )
                if res.matched_count:
                    return score, True
                res = await self.db.scores.update_one(
                    key, {"$setOnInsert": {"score": score}, "$set": {"displayName": display_name}}, upsert=True
                )
                if res.upserted_id is not None:
                    return score, True
                break
            except DuplicateKeyError:
                continue
        doc = await self.db.scores.find_one(key)
        return (doc["score"] if doc else score), False

    async def top_scores(self, variant, day, limit):
        cur = self.db.scores.find({"variant": variant, "day": day}).sort("score", -1).limit(limit)
        return [{"displayName": d["displayName"], "score": d["score"]} async for d in cur]

    async def top_dynasty(self, limit):
        cur = (
            self.db.saves.find({"flagged": {"$ne": True}})
            .sort([("bestTier", -1), ("lifetimeTrophies", -1)])
            .limit(limit)
        )
        return [_dynasty_row(d) async for d in cur]


def make_repo(uri: str | None, db_name: str) -> Any:
    return MongoRepo(uri, db_name) if uri else MemoryRepo()
