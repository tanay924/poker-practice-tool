from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Hand


def test_action_history_saves_and_loads_correctly() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    action_history = [
        {
            "street": "preflop",
            "actor": "SB",
            "action": "open_2_5",
            "amount_bb": 2.5,
            "pot_after": 2.5,
        },
        {
            "street": "flop",
            "actor": "SB",
            "action": "bet_50",
            "amount_bb": 2.5,
            "pot_after": 7.5,
        },
    ]

    with TestingSession() as db:
        hand = Hand(
            hero_position="SB",
            villain_position="BB",
            hero_cards="AsKd",
            villain_cards="QcJh",
            board_json=["Ks", "7d", "2c", "4h", "9s"],
            stack_bb=100,
            pot=7.5,
            action_history_json=action_history,
            result_json={"winner": "hero", "reason": "villain_folded"},
        )
        db.add(hand)
        db.commit()
        hand_id = hand.id

        loaded = db.get(Hand, hand_id)

    assert loaded is not None
    assert loaded.action_history_json == action_history
