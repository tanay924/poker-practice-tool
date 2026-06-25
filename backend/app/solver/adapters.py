from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path
from typing import Any, Protocol

SolverInput = dict[str, Any]
SolverOutput = dict[str, Any]

BET_DECISIONS = {
    "flop": ["check", "bet_50", "bet_100"],
    "turn": ["check", "bet_33", "bet_66", "bet_100"],
    "river": ["check", "bet_33", "bet_66", "bet_100"],
}

FACING_BET_DECISIONS = {
    "flop": ["fold", "call", "raise_100"],
    "turn": ["fold", "call", "raise_50", "raise_100"],
    "river": ["fold", "call", "raise_50", "raise_100"],
}


class SolverAdapter(Protocol):
    async def solve(self, solver_input: SolverInput) -> SolverOutput:
        pass


class MockSolverAdapter:
    def __init__(self, delay_seconds: float = 1.0) -> None:
        self.delay_seconds = delay_seconds

    async def solve(self, solver_input: SolverInput) -> SolverOutput:
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)

        street_results = []
        for action in solver_input.get("action_history", []):
            if action.get("actor") not in {"SB", "hero"}:
                continue
            street = action.get("street")
            hero_action = action.get("action")
            if street not in BET_DECISIONS or hero_action in {"open_2_5"}:
                continue

            strategy = self._strategy_for(street, hero_action, solver_input)
            best_action = max(strategy, key=strategy.get)
            street_results.append(
                {
                    "street": street,
                    "node": action.get("node") or f"SB {street} decision",
                    "hero_hand": solver_input.get("hero_cards"),
                    "board": self._board_for_street(solver_input.get("board", []), street),
                    "solver_strategy": strategy,
                    "hero_action": hero_action,
                    "best_action": best_action,
                    "verdict": self._verdict(strategy, hero_action, best_action),
                    "confidence": "high" if strategy[best_action] >= 0.55 else "medium",
                }
            )

        largest_mistake = self._largest_mistake(street_results)
        return {
            "street_results": street_results,
            "summary": {
                "overall": "needs_review" if largest_mistake else "mixed",
                "largest_mistake": largest_mistake,
            },
        }

    def _strategy_for(self, street: str, hero_action: str, solver_input: SolverInput) -> dict[str, float]:
        actions = FACING_BET_DECISIONS[street] if hero_action in FACING_BET_DECISIONS[street] else BET_DECISIONS[street]
        seed_payload = json.dumps(
            {
                "hand_id": solver_input.get("hand_id"),
                "hero_cards": solver_input.get("hero_cards"),
                "board": solver_input.get("board"),
                "street": street,
                "hero_action": hero_action,
            },
            sort_keys=True,
        )
        digest = hashlib.sha256(seed_payload.encode("utf-8")).digest()
        raw_weights = [1 + digest[index] % 10 for index in range(len(actions))]
        best_index = digest[len(actions)] % len(actions)
        raw_weights[best_index] += 12
        total = sum(raw_weights)

        strategy: dict[str, float] = {}
        running = 0.0
        for action, weight in zip(actions[:-1], raw_weights[:-1]):
            value = weight / total
            strategy[action] = value
            running += value
        strategy[actions[-1]] = 1.0 - running
        return strategy

    def _board_for_street(self, board: list[str], street: str) -> list[str]:
        if street == "flop":
            return board[:3]
        if street == "turn":
            return board[:4]
        return board[:5]

    def _verdict(self, strategy: dict[str, float], hero_action: str, best_action: str) -> str:
        hero_frequency = strategy.get(hero_action, 0.0)
        if hero_action == best_action:
            return "preferred"
        if hero_frequency >= 0.25:
            return "mixed"
        return "mistake"

    def _largest_mistake(self, street_results: list[dict[str, Any]]) -> dict[str, Any] | None:
        mistakes = [
            result
            for result in street_results
            if result["verdict"] == "mistake"
        ]
        if not mistakes:
            return None
        worst = min(mistakes, key=lambda result: result["solver_strategy"].get(result["hero_action"], 0.0))
        return {
            "street": worst["street"],
            "node": worst["node"],
            "hero_action": worst["hero_action"],
            "best_action": worst["best_action"],
        }


class SharkCliSolverAdapter:
    def __init__(self, shark_cli_path: str = "shark-cli") -> None:
        self.shark_cli_path = shark_cli_path

    async def solve(self, solver_input: SolverInput) -> SolverOutput:
        command_preview = f"{self.shark_cli_path} solve input.json --output output.json"
        raise NotImplementedError(
            "Shark CLI integration is not enabled yet. "
            f"Expected future command shape: {command_preview}"
        )

    def input_output_paths(self, workdir: Path) -> tuple[Path, Path]:
        return workdir / "input.json", workdir / "output.json"
