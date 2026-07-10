from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
import json
import logging
import os
import re
from collections import defaultdict, deque
import time
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.responses import JSONResponse

from app.env import load_local_env

load_local_env()

from app.analysis.service import process_next_analysis_job, requeue_expired_analysis_jobs
from app.api import account, admin, analysis, guest_sessions, hands, ranges, social, stats, study_spots
from app.db import SessionLocal, get_db, init_db
from app.seed import seed_database
from app.solver.adapters import SolverAdapter
from app.solver.factory import create_solver_from_env

http_logger = logging.getLogger("poker_trainer.http")
http_logger.setLevel(logging.INFO)
if not http_logger.handlers:
    http_handler = logging.StreamHandler()
    http_handler.setLevel(logging.INFO)
    http_handler.setFormatter(logging.Formatter("%(message)s"))
    http_logger.addHandler(http_handler)
    http_logger.propagate = False


async def worker_loop(solver: SolverAdapter | None = None) -> None:
    while True:
        with SessionLocal() as db:
            requeue_expired_analysis_jobs(db)
            await process_next_analysis_job(db, solver=solver)
        await asyncio.sleep(1.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        await seed_database(db)

    solver = create_solver_from_env()
    worker_task: asyncio.Task | None = None
    if os.getenv("POKER_TRAINER_WORKER_AUTOSTART", "1") != "0":
        worker_task = asyncio.create_task(worker_loop(solver))

    try:
        yield
    finally:
        if worker_task is not None:
            worker_task.cancel()
            with suppress(asyncio.CancelledError):
                await worker_task
        await solver.close()


app = FastAPI(title="Local Poker Trainer", lifespan=lifespan)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        started = time.perf_counter()
        requested_id = request.headers.get("X-Request-ID", "").strip()
        request_id = requested_id if re.fullmatch(r"[A-Za-z0-9._-]{1,96}", requested_id) else uuid4().hex
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        http_logger.info(json.dumps({
            "event": "http_request",
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }, separators=(",", ":")))
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        if os.getenv("ENVIRONMENT", "local").strip().lower() not in {"local", "development", "test"}:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.events: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next) -> Response:
        if not rate_limits_enabled():
            return await call_next(request)
        limit = rate_limit_for(request.method, request.url.path)
        if limit is None:
            return await call_next(request)
        key = (request.client.host if request.client else "unknown", request.url.path)
        now = time.monotonic()
        events = self.events[key]
        while events and events[0] <= now - 60:
            events.popleft()
        if len(events) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait and try again."},
                headers={"Retry-After": "60"},
            )
        events.append(now)
        return await call_next(request)


def rate_limits_enabled() -> bool:
    configured = os.getenv("POKER_TRAINER_RATE_LIMIT_ENABLED")
    if configured is not None:
        return configured.strip().lower() in {"1", "true", "yes"}
    return os.getenv("ENVIRONMENT", "local").strip().lower() not in {"local", "development", "test"}


def rate_limit_for(method: str, path: str) -> int | None:
    if method == "POST" and path == "/api/guest-sessions":
        return _rate_limit_value("POKER_TRAINER_GUEST_SESSION_RATE_LIMIT", 20)
    if method == "POST" and (path == "/api/hands" or path.endswith("/analyze")):
        return _rate_limit_value("POKER_TRAINER_ANALYSIS_SUBMISSION_RATE_LIMIT", 30)
    return None


def _rate_limit_value(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _allowed_origins() -> list[str]:
    configured = [origin.strip().rstrip("/") for origin in os.getenv("ALLOWED_ORIGINS", "").split(",") if origin.strip()]
    return configured or ["http://localhost:5173", "http://127.0.0.1:5173"]


def _allowed_origin_regex() -> str | None:
    if os.getenv("ALLOWED_ORIGINS", "").strip():
        return None
    if os.getenv("ENVIRONMENT", "local").strip().lower() in {"local", "development", "test"}:
        return r"^http://(localhost|127\.0\.0\.1|\[::1\]):\d+$"
    return None


app.add_middleware(RequestIdMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=_allowed_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(hands.router)
app.include_router(analysis.router)
app.include_router(account.router)
app.include_router(admin.router)
app.include_router(ranges.router)
app.include_router(guest_sessions.router)
app.include_router(social.router)
app.include_router(stats.router)
app.include_router(study_spots.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/health/live")
def health_live() -> dict[str, str]:
    return {"status": "live"}


@app.get("/api/health/ready")
def health_ready(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database is not ready") from exc
    return {"status": "ready", "database": "ok"}
