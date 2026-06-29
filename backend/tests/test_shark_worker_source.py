from pathlib import Path


def test_shark_worker_clears_raise_sizes_when_postflop_raises_are_disabled() -> None:
    source = Path(__file__).parents[2] / "tools" / "shark_worker" / "shark_worker.cpp"
    text = source.read_text(encoding="utf-8")

    assert 'settings.value("postflop_raises_enabled", false)' in text
    assert "tree_settings.bet_sizing.flop.raise_sizes.clear();" in text
    assert "tree_settings.bet_sizing.turn.raise_sizes.clear();" in text
    assert "tree_settings.bet_sizing.river.raise_sizes.clear();" in text


def test_shark_worker_accepts_generic_branch_ranges_and_flop_cache_key() -> None:
    source = Path(__file__).parents[2] / "tools" / "shark_worker" / "shark_worker.cpp"
    text = source.read_text(encoding="utf-8")

    assert 'ranges.contains("ip")' in text
    assert 'ranges.contains("oop")' in text
    assert '"postflop_branch_id"' in text
    assert '"flop_board"' in text
    assert '"starting_pot_bb"' in text
    assert '"effective_stack_bb"' in text


def test_shark_worker_resolves_isomorphic_chance_cards() -> None:
    source = Path(__file__).parents[2] / "tools" / "shark_worker" / "shark_worker.cpp"
    text = source.read_text(encoding="utf-8")

    assert "chance_child_for_card" in text
    assert "isomorphism_card" in text
    assert "isomorphism_ref" in text
    assert "get_card_at_index" in text


def test_shark_worker_supports_one_bb_minimum_bets() -> None:
    project_root = Path(__file__).parents[2]
    worker_source = project_root / "tools" / "shark_worker" / "shark_worker.cpp"
    setup_script = project_root / "tools" / "setup_shark_worker.ps1"

    assert 'settings.value("minimum_bet_bb", 1)' in worker_source.read_text(encoding="utf-8")
    assert "action.amount >= minimum_raise_size" in setup_script.read_text(encoding="utf-8")


def test_shark_worker_scores_configured_hero_position() -> None:
    source = Path(__file__).parents[2] / "tools" / "shark_worker" / "shark_worker.cpp"
    text = source.read_text(encoding="utf-8")

    assert 'solver_input.value("hero_position", "SB")' in text
    assert 'hero_position == "BB" ? 1 : 2' in text
    assert 'actor == hero_position || actor == "hero"' in text
    assert "action_node->get_player() == hero_player" in text
