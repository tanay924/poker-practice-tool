from app.poker.cards import build_deck, deal_random_hand


def test_deal_random_hand_has_no_duplicate_cards() -> None:
    dealt = deal_random_hand(seed=42)
    cards = dealt.hero_cards + dealt.villain_cards + dealt.board

    assert len(cards) == 9
    assert len(set(cards)) == 9
    assert set(cards).issubset(set(build_deck()))
