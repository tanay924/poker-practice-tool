from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.analysis.service import process_next_analysis_job
from app.api import analysis, hands, ranges
from app.db import SessionLocal, init_db
from app.seed import seed_database


async def worker_loop() -> None:
    while True:
        with SessionLocal() as db:
            await process_next_analysis_job(db)
        await asyncio.sleep(1.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        await seed_database(db)

    worker_task: asyncio.Task | None = None
    if os.getenv("POKER_TRAINER_WORKER_AUTOSTART", "1") != "0":
        worker_task = asyncio.create_task(worker_loop())

    try:
        yield
    finally:
        if worker_task is not None:
            worker_task.cancel()
            with suppress(asyncio.CancelledError):
                await worker_task


app = FastAPI(title="Local Poker Trainer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hands.router)
app.include_router(analysis.router)
app.include_router(ranges.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
