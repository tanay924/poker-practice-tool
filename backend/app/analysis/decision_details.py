from __future__ import annotations

import copy
from typing import Any

from app.poker.equity import exact_holdem_equity

POSTFLOP_STREETS = {"flop", "turn", "river"}
BOARD_CARDS_BY_STREET = {"flop": 3, "turn": 4, "river": 5}


def add_decision_details(solver_output: dict[str, Any], solver_input: dict[str, Any]) -> dict[str, Any]:
    output = copy.deepcopy(solver_output)
    street_results = output.get("street_results", [])
    if not isinstance(street_results, list) or not street_results:
        return output

    action_history = solver_input.get("action_history", [])
    hero_position = str(solver_input.get("hero_position", ""))
    hero_actions = _hero_postflop_actions(action_history, hero_position)
    used_action_indices: set[int] = set()

    for result in street_results:
        if not isinstance(result, dict):
            continue

        street = str(result.get("street", ""))
        action_index, action_entry = _next_action_for_result(hero_actions, used_action_indices, street)
        if action_index is not None:
            used_action_indices.add(action_index)

        board = _board_for_street(solver_input.get("board", []), street)
        result["details"] = {
            "pot_odds": _pot_odds_for_action(action_history, action_index, action_entry),
            "equity": _equity_for_result(solver_input, board),
        }

    return output


def _hero_postflop_actions(
    action_history: list[dict[str, Any]],
    hero_position: str,
) -> list[tuple[int, dict[str, Any]]]:
    actions: list[tuple[int, dict[str, Any]]] = []
    for index, entry in enumerate(action_history):
        actor = str(entry.get("actor", ""))
        street = str(entry.get("street", ""))
        if street in POSTFLOP_STREETS and actor in {hero_position, "hero"}:
            actions.append((index, entry))
    return actions


def _next_action_for_result(
    hero_actions: list[tuple[int, dict[str, Any]]],
    used_action_indices: set[int],
    street: str,
) -> tuple[int | None, dict[str, Any] | None]:
    for index, entry in hero_actions:
        if index in used_action_indices:
            continue
        if entry.get("street") == street:
            return index, entry
    return None, None


def _pot_odds_for_action(
    action_history: list[dict[str, Any]],
    action_index: int | None,
    action_entry: dict[str, Any] | None,
) -> dict[str, Any]:
    if action_index is None or action_entry is None:
        return _unavailable_pot_odds("no_matching_action")

    action = str(action_entry.get("action", "")).lower()
    if action == "call":
        call_amount = _numeric(action_entry.get("amount_bb"))
        pot_if_call = _numeric(action_entry.get("pot_after"))
        if call_amount is None or pot_if_call is None or call_amount <= 0 or pot_if_call <= 0:
            return _unavailable_pot_odds("invalid_call")
        return _available_pot_odds(call_amount, pot_if_call - call_amount, pot_if_call)

    if action == "fold":
        previous_bet = _previous_opponent_bet(action_history, action_index, action_entry)
        if previous_bet is None:
            return _unavailable_pot_odds("not_facing_bet")
        call_amount = _numeric(previous_bet.get("amount_bb"))
        pot_before_call = _numeric(action_entry.get("pot_after"))
        if call_amount is None or pot_before_call is None or call_amount <= 0 or pot_before_call <= 0:
            return _unavailable_pot_odds("invalid_fold_spot")
        return _available_pot_odds(call_amount, pot_before_call, pot_before_call + call_amount)

    return _unavailable_pot_odds("not_facing_call")


def _previous_opponent_bet(
    action_history: list[dict[str, Any]],
    action_index: int,
    action_entry: dict[str, Any],
) -> dict[str, Any] | None:
    street = action_entry.get("street")
    actor = action_entry.get("actor")
    for previous in reversed(action_history[:action_index]):
        if previous.get("street") != street:
            continue
        if previous.get("actor") == actor:
            continue
        if str(previous.get("action", "")).lower() in {"bet", "raise", "raise_to"}:
            return previous
    return None


def _available_pot_odds(call_amount: float, pot_before_call: float, pot_if_call: float) -> dict[str, Any]:
    return {
        "available": True,
        "call_amount_bb": call_amount,
        "pot_before_call_bb": pot_before_call,
        "pot_if_call_bb": pot_if_call,
        "required_equity": call_amount / pot_if_call,
    }


def _unavailable_pot_odds(reason: str) -> dict[str, Any]:
    return {
        "available": False,
        "reason": reason,
    }


def _equity_for_result(solver_input: dict[str, Any], board: list[str]) -> dict[str, Any]:
    try:
        return exact_holdem_equity(
            hero_cards=_split_card_string(str(solver_input.get("hero_cards", ""))),
            villain_cards=_split_card_string(str(solver_input.get("villain_cards", ""))),
            board=board,
        )
    except (TypeError, ValueError) as exc:
        return {
            "available": False,
            "source": "invalid_cards",
            "hero": None,
            "villain": None,
            "note": str(exc),
        }


def _board_for_street(board: Any, street: str) -> list[str]:
    if not isinstance(board, list):
        return []
    card_count = BOARD_CARDS_BY_STREET.get(street, len(board))
    return [str(card) for card in board[:card_count]]


def _split_card_string(cards: str) -> list[str]:
    trimmed = cards.strip()
    if len(trimmed) % 2 != 0:
        raise ValueError(f"Invalid card string: {cards}")
    return [trimmed[index : index + 2] for index in range(0, len(trimmed), 2)]


def _numeric(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
