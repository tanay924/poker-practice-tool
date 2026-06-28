from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any


PREFLOP_SPOTS = {
    "sb_open": "HU_SB_OPEN_2_5BB_OR_LIMP_100BB",
    "bb_vs_sb_open": "HU_SRP_BB_VS_SB_OPEN_100BB",
    "sb_vs_bb_reraise": "HU_SB_VS_BB_RERAISE_11_5BB_100BB",
    "sb_limp_vs_bb_raise": "HU_LIMP_SB_VS_BB_RAISE_5BB_100BB",
    "bb_vs_sb_limp": "HU_LIMP_BB_VS_SB_100BB",
}

LEGAL_ACTIONS_BY_SPOT = {
    PREFLOP_SPOTS["sb_open"]: ["fold", "limp", "raise"],
    PREFLOP_SPOTS["bb_vs_sb_open"]: ["fold", "call", "raise", "allin"],
    PREFLOP_SPOTS["sb_vs_bb_reraise"]: ["fold", "call", "raise"],
    PREFLOP_SPOTS["sb_limp_vs_bb_raise"]: ["fold", "call", "raise"],
    PREFLOP_SPOTS["bb_vs_sb_limp"]: ["check", "raise"],
}

RANGE_FILES = {
    PREFLOP_SPOTS["sb_open"]: "hu_100bb_sb_open_2_5bb_revised.json",
    PREFLOP_SPOTS["bb_vs_sb_open"]: "hu_100bb_bb_vs_sb_2_5bb_open_revised.json",
    PREFLOP_SPOTS["sb_vs_bb_reraise"]: "hu_100bb_sb_vs_bb_11_5bb_reraise.json",
    PREFLOP_SPOTS["sb_limp_vs_bb_raise"]: "hu_100bb_sb_limp_vs_bb_raise_5bb_revised.json",
    PREFLOP_SPOTS["bb_vs_sb_limp"]: "hu_100bb_bb_vs_sb_limp_raise_5bb_revised.json",
}


def analyze_preflop_actions(action_history: list[dict[str, Any]]) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    for entry in action_history:
        if entry.get("street") != "preflop" or entry.get("automatic") is True:
            continue
        spot_id = entry.get("spot_id")
        hand_key = entry.get("hand_key")
        if not isinstance(spot_id, str) or not isinstance(hand_key, str):
            continue

        options = options_for_hand(spot_id, hand_key)
        action = str(entry.get("action", ""))
        selected_frequency = float(options.get(action, 0.0))
        results.append(
            {
                "street": "preflop",
                "actor": entry.get("actor", "SB"),
                "node": entry.get("node") or spot_name(spot_id),
                "spot_id": spot_id,
                "spot_name": spot_name(spot_id),
                "hand_key": hand_key,
                "hero_action": action,
                "selected_frequency": selected_frequency,
                "options": options,
                "correct": selected_frequency > 0.0,
            }
        )

    blocks_postflop = any(not result["correct"] for result in results)
    return {
        "results": results,
        "summary": {
            "overall": "blocked" if blocks_postflop else "valid" if results else "not_scored",
            "blocks_postflop": blocks_postflop,
            "decision_count": len(results),
            "correct_count": sum(1 for result in results if result["correct"]),
        },
    }


