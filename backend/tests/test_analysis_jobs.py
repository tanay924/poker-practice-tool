from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analysis.service import create_analysis_job, process_next_analysis_job
from app.db import Base
from app.models import AnalysisJob, Hand


class BlankFailureSolver:
    solver_name = "blank_failure"

    async def solve(self, solver_input):
        raise AssertionError()

    async def close(self) -> None:
        return None


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


def test_failed_analysis_job_is_requeued_for_retry() -> None:
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

        failed = AnalysisJob(
            hand_id=hand.id,
            status="failed",
            error="missing ranges",
            solver_input_json={"old": "input"},
            solver_output_json={"old": "output"},
        )
        db.add(failed)
        db.commit()
        db.refresh(failed)

        retried = create_analysis_job(db, hand.id)
        jobs = db.query(AnalysisJob).all()

    assert retried.id == failed.id
    assert retried.status == "queued"
    assert retried.error is None
    assert retried.started_at is None
    assert retried.finished_at is None
    assert retried.solver_input_json is None
    assert retried.solver_output_json is None
    assert len(jobs) == 1


def test_blank_solver_exception_records_exception_type() -> None:
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
        db.add(AnalysisJob(hand_id=hand.id, status="queued"))
        db.commit()

        import asyncio

        job = asyncio.run(process_next_analysis_job(db, solver=BlankFailureSolver()))

    assert job is not None
    assert job.status == "failed"
    assert job.error == "AssertionError"
