from __future__ import annotations

from app.solver.adapters import MockSolverAdapter, SharkWorkerSolverAdapter, SolverAdapter
from app.solver.config import SolverSettings, settings_from_env


def create_solver(settings: SolverSettings | None = None) -> SolverAdapter:
    settings = settings or settings_from_env()
    solver_name = settings.solver_name.strip().lower()

    if solver_name == "mock":
        return MockSolverAdapter()
    if solver_name == "shark":
        return SharkWorkerSolverAdapter(settings)

    raise ValueError(f"Unsupported solver: {settings.solver_name}")


def create_solver_from_env() -> SolverAdapter:
    return create_solver(settings_from_env())
