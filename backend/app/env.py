from __future__ import annotations

import os
from pathlib import Path


def load_local_env(env_dir: Path | None = None) -> None:
    base_dir = env_dir or Path(__file__).resolve().parents[1]
    protected_keys = set(os.environ)
    for filename in (".env", ".env.local"):
        path = base_dir / filename
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            parsed = _parse_env_line(line)
            if parsed is None:
                continue
            key, value = parsed
            if key in protected_keys:
                continue
            os.environ[key] = value


def _parse_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    if stripped.startswith("export "):
        stripped = stripped.removeprefix("export ").strip()
    key, value = stripped.split("=", 1)
    key = key.strip()
    if not key:
        return None
    return key, _strip_quotes(value.strip())


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value
