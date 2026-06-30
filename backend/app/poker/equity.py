from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from typing import Any

from app.poker.cards import build_deck

RANK_VALUES = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "T": 10,
    "J": 11,
    "Q": 12,
    "K": 13,
    "A": 14,
}


@dataclass(frozen=True)
class Card:
    code: str
    rank: int
    suit: str


def exact_holdem_equity(hero_cards: list[str], villain_cards: list[str], board: list[str]) -> dict[str, Any]:
    if len(hero_cards) != 2 or len(villain_cards) != 2:
        return _unavailable("invalid_cards", "Equity requires two cards for each player.")
    if len(board) < 3 or len(board) > 5:
        return _unavailable("unsupported_street", "Exact card equity is available from flop through river.")

    known_cards = [_normalize_card(card) for card in [*hero_cards, *villain_cards, *board]]
    if len(set(known_cards)) != len(known_cards):
        return _unavailable("duplicate_cards", "Equity cannot be calculated with duplicate cards.")

    remaining = [card for card in build_deck() if _normalize_card(card) not in set(known_cards)]
    missing_board_cards = 5 - len(board)
    hero_wins = 0
    villain_wins = 0
    ties = 0

    for runout in combinations(remaining, missing_board_cards):
        final_board = [*board, *runout]
        comparison = _compare_scores(
            _best_hand([*hero_cards, *final_board]),
            _best_hand([*villain_cards, *final_board]),
        )
        if comparison > 0:
            hero_wins += 1
        elif comparison < 0:
            villain_wins += 1
        else:
            ties += 1

    total = hero_wins + villain_wins + ties
    if total == 0:
        return _unavailable("no_runouts", "No legal runouts were available for this equity calculation.")

    return {
        "available": True,
        "source": "exact_revealed_cards",
        "hero": (hero_wins + ties * 0.5) / total,
        "villain": (villain_wins + ties * 0.5) / total,
        "hero_wins": hero_wins,
        "villain_wins": villain_wins,
        "ties": ties,
        "total_runouts": total,
        "note": "Exact equity against revealed opponent cards.",
    }


def _best_hand(card_codes: list[str]) -> tuple[int, ...]:
    cards = [_parse_card(card) for card in card_codes]
    return max((_evaluate_five_cards(list(combo)) for combo in combinations(cards, 5)), key=lambda score: score)


def _evaluate_five_cards(cards: list[Card]) -> tuple[int, ...]:
    ranks = sorted((card.rank for card in cards), reverse=True)
    flush = all(card.suit == cards[0].suit for card in cards)
    straight_high = _straight_high_card(ranks)
    groups = _grouped_ranks(ranks)

    if flush and straight_high:
        return (8, straight_high)

    if groups[0]["count"] == 4:
        kicker = next(group["rank"] for group in groups if group["count"] == 1)
        return (7, groups[0]["rank"], kicker)

    if groups[0]["count"] == 3 and groups[1]["count"] == 2:
        return (6, groups[0]["rank"], groups[1]["rank"])

    if flush:
        return (5, *ranks)

    if straight_high:
        return (4, straight_high)

    if groups[0]["count"] == 3:
        kickers = [group["rank"] for group in groups if group["count"] == 1]
        return (3, groups[0]["rank"], *kickers)

    if groups[0]["count"] == 2 and groups[1]["count"] == 2:
        kicker = next(group["rank"] for group in groups if group["count"] == 1)
        return (2, groups[0]["rank"], groups[1]["rank"], kicker)

    if groups[0]["count"] == 2:
        kickers = [group["rank"] for group in groups if group["count"] == 1]
        return (1, groups[0]["rank"], *kickers)

    return (0, *ranks)


def _parse_card(card: str) -> Card:
    normalized = _normalize_card(card)
    return Card(code=normalized, rank=RANK_VALUES[normalized[0]], suit=normalized[1])


def _normalize_card(card: str) -> str:
    if len(card) != 2:
        raise ValueError(f"Invalid card: {card}")
    rank = card[0].upper()
    suit = card[1].lower()
    if rank not in RANK_VALUES or suit not in {"s", "h", "d", "c"}:
        raise ValueError(f"Invalid card: {card}")
    return f"{rank}{suit}"


def _grouped_ranks(ranks: list[int]) -> list[dict[str, int]]:
    counts: dict[int, int] = {}
    for rank in ranks:
        counts[rank] = counts.get(rank, 0) + 1
    return sorted(
        ({"rank": rank, "count": count} for rank, count in counts.items()),
        key=lambda group: (-group["count"], -group["rank"]),
    )


def _straight_high_card(ranks: list[int]) -> int | None:
    unique_ranks = sorted(set(ranks), reverse=True)
    if 14 in unique_ranks:
        unique_ranks.append(1)

    for index in range(0, len(unique_ranks) - 4):
        high = unique_ranks[index]
        if unique_ranks[index + 4] == high - 4:
            return 5 if high == 1 else high
    return None


def _compare_scores(left: tuple[int, ...], right: tuple[int, ...]) -> int:
    if left > right:
        return 1
    if left < right:
        return -1
    return 0


def _unavailable(source: str, note: str) -> dict[str, Any]:
    return {
        "available": False,
        "source": source,
        "hero": None,
        "villain": None,
        "note": note,
    }
