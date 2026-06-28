from pathlib import Path


def test_shark_worker_clears_raise_sizes_when_postflop_raises_are_disabled() -> None:
    source = Path(__file__).parents[2] / "tools" / "shark_worker" / "shark_worker.cpp"
    text = source.read_text(encoding="utf-8")

    assert 'settings.value("postflop_raises_enabled", false)' in text
    assert "tree_settings.bet_sizing.flop.raise_sizes.clear();" in text
    assert "tree_settings.bet_sizing.turn.raise_sizes.clear();" in text
    assert "tree_settings.bet_sizing.river.raise_sizes.clear();" in text
