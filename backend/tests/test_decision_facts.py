from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.decision_facts import upsert_decision_facts_for_job
from app.models import AnalysisJob, DecisionFact, Hand


def test_decision_facts_are_extracted_idempotently() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSession() as db:
        hand = Hand(
            user_id="user-facts",
            hero_position="SB",
            villain_position="BB",
            hero_cards="AsKd",
            villain_cards="QcJh",
            board_json=["Ks", "7d", "2c", "4h", "9s"],
            stack_bb=100,
            pot=5.0,
            action_history_json=[],
            result_json={"winner": "showdown"},
        )
        db.add(hand)
        db.commit()
        db.refresh(hand)
        job = AnalysisJob(
            hand_id=hand.id,
            user_id="user-facts",
            status="ready",
            solver_input_json={"postflop_branch_id": "srp_open_call", "solver": {"version": "test-1"}},
            solver_output_json={
                "metadata": {"solver": {"version": "test-1"}},
                "preflop_results": [{
                    "actor": "SB",
                    "correct": False,
                    "hero_action": "fold",
                    "options": {"fold": 0.0, "raise": 1.0},
                    "spot_id": "HU_SB_OPEN",
                }],
                "street_results": [{
                    "street": "flop",
                    "hero_action": "call",
                    "best_action": "fold",
                    "verdict": "mistake",
                    "node": "Flop facing bet",
                    "solver_strategy": {"fold": 0.9, "call": 0.1},
                }],
            },
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        assert upsert_decision_facts_for_job(db, hand, job)
        assert not upsert_decision_facts_for_job(db, hand, job)
        facts = db.query(DecisionFact).order_by(DecisionFact.decision_key.asc()).all()

    assert len(facts) == 2
    assert facts[0].decision_key == "postflop:0"
    assert facts[0].correct is False
    assert facts[1].decision_key == "preflop:0"
    assert facts[1].mistake_class == "folded_valid_continue"
    assert facts[1].solver_version == "test-1"
