import pytest

from app.hands.validator import HandValidationError, validate_hand_payload


def valid_payload() -> dict:
    return {
        "hero_position": "SB",
        "villain_position": "BB",
        "hero_cards": "AsKd",
        "villain_cards": "QcJh",
        "board_json": ["Ks", "7d", "2c", "4h", "9s"],
        "stack_bb": 100,
        "pot": 7.5,
        "action_history_json": [
            {"street": "preflop", "actor": "SB", "action": "open_2_5", "amount_bb": 2.5, "pot_after": 2.5},
            {"street": "preflop", "actor": "BB", "action": "call", "amount_bb": 2.5, "pot_after": 5},
            {"street": "flop", "actor": "SB", "action": "bet_50", "amount_bb": 2.5, "pot_after": 7.5},
        ],
        "result_json": {"winner": "hero", "reason": "villain_folded"},
    }


def test_valid_engine_payload_passes() -> None:
    validate_hand_payload(valid_payload())


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("hero_cards", "AsAs"),
        ("villain_cards", "AsKd"),
        ("board_json", ["Ks", "7d", "2c", "2c", "9s"]),
        ("pot", float("nan")),
    ],
)
def test_invalid_cards_and_numbers_are_rejected(field: str, value: object) -> None:
    payload = valid_payload()
    payload[field] = value
    with pytest.raises(HandValidationError):
        validate_hand_payload(payload)


def test_unknown_action_history_fields_are_rejected() -> None:
    payload = valid_payload()
    payload["action_history_json"][0]["arbitrary"] = "payload"
    with pytest.raises(HandValidationError, match="unsupported fields"):
        validate_hand_payload(payload)


def test_pot_must_match_final_action() -> None:
    payload = valid_payload()
    payload["pot"] = 8
    with pytest.raises(HandValidationError, match="final action"):
        validate_hand_payload(payload)


def test_terminal_action_must_be_last() -> None:
    payload = valid_payload()
    payload["action_history_json"][2]["action"] = "fold"
    payload["action_history_json"].append({"street": "flop", "actor": "BB", "action": "check", "amount_bb": 0, "pot_after": 7.5})
    with pytest.raises(HandValidationError, match="after a terminal"):
        validate_hand_payload(payload)
