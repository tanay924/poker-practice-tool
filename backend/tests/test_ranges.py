import pytest
from pydantic import ValidationError

from app.ranges.parser import parse_preflop_range


def test_range_import_accepts_valid_json() -> None:
    parsed = parse_preflop_range(
        {
            "name": "HU 100bb SB open",
            "spot": "HU_SB_OPEN_100BB",
            "stack_bb": 100,
            "actions": {
                "AA": {"raise": 1.0},
                "KQo": {"raise": 0.75, "fold": 0.25},
                "72o": {"fold": 1.0},
            },
        }
    )

    assert parsed.name == "HU 100bb SB open"
    assert parsed.actions["KQo"]["raise"] == 0.75


def test_range_import_rejects_action_frequencies_that_do_not_sum_to_one() -> None:
    with pytest.raises(ValidationError):
        parse_preflop_range(
            {
                "name": "Bad range",
                "spot": "HU_SB_OPEN_100BB",
                "stack_bb": 100,
                "actions": {"KQo": {"raise": 0.4, "fold": 0.4}},
            }
        )
