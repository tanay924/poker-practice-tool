import asyncio
import json
import sys
from pathlib import Path

import pytest

from app.solver.adapters import SharkWorkerSolverAdapter
from app.solver.config import SolverSettings
from app.solver.errors import SolverExecutionError, UnsupportedAnalysisError


def write_fake_worker(path: Path, body: str) -> list[str]:
    path.write_text(body, encoding="utf-8")
    return [sys.executable, str(path)]


def test_shark_worker_adapter_parses_analysis_response(tmp_path: Path) -> None:
    command = write_fake_worker(
        tmp_path / "fake_worker.py",
        """
import json
import sys

for line in sys.stdin:
    msg = json.loads(line)
    if msg["type"] == "version":
        print(json.dumps({"ok": True, "type": "version", "version": "v2.6.0", "commit": "c9dc07d"}), flush=True)
    elif msg["type"] == "health":
        print(json.dumps({"ok": True, "type": "health"}), flush=True)
    elif msg["type"] == "analyze_hand":
        print(json.dumps({
            "ok": True,
            "type": "analysis",
            "result": {
                "street_results": [{
                    "street": "flop",
                    "node": "SB flop decision",
                    "hero_hand": "AsKd",
                    "board": ["Ks", "7d", "2c"],
                    "solver_strategy": {"check": 0.25, "bet_50": 0.75},
                    "hero_action": "check",
                    "best_action": "bet_50",
                    "verdict": "mixed",
                    "confidence": "high"
                }],
                "summary": {"overall": "mixed", "largest_mistake": None}
            }
        }), flush=True)
    elif msg["type"] == "shutdown":
        print(json.dumps({"ok": True, "type": "shutdown"}), flush=True)
        break
""",
    )
    adapter = SharkWorkerSolverAdapter(
        SolverSettings(solver_name="shark", shark_worker_path="unused", shark_timeout_seconds=2),
        command=command,
    )

    async def run() -> dict:
        try:
            return await adapter.solve({"hand_id": 1, "ranges": {"range_hashes": {"sb_open": "a", "bb_call_vs_open": "b"}}})
        finally:
            await adapter.close()

    output = asyncio.run(run())

    assert output["metadata"]["solver"]["name"] == "shark"
    assert output["metadata"]["solver"]["version"] == "v2.6.0"
    assert output["metadata"]["solver"]["commit"] == "c9dc07d"
    assert output["metadata"]["range_hashes"] == {"sb_open": "a", "bb_call_vs_open": "b"}
    assert abs(sum(output["street_results"][0]["solver_strategy"].values()) - 1.0) < 0.000001


def test_shark_worker_adapter_maps_worker_unsupported(tmp_path: Path) -> None:
    command = write_fake_worker(
        tmp_path / "fake_worker.py",
        """
import json
import sys

for line in sys.stdin:
    msg = json.loads(line)
    if msg["type"] == "version":
        print(json.dumps({"ok": True, "type": "version", "version": "v2.6.0", "commit": "c9dc07d"}), flush=True)
    elif msg["type"] == "health":
        print(json.dumps({"ok": True, "type": "health"}), flush=True)
    elif msg["type"] == "analyze_hand":
        print(json.dumps({"ok": False, "type": "analysis", "status": "unsupported", "error": "line not supported"}), flush=True)
""",
    )
    adapter = SharkWorkerSolverAdapter(
        SolverSettings(solver_name="shark", shark_worker_path="unused", shark_timeout_seconds=2),
        command=command,
    )

    async def run() -> None:
        with pytest.raises(UnsupportedAnalysisError, match="line not supported"):
            await adapter.solve({"hand_id": 1})
        await adapter.close()

    asyncio.run(run())


def test_shark_worker_adapter_rejects_malformed_json(tmp_path: Path) -> None:
    command = write_fake_worker(
        tmp_path / "fake_worker.py",
        """
import sys

for line in sys.stdin:
    print("not-json", flush=True)
""",
    )
    adapter = SharkWorkerSolverAdapter(
        SolverSettings(solver_name="shark", shark_worker_path="unused", shark_timeout_seconds=2),
        command=command,
    )

    async def run() -> None:
        with pytest.raises(SolverExecutionError, match="malformed JSON"):
            await adapter.solve({"hand_id": 1})
        await adapter.close()

    asyncio.run(run())


def test_shark_worker_adapter_reports_timeout(tmp_path: Path) -> None:
    command = write_fake_worker(
        tmp_path / "fake_worker.py",
        """
import time
import sys

for line in sys.stdin:
    time.sleep(5)
""",
    )
    adapter = SharkWorkerSolverAdapter(
        SolverSettings(solver_name="shark", shark_worker_path="unused", shark_timeout_seconds=0.1),
        command=command,
    )

    async def run() -> None:
        with pytest.raises(SolverExecutionError, match="timed out"):
            await adapter.solve({"hand_id": 1})
        await adapter.close()

    asyncio.run(run())


def test_shark_worker_adapter_restarts_after_timeout(tmp_path: Path) -> None:
    marker = tmp_path / "worker_starts.txt"
    command = write_fake_worker(
        tmp_path / "fake_worker.py",
        f"""
import json
from pathlib import Path
import sys
import time

with Path({str(marker)!r}).open("a", encoding="utf-8") as marker_file:
    marker_file.write("started\\n")

for line in sys.stdin:
    msg = json.loads(line)
    if msg["type"] == "version":
        print(json.dumps({{"ok": True, "type": "version", "version": "v2.6.0", "commit": "c9dc07d"}}), flush=True)
    elif msg["type"] == "health":
        print(json.dumps({{"ok": True, "type": "health"}}), flush=True)
    elif msg["type"] == "analyze_hand":
        time.sleep(5)
""",
    )
    adapter = SharkWorkerSolverAdapter(
        SolverSettings(solver_name="shark", shark_worker_path="unused", shark_timeout_seconds=1),
        command=command,
    )

    async def run() -> None:
        with pytest.raises(SolverExecutionError, match="timed out"):
            await adapter.solve({"hand_id": 1})
        assert adapter._process is None
        with pytest.raises(SolverExecutionError, match="timed out"):
            await adapter.solve({"hand_id": 1})
        assert adapter._process is None
        assert marker.exists()
        assert len(marker.read_text(encoding="utf-8").splitlines()) >= 2
        await adapter.close()

    asyncio.run(run())


def test_shark_worker_adapter_reports_early_exit(tmp_path: Path) -> None:
    command = write_fake_worker(
        tmp_path / "fake_worker.py",
        """
import sys

sys.exit(3)
""",
    )
    adapter = SharkWorkerSolverAdapter(
        SolverSettings(solver_name="shark", shark_worker_path="unused", shark_timeout_seconds=2),
        command=command,
    )

    async def run() -> None:
        with pytest.raises(SolverExecutionError, match="exited|closed"):
            await adapter.solve({"hand_id": 1})
        await adapter.close()

    asyncio.run(run())


def test_shark_worker_adapter_explains_windows_reload_event_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    async def unsupported_subprocess(*args, **kwargs):
        raise NotImplementedError()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", unsupported_subprocess)
    adapter = SharkWorkerSolverAdapter(
        SolverSettings(solver_name="shark", shark_worker_path="unused", shark_timeout_seconds=2),
        command=["fake-shark-worker"],
    )

    async def run() -> None:
        with pytest.raises(SolverExecutionError, match="without --reload"):
            await adapter.solve({"hand_id": 1})

    asyncio.run(run())