def derive_postflop_branch(action_history: list[dict[str, Any]]) -> dict[str, Any] | None:
    preflop = [entry for entry in action_history if entry.get("street") == "preflop"]
    sb_open = _first(preflop, PREFLOP_SPOTS["sb_open"], "SB")
    if sb_open is None:
        return None

    sb_action = sb_open.get("action")
    if sb_action == "raise":
        bb_response = _first(preflop, PREFLOP_SPOTS["bb_vs_sb_open"], "BB")
        if bb_response is None:
            return None
        if bb_response.get("action") == "call":
            return _branch(
                "srp_open_call",
                starting_pot_bb=5,
                effective_stack_bb=97.5,
                ip_parts=[(PREFLOP_SPOTS["sb_open"], "raise")],
                oop_parts=[(PREFLOP_SPOTS["bb_vs_sb_open"], "call")],
            )
        if bb_response.get("action") == "raise":
            sb_response = _first(preflop, PREFLOP_SPOTS["sb_vs_bb_reraise"], "SB")
            if sb_response and sb_response.get("action") == "call":
                return _branch(
                    "three_bet_call",
                    starting_pot_bb=23,
                    effective_stack_bb=88.5,
                    ip_parts=[(PREFLOP_SPOTS["sb_open"], "raise"), (PREFLOP_SPOTS["sb_vs_bb_reraise"], "call")],
                    oop_parts=[(PREFLOP_SPOTS["bb_vs_sb_open"], "raise")],
                )
        return None

    if sb_action == "limp":
        bb_response = _first(preflop, PREFLOP_SPOTS["bb_vs_sb_limp"], "BB")
        if bb_response is None:
            return None
        if bb_response.get("action") == "check":
            return _branch(
                "limp_check",
                starting_pot_bb=2,
                effective_stack_bb=99,
                ip_parts=[(PREFLOP_SPOTS["sb_open"], "limp")],
                oop_parts=[(PREFLOP_SPOTS["bb_vs_sb_limp"], "check")],
            )
        if bb_response.get("action") == "raise":
            sb_response = _first(preflop, PREFLOP_SPOTS["sb_limp_vs_bb_raise"], "SB")
            if sb_response and sb_response.get("action") == "call":
                return _branch(
                    "limp_raise_call",
                    starting_pot_bb=10,
                    effective_stack_bb=95,
                    ip_parts=[(PREFLOP_SPOTS["sb_open"], "limp"), (PREFLOP_SPOTS["sb_limp_vs_bb_raise"], "call")],
                    oop_parts=[(PREFLOP_SPOTS["bb_vs_sb_limp"], "raise")],
                )

    return None


def options_for_hand(spot_id: str, hand_key: str) -> dict[str, float]:
    range_payload = bundled_range(spot_id)
    raw_actions = range_payload["actions"].get(hand_key, {})
    options: dict[str, float] = {}
    for action in LEGAL_ACTIONS_BY_SPOT[spot_id]:
        options[action] = float(raw_actions.get(action, 0.0))
    return options


def spot_name(spot_id: str) -> str:
    return str(bundled_range(spot_id)["name"])


def has_integrated_preflop_metadata(action_history: list[dict[str, Any]]) -> bool:
    return any(entry.get("street") == "preflop" and "spot_id" in entry and "hand_key" in entry for entry in action_history)


def range_for_line(parts: list[tuple[str, str]]) -> str:
    if not parts:
        return ""

    first_actions = bundled_range(parts[0][0])["actions"]
    tokens: list[str] = []
    for combo in first_actions:
        frequency = 1.0
        for spot_id, action in parts:
            frequency *= float(bundled_range(spot_id)["actions"].get(combo, {}).get(action, 0.0))
        if frequency <= 0.0:
            continue
        if abs(frequency - 1.0) <= 0.000001:
            tokens.append(combo)
        else:
            tokens.append(f"{combo}:{_format_frequency(frequency)}")
    return ",".join(tokens)


@lru_cache(maxsize=1)
def bundled_ranges() -> dict[str, dict[str, Any]]:
    ranges_dir = Path(__file__).resolve().parents[3] / "frontend" / "src" / "preflop" / "ranges"
    loaded: dict[str, dict[str, Any]] = {}
    for spot_id, filename in RANGE_FILES.items():
        with (ranges_dir / filename).open(encoding="utf-8") as handle:
            payload = json.load(handle)
        loaded[spot_id] = payload
    return loaded


def bundled_range(spot_id: str) -> dict[str, Any]:
    try:
        return bundled_ranges()[spot_id]
    except KeyError as exc:
        raise ValueError(f"Unsupported bundled preflop spot: {spot_id}") from exc


def _branch(
    branch_id: str,
    *,
    starting_pot_bb: float,
    effective_stack_bb: float,
    ip_parts: list[tuple[str, str]],
    oop_parts: list[tuple[str, str]],
) -> dict[str, Any]:
    ip_range = range_for_line(ip_parts)
    oop_range = range_for_line(oop_parts)
    return {
        "branch_id": branch_id,
        "starting_pot_bb": starting_pot_bb,
        "effective_stack_bb": effective_stack_bb,
        "shark_ranges": {"ip": ip_range, "oop": oop_range},
        "range_hashes": {"ip": _hash_text(ip_range), "oop": _hash_text(oop_range)},
        "line": {
            "ip": [{"spot_id": spot_id, "action": action} for spot_id, action in ip_parts],
            "oop": [{"spot_id": spot_id, "action": action} for spot_id, action in oop_parts],
        },
    }


def _first(entries: list[dict[str, Any]], spot_id: str, actor: str) -> dict[str, Any] | None:
    return next((entry for entry in entries if entry.get("spot_id") == spot_id and entry.get("actor") == actor), None)


def _hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _format_frequency(value: float) -> str:
    return f"{value:.6g}"
