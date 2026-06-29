import pytest

from app.solver.adapters import MockSolverAdapter, SharkWorkerSolverAdapter
from app.solver.config import SolverSettings
from app.solver.factory import create_solver


def test_solver_factory_selects_mock() -> None:
    solver = create_solver(SolverSettings(solver_name="mock"))

    assert isinstance(solver, MockSolverAdapter)


def test_solver_factory_selects_shark_without_falling_back_to_mock() -> None:
    solver = create_solver(
        SolverSettings(
            solver_name="shark",
            shark_worker_path="C:/missing/shark_worker.exe",
        )
    )

    assert isinstance(solver, SharkWorkerSolverAdapter)


def test_solver_factory_rejects_unknown_solver() -> None:
    with pytest.raises(ValueError, match="Unsupported solver"):
        create_solver(SolverSettings(solver_name="nonsense"))
