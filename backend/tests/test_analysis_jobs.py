from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analysis.service import create_analysis_job
from app.db import Base
from app.models import AnalysisJob, Hand


def test_analysis_job_creation_is_idempotent() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSession() as db:
        hand = Hand(
            hero_position="SB",
            villain_position="BB",
            hero_cards="AsKd",
            villain_cards="QcJh",
            board_json=["Ks", "7d", "2c", "4h", "9s"],
            stack_bb=100,
            pot=11.0,
            action_history_json=[],
            result_json={"winner": "showdown"},
        )
        db.add(hand)
        db.commit()
        db.refresh(hand)

        first = create_analysis_job(db, hand.id)
        second = create_analysis_job(db, hand.id)
        jobs = db.query(AnalysisJob).all()

    assert first.id == second.id
    assert first.status == "queued"
    assert len(jobs) == 1
