from __future__ import annotations

from dataclasses import dataclass
import random

RANKS = "AKQJT98765432"
SUITS = "shdc"


@dataclass(frozen=True)
class DealtHand:
    hero_cards: list[str]
    villain_cards: list[str]
    board: list[str]


def build_deck() -> list[str]:
    return [f"{rank}{suit}" for rank in RANKS for suit in SUITS]


def deal_random_hand(seed: int | None = None) -> DealtHand:
    deck = build_deck()
    rng = random.Random(seed)
    rng.shuffle(deck)
    return DealtHand(
        hero_cards=deck[0:2],
        villain_cards=deck[2:4],
        board=deck[4:9],
    )
