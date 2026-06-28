from app.solver.config import SolverSettings


def test_shark_config_disables_postflop_raises_by_default() -> None:
    config = SolverSettings(solver_name="shark").shark_config_json()

    assert config["postflop_raises_enabled"] is False

