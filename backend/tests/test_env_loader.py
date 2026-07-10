from __future__ import annotations

import os

from app.env import load_local_env


def test_load_local_env_preserves_shell_env_and_lets_local_override_base(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("POKER_EXISTING", "from-shell")
    monkeypatch.delenv("POKER_FROM_FILE", raising=False)
    monkeypatch.delenv("POKER_QUOTED", raising=False)
    (tmp_path / ".env").write_text(
        "POKER_EXISTING=from-file\nPOKER_FROM_FILE=from-base\n",
        encoding="utf-8",
    )
    (tmp_path / ".env.local").write_text(
        'POKER_FROM_FILE=from-local\nPOKER_QUOTED="hello world"\n',
        encoding="utf-8",
    )

    load_local_env(tmp_path)

    assert os.getenv("POKER_EXISTING") == "from-shell"
    assert os.getenv("POKER_FROM_FILE") == "from-local"
    assert os.getenv("POKER_QUOTED") == "hello world"
