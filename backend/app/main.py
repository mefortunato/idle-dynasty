from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from .config import Settings
from .db import make_repo
from .routes import api

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"
NO_CACHE_NAMES = {"index.html", "service-worker.js", "sw.js", "manifest.webmanifest", "manifest.json"}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    repo = make_repo(settings.mongodb_uri, settings.mongodb_db)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await repo.init()
        yield
        await repo.close()

    app = FastAPI(title="Idle Dynasty", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.repo = repo
    app.state.settings = settings

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(api.router)

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
    async def api_not_found(rest: str):
        return JSONResponse({"detail": "Not found"}, status_code=404)

    static_root = Path(settings.static_dir).resolve()

    @app.get("/{path:path}", include_in_schema=False)
    @app.head("/{path:path}", include_in_schema=False)
    async def spa(path: str, request: Request):
        index = static_root / "index.html"
        if not index.is_file():
            raise HTTPException(404, "Frontend not built")
        candidate = (static_root / path).resolve() if path else index
        if path and candidate.is_file() and static_root in candidate.parents:
            headers = {}
            if path.startswith("_app/immutable/"):
                headers["Cache-Control"] = IMMUTABLE
            elif candidate.name in NO_CACHE_NAMES:
                headers["Cache-Control"] = NO_CACHE
            else:
                headers["Cache-Control"] = "public, max-age=3600"
            return FileResponse(candidate, headers=headers)
        if Path(path).suffix:  # missing asset: a real 404, not the SPA shell
            return Response(status_code=404)
        return FileResponse(index, headers={"Cache-Control": NO_CACHE})

    return app


app = create_app()
