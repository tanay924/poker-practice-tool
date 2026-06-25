import asyncio

from app.solver.adapters import MockSolverAdapter


def test_mock_solver_strategy_frequencies_sum_to_one() -> None:
    solver_input = {
        "hand_id": 1,
        "hero_cards": "AsKd",
        "board": ["Ks", "7d", "2c", "4h", "9s"],
        "action_history": [
            {
                "street": "flop",
                "actor": "SB",
                "action": "check",
                "node": "SB flop decision",
            },
            {
                "street": "turn",
                "actor": "SB",
                "action": "bet_66",
                "node": "SB turn decision",
            },
        ],
    }

    output = asyncio.run(MockSolverAdapter(delay_seconds=0).solve(solver_input))

    assert output["street_results"]
    for result in output["street_results"]:
        assert abs(sum(result["solver_strategy"].values()) - 1.0) < 0.000001
