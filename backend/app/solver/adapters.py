from __future__ import annotations

import asyncio
import copy
import hashlib
import json
from pathlib import Path
import time
from typing import Any, Protocol

from app.solver.config import SolverSettings
from app.solver.errors import SolverExecutionError, UnsupportedAnalysisError

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
    solver_name: str

    async def solve(self, solver_input: SolverInput) -> SolverOutput:
        pass

    async def close(self) -> None:
        pass


class MockSolverAdapter:
    solver_name = "mock"

    def __init__(self, delay_seconds: float = 1.0) -> None:
        self.delay_seconds = delay_seconds

    async def solve(self, solver_input: SolverInput) -> SolverOutput:
        started = time.perf_counter()
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
            "metadata": {
                "solver": {"name": "mock", "version": "deterministic-local"},
                "duration_seconds": round(time.perf_counter() - started, 6),
                "cache": {"hit": False},
            },
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

    async def close(self) -> None:
        return None


class SharkWorkerSolverAdapter:
    solver_name = "shark"

    def __init__(self, settings: SolverSettings, command: list[str] | None = None) -> None:
        self.settings = settings
        self.command = command
        self._process: asyncio.subprocess.Process | None = None
        self._lock = asyncio.Lock()
        self._version_info: dict[str, Any] | None = None

    def solver_metadata(self) -> dict[str, str]:
        return {
            "name": "shark",
            "version": self.settings.shark_version,
            "commit": self.settings.shark_commit,
        }

    def cache_settings(self) -> dict[str, int | float | bool]:
        return self.settings.shark_config_json()

    async def solve(self, solver_input: SolverInput) -> SolverOutput:
        started = time.perf_counter()
        version_info = await self._ensure_compatible_version()
        await self._request({"type": "health"})
        response = await self._request(
            {
                "type": "analyze_hand",
                "solver_input": solver_input,
                "settings": self.cache_settings(),
            }
        )
        if not response.get("ok", False):
            message = str(response.get("error") or "Shark worker rejected the analysis request")
            if response.get("status") == "unsupported":
                raise UnsupportedAnalysisError(message)
            raise SolverExecutionError(message)

        result = response.get("result")
        if not isinstance(result, dict):
            raise SolverExecutionError("Shark worker response did not include a result object")

        output = copy.deepcopy(result)
        self._validate_strategy_frequencies(output)
        metadata = output.setdefault("metadata", {})
        metadata["solver"] = {
            "name": "shark",
            "version": str(version_info.get("version", self.settings.shark_version)),
            "commit": str(version_info.get("commit", self.settings.shark_commit)),
        }
        metadata["config"] = self.cache_settings()
        metadata["range_hashes"] = solver_input.get("ranges", {}).get("range_hashes", {})
        metadata["duration_seconds"] = round(time.perf_counter() - started, 6)
        metadata["cache"] = {"hit": False}
        return output

    async def close(self) -> None:
        process = self._process
        if process is None:
            return

        if process.returncode is None:
            try:
                await self._request({"type": "shutdown"})
            except Exception:
                process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
        self._process = None

    def input_output_paths(self, workdir: Path) -> tuple[Path, Path]:
        return workdir / "input.json", workdir / "output.json"

    async def _ensure_compatible_version(self) -> dict[str, Any]:
        if self._version_info is not None:
            return self._version_info

        response = await self._request({"type": "version"})
        if not response.get("ok", False):
            raise SolverExecutionError(str(response.get("error") or "Shark worker version request failed"))

        version = str(response.get("version", ""))
        if version != self.settings.shark_version:
            raise UnsupportedAnalysisError(
                f"Configured Shark worker reported {version or 'unknown version'}, "
                f"expected {self.settings.shark_version}."
            )
        self._version_info = response
        return response

    async def _request(self, message: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            process = await self._ensure_process()
            if process.stdin is None or process.stdout is None:
                raise SolverExecutionError("Shark worker was started without stdin/stdout pipes")

            line = json.dumps(message, sort_keys=True, separators=(",", ":")) + "\n"
            process.stdin.write(line.encode("utf-8"))
            await process.stdin.drain()

            try:
                raw = await asyncio.wait_for(process.stdout.readline(), timeout=self.settings.shark_timeout_seconds)
            except asyncio.TimeoutError as exc:
                raise SolverExecutionError(
                    f"Shark worker timed out after {self.settings.shark_timeout_seconds:g}s"
                ) from exc

            if not raw:
                stderr = await self._read_stderr_tail(process)
                raise SolverExecutionError(f"Shark worker exited before responding. {stderr}".strip())

            text = raw.decode("utf-8", errors="replace").strip()
            try:
                response = json.loads(text)
            except json.JSONDecodeError as exc:
                raise SolverExecutionError(f"Shark worker returned malformed JSON: {text}") from exc
            if not isinstance(response, dict):
                raise SolverExecutionError("Shark worker returned a non-object JSON response")
            return response

    async def _ensure_process(self) -> asyncio.subprocess.Process:
        if self._process is not None and self._process.returncode is None:
            return self._process

        command = self._worker_command()
        try:
            self._process = await asyncio.create_subprocess_exec(
                *command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except NotImplementedError as exc:
            raise SolverExecutionError(
                "This Windows event loop cannot start the Shark subprocess. "
                "Run the backend without --reload when POKER_TRAINER_SOLVER=shark."
            ) from exc
        return self._process

    def _worker_command(self) -> list[str]:
        if self.command is not None:
            return self.command
        if self.settings.shark_worker_path is None:
            raise UnsupportedAnalysisError(
                "POKER_TRAINER_SHARK_PATH must point to a built shark_worker.exe when POKER_TRAINER_SOLVER=shark."
            )
        worker_path = Path(self.settings.shark_worker_path)
        if not worker_path.exists():
            raise UnsupportedAnalysisError(f"Configured Shark worker does not exist: {worker_path}")
        return [str(worker_path)]

    async def _read_stderr_tail(self, process: asyncio.subprocess.Process) -> str:
        if process.stderr is None:
            return ""
        try:
            raw = await asyncio.wait_for(process.stderr.read(4000), timeout=0.2)
        except asyncio.TimeoutError:
            return ""
        text = raw.decode("utf-8", errors="replace").strip()
        return f"stderr: {text}" if text else ""

    def _validate_strategy_frequencies(self, output: SolverOutput) -> None:
        for result in output.get("street_results", []):
            strategy = result.get("solver_strategy", {})
            if not isinstance(strategy, dict) or not strategy:
                raise SolverExecutionError("Shark worker returned a decision without a solver_strategy")
            total = sum(float(value) for value in strategy.values())
            if abs(total - 1.0) > 0.000001:
                raise SolverExecutionError(
                    f"Shark worker strategy frequencies must sum to 1.0, got {total:.6f}"
                )


class SharkCliSolverAdapter(SharkWorkerSolverAdapter):
    """Backward-compatible name for the old placeholder adapter."""
