from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.env import load_local_env

load_local_env()

from app.analysis.service import process_next_analysis_job
from app.api import analysis, hands, ranges, social, stats, study_spots
from app.db import SessionLocal, init_db
from app.seed import seed_database
from app.solver.adapters import SolverAdapter
from app.solver.factory import create_solver_from_env


async def worker_loop(solver: SolverAdapter | None = None) -> None:
    while True:
        with SessionLocal() as db:
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|\[::1\]):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hands.router)
app.include_router(analysis.router)
app.include_router(ranges.router)
app.include_router(social.router)
app.include_router(stats.router)
app.include_router(study_spots.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
