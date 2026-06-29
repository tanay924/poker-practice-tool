from __future__ import annotations

from app.solver.adapters import SharkWorkerSolverAdapter, SolverAdapter
from app.solver.config import SolverSettings, settings_from_env


def create_solver(settings: SolverSettings | None = None) -> SolverAdapter:
    settings = settings or settings_from_env()
    solver_name = settings.solver_name.strip().lower()

    if solver_name == "shark":
        return SharkWorkerSolverAdapter(settings)

    raise ValueError("Only the Shark solver is supported.")


def create_solver_from_env() -> SolverAdapter:
    return create_solver(settings_from_env())
