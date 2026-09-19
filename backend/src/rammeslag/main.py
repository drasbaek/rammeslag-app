"""App factory and router registration.

FastAPI owns all logic and all database access. The frontend is a pure client
that speaks HTTP to the routes registered here.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from rammeslag.config import get_settings
from rammeslag.modules.matches.router import router as matches_router
from rammeslag.modules.matches.service import DomainError
from rammeslag.modules.players.router import auth_router
from rammeslag.modules.players.router import router as players_router
from rammeslag.modules.seasons.router import router as seasons_router
from rammeslag.modules.sessions.router import router as sessions_router

DESCRIPTION = (
    "ELO ladder for Rammeslag FC. The OpenAPI schema served here is the contract; "
    "lib/api.ts is generated from it."
)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Rammeslag FC",
        description=DESCRIPTION,
        version="0.1.0",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
        redoc_url=None,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.exception_handler(DomainError)
    async def _domain_error(request: Request, exc: DomainError) -> JSONResponse:
        # `detail` matches FastAPI's own error shape, so the client has one
        # error contract. The message is Danish: a player reads it.
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    @app.get("/api/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(players_router)
    app.include_router(seasons_router)
    app.include_router(sessions_router)
    app.include_router(matches_router)
    return app


app = create_app()
