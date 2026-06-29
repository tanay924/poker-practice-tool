import pytest

from app.solver.adapters import SharkWorkerSolverAdapter
from app.solver.config import SolverSettings
from app.solver.factory import create_solver, create_solver_from_env


def test_solver_factory_selects_shark_by_default() -> None:
    solver = create_solver(
        SolverSettings(
            shark_worker_path="C:/missing/shark_worker.exe",
        )
    )

    assert isinstance(solver, SharkWorkerSolverAdapter)


def test_solver_factory_rejects_non_shark_solver() -> None:
    with pytest.raises(ValueError, match="Only the Shark solver"):
        create_solver(SolverSettings(solver_name="legacy"))


def test_legacy_env_solver_selector_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POKER_TRAINER_SOLVER", "legacy")
    monkeypatch.setenv("POKER_TRAINER_SHARK_PATH", "C:/missing/shark_worker.exe")

    solver = create_solver_from_env()

    assert isinstance(solver, SharkWorkerSolverAdapter)
