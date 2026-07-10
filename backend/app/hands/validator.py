from __future__ import annotations

from math import isfinite
import re
from typing import Any


CARD_PATTERN = re.compile(r"^[AKQJT98765432][shdc]$")
VALID_POSITIONS = {"SB", "BB"}
VALID_STREETS = {"preflop": 0, "flop": 1, "turn": 2, "river": 3}
VALID_ACTORS = {"SB", "BB", "hero", "villain"}
VALID_RESULT_WINNERS = {"hero", "villain", "split", "showdown"}
MAX_ACTIONS = 80
MAX_NODE_LENGTH = 240
MAX_ACTION_AMOUNT = 200.0
MAX_POT = 200.0

# These are the fields emitted by the current browser engine. Keeping this
# allow-list explicit prevents arbitrary nested JSON from entering the hand
# history while retaining the metadata needed by preflop analysis.
ACTION_FIELDS = {
    "street",
    "actor",
    "action",
    "amount_bb",
    "target_amount_bb",
    "pot_after",
    "node",
    "spot_id",
    "hand_key",
    "frequency",
    "automatic",
}


class HandValidationError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__(" ".join(errors))


def validate_hand_payload(payload: dict[str, Any]) -> None:
    errors: list[str] = []

    hero_position = payload.get("hero_position")
    villain_position = payload.get("villain_position")
    if hero_position not in VALID_POSITIONS:
        errors.append("hero_position must be SB or BB")
    if villain_position not in VALID_POSITIONS:
        errors.append("villain_position must be SB or BB")
    if hero_position in VALID_POSITIONS and villain_position in VALID_POSITIONS:
        if villain_position == hero_position:
            errors.append("hero_position and villain_position must be different")

    hero_cards = _cards_from_string(payload.get("hero_cards"), "hero_cards", errors)
    villain_cards = _cards_from_string(payload.get("villain_cards"), "villain_cards", errors)
    board = payload.get("board_json")
    board_cards = _validate_board(board, errors)

    all_cards = [*hero_cards, *villain_cards, *board_cards]
    if len(all_cards) != len(set(all_cards)):
        errors.append("hero cards, villain cards, and board must not overlap")

    stack_bb = payload.get("stack_bb")
    if isinstance(stack_bb, bool) or not isinstance(stack_bb, int) or stack_bb != 100:
        errors.append("stack_bb must be the supported 100bb stack")

    pot = payload.get("pot")
    if not _finite_number(pot) or float(pot) < 0 or float(pot) > MAX_POT:
        errors.append("pot must be a finite value between 0 and 200bb")

    action_history = payload.get("action_history_json")
    if not isinstance(action_history, list) or not action_history:
        errors.append("action_history_json must contain at least one action")
        action_history = []
    elif len(action_history) > MAX_ACTIONS:
        errors.append(f"action_history_json cannot contain more than {MAX_ACTIONS} actions")

    last_street = -1
    last_pot = 0.0
    terminal_seen = False
    highest_street = -1
    for index, entry in enumerate(action_history):
        prefix = f"action_history_json[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{prefix} must be an object")
            continue

        unknown_fields = set(entry) - ACTION_FIELDS
        if unknown_fields:
            errors.append(f"{prefix} contains unsupported fields: {', '.join(sorted(unknown_fields))}")

        street = entry.get("street")
        street_order = VALID_STREETS.get(street)
        if street_order is None:
            errors.append(f"{prefix}.street is invalid")
        else:
            highest_street = max(highest_street, street_order)
            if street_order < last_street:
                errors.append(f"{prefix}.street moves backwards")
            last_street = max(last_street, street_order)

        actor = entry.get("actor")
        if actor not in VALID_ACTORS:
            errors.append(f"{prefix}.actor is invalid")

        action = entry.get("action")
        if not isinstance(action, str) or not action.strip():
            errors.append(f"{prefix}.action must be a non-empty string")
        elif not _action_is_supported(action, street):
            errors.append(f"{prefix}.action is not supported for {street}")

        amount = entry.get("amount_bb")
        if not _finite_number(amount) or float(amount) < 0 or float(amount) > MAX_ACTION_AMOUNT:
            errors.append(f"{prefix}.amount_bb must be a finite value between 0 and 200bb")

        target_amount = entry.get("target_amount_bb")
        if target_amount is not None and (
            not _finite_number(target_amount) or float(target_amount) <= 0 or float(target_amount) > MAX_ACTION_AMOUNT
        ):
            errors.append(f"{prefix}.target_amount_bb must be a finite value between 0 and 200bb")

        pot_after = entry.get("pot_after")
        if not _finite_number(pot_after) or float(pot_after) < 0 or float(pot_after) > MAX_POT:
            errors.append(f"{prefix}.pot_after must be a finite value between 0 and 200bb")
        elif float(pot_after) + 0.1 < last_pot:
            errors.append(f"{prefix}.pot_after cannot decrease")
        else:
            last_pot = float(pot_after)

        node = entry.get("node")
        if node is not None and (not isinstance(node, str) or len(node) > MAX_NODE_LENGTH):
            errors.append(f"{prefix}.node is invalid or too long")

        for field in ("spot_id", "hand_key"):
            value = entry.get(field)
            if value is not None and (not isinstance(value, str) or len(value) > 120):
                errors.append(f"{prefix}.{field} is invalid or too long")

        frequency = entry.get("frequency")
        if frequency is not None and (not _finite_number(frequency) or not 0 <= float(frequency) <= 1):
            errors.append(f"{prefix}.frequency must be between 0 and 1")

        automatic = entry.get("automatic")
        if automatic is not None and not isinstance(automatic, bool):
            errors.append(f"{prefix}.automatic must be a boolean")

        if isinstance(action, str) and action.lower() in {"fold", "allin"}:
            terminal_seen = True
        elif terminal_seen:
            errors.append(f"{prefix} appears after a terminal action")

    if highest_street >= 1 and len(board_cards) < 3:
        errors.append("a flop action requires at least three board cards")
    if highest_street >= 2 and len(board_cards) < 4:
        errors.append("a turn action requires at least four board cards")
    if highest_street >= 3 and len(board_cards) < 5:
        errors.append("a river action requires five board cards")

    if _finite_number(pot) and action_history and _finite_number(action_history[-1].get("pot_after")):
        if abs(float(pot) - float(action_history[-1]["pot_after"])) > 0.11:
            errors.append("pot must match the final action pot_after value")

    result = payload.get("result_json")
    if not isinstance(result, dict):
        errors.append("result_json must be an object")
    else:
        winner = result.get("winner")
        reason = result.get("reason")
        if winner not in VALID_RESULT_WINNERS:
            errors.append("result_json.winner is invalid")
        if not isinstance(reason, str) or not reason or len(reason) > 120:
            errors.append("result_json.reason is invalid")
        winning_hand = result.get("winning_hand")
        if winning_hand is not None and (not isinstance(winning_hand, str) or len(winning_hand) > 120):
            errors.append("result_json.winning_hand is invalid or too long")

        fold_entries = [entry for entry in action_history if isinstance(entry, dict) and entry.get("action") == "fold"]
        if fold_entries and winner in {"hero", "villain"}:
            folded_actor = fold_entries[-1].get("actor")
            expected_winner = "villain" if folded_actor == hero_position or folded_actor == "hero" else "hero"
            if winner != expected_winner:
                errors.append("result_json.winner does not match the folding actor")
        if reason == "river_completed" and highest_street < 3:
            errors.append("river_completed requires a river action")

    if errors:
        raise HandValidationError(errors)


