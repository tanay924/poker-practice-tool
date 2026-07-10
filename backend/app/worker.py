"""Standalone analysis worker entry point.

The API keeps its local in-process worker for the single-machine experience. For
deployment or heavier seed runs, start this module as a separate process and set
POKER_TRAINER_WORKER_AUTOSTART=0 on the API process.
"""

from __future__ import annotations

import asyncio

from app.db import SessionLocal, init_db
from app.main import worker_loop
from app.seed import seed_database
from app.solver.factory import create_solver_from_env


async def run() -> None:
    init_db()
    with SessionLocal() as db:
        await seed_database(db)

    solver = create_solver_from_env()
    try:
        await worker_loop(solver)
    finally:
        await solver.close()


if __name__ == "__main__":
    asyncio.run(run())
