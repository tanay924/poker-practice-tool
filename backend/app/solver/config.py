from __future__ import annotations

from dataclasses import dataclass
import os


DEFAULT_SHARK_TAG = "v2.6.0"
DEFAULT_SHARK_COMMIT = "c9dc07d"


@dataclass(frozen=True)
class SolverSettings:
    solver_name: str = "shark"
    shark_worker_path: str | None = None
    shark_version: str = DEFAULT_SHARK_TAG
    shark_commit: str = DEFAULT_SHARK_COMMIT
    shark_iterations: int = 100
    shark_min_exploitability_pct: float = 0.1
    shark_all_in_threshold: float = 0.67
    shark_thread_count: int | None = None
    shark_force_donk_check: bool = True
    shark_postflop_raises_enabled: bool = False
    shark_minimum_bet_bb: int = 1
    shark_timeout_seconds: float = 300.0

    @property
    def effective_thread_count(self) -> int:
        if self.shark_thread_count is not None and self.shark_thread_count > 0:
            return self.shark_thread_count
        cpu_count = os.cpu_count() or 2
        return max(cpu_count - 1, 1)

    def shark_config_json(self) -> dict[str, int | float | bool]:
        return {
            "iterations": self.shark_iterations,
            "min_exploitability_pct": self.shark_min_exploitability_pct,
            "all_in_threshold": self.shark_all_in_threshold,
            "thread_count": self.effective_thread_count,
            "force_donk_check": self.shark_force_donk_check,
            "postflop_raises_enabled": self.shark_postflop_raises_enabled,
            "minimum_bet_bb": self.shark_minimum_bet_bb,
        }


def settings_from_env() -> SolverSettings:
    return SolverSettings(
        solver_name="shark",
        shark_worker_path=_empty_to_none(os.getenv("POKER_TRAINER_SHARK_PATH")),
        shark_version=os.getenv("POKER_TRAINER_SHARK_VERSION", DEFAULT_SHARK_TAG).strip(),
        shark_commit=os.getenv("POKER_TRAINER_SHARK_COMMIT", DEFAULT_SHARK_COMMIT).strip(),
        shark_iterations=_int_env("POKER_TRAINER_SHARK_ITERATIONS", 100),
        shark_min_exploitability_pct=_float_env("POKER_TRAINER_SHARK_MIN_EXPLOITABILITY_PCT", 0.1),
        shark_all_in_threshold=_float_env("POKER_TRAINER_SHARK_ALL_IN_THRESHOLD", 0.67),
        shark_thread_count=_optional_int_env("POKER_TRAINER_SHARK_THREAD_COUNT"),
        shark_force_donk_check=_bool_env("POKER_TRAINER_SHARK_FORCE_DONK_CHECK", True),
        shark_postflop_raises_enabled=_bool_env("POKER_TRAINER_SHARK_POSTFLOP_RAISES_ENABLED", False),
        shark_minimum_bet_bb=_int_env("POKER_TRAINER_SHARK_MINIMUM_BET_BB", 1),
        shark_timeout_seconds=_float_env("POKER_TRAINER_SHARK_TIMEOUT_SECONDS", 300.0),
    )


def _empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return int(value)


def _optional_int_env(name: str) -> int | None:
    value = os.getenv(name)
    if value is None or not value.strip():
        return None
    return int(value)


def _float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return float(value)


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