def _cards_from_string(value: Any, field: str, errors: list[str]) -> list[str]:
    if not isinstance(value, str) or len(value) != 4:
        errors.append(f"{field} must contain exactly two cards")
        return []
    cards = [value[:2], value[2:]]
    normalized: list[str] = []
    for card in cards:
        candidate = f"{card[0].upper()}{card[1].lower()}"
        if not CARD_PATTERN.fullmatch(candidate):
            errors.append(f"{field} contains an invalid card")
        else:
            normalized.append(candidate)
    if len(normalized) == 2 and normalized[0] == normalized[1]:
        errors.append(f"{field} cannot contain duplicate cards")
    return normalized


def _validate_board(value: Any, errors: list[str]) -> list[str]:
    if not isinstance(value, list) or not 3 <= len(value) <= 5:
        errors.append("board_json must contain between three and five cards")
        return []
    cards: list[str] = []
    for card in value:
        if not isinstance(card, str) or len(card) != 2:
            errors.append("board_json contains an invalid card")
            continue
        candidate = f"{card[0].upper()}{card[1].lower()}"
        if not CARD_PATTERN.fullmatch(candidate):
            errors.append("board_json contains an invalid card")
        else:
            cards.append(candidate)
    if len(cards) != len(set(cards)):
        errors.append("board_json cannot contain duplicate cards")
    return cards


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(float(value))


def _action_is_supported(action: str, street: str | None) -> bool:
    normalized = action.strip().lower()
    if street == "preflop":
        return normalized in {"fold", "limp", "check", "call", "raise", "allin"} or normalized.startswith(("open_", "raise_"))
    return normalized in {"check", "bet", "call", "fold", "raise", "raise_to", "allin"} or normalized.startswith("bet_")
