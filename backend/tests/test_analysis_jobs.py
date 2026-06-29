from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analysis.service import create_analysis_job, process_next_analysis_job
from app.db import Base
from app.models import AnalysisJob, Hand


class BlankFailureSolver:
    solver_name = "shark"

    def solver_metadata(self) -> dict[str, str]:
        return {"name": "shark", "version": "test", "commit": "test"}

    def cache_settings(self) -> dict[str, object]:
        return {
            "iterations": 100,
            "min_exploitability_pct": 0.1,
            "all_in_threshold": 0.67,
            "thread_count": 1,
            "force_donk_check": True,
            "postflop_raises_enabled": False,
            "minimum_bet_bb": 1,
        }

    async def solve(self, solver_input):
        raise AssertionError()

    async def close(self) -> None:
        return None


def make_integrated_hand() -> Hand:
    return Hand(
        hero_position="SB",
        villain_position="BB",
        hero_cards="AsKd",
        villain_cards="QcJh",
        board_json=["Ks", "7d", "2c", "4h", "9s"],
        stack_bb=100,
        pot=5.0,
        action_history_json=[
            {
                "street": "preflop",
                "actor": "SB",
                "action": "raise",
                "amount_bb": 2.5,
                "pot_after": 2.5,
                "node": "SB preflop decision",
                "spot_id": "HU_SB_OPEN_2_5BB_OR_LIMP_100BB",
                "hand_key": "AA",
                "automatic": False,
            },
            {
                "street": "preflop",
                "actor": "BB",
                "action": "call",
                "amount_bb": 2.5,
                "pot_after": 5,
                "node": "BB versus SB open",
                "spot_id": "HU_SRP_BB_VS_SB_OPEN_100BB",
                "hand_key": "K9s",
                "automatic": True,
            },
            {
                "street": "flop",
                "actor": "BB",
                "action": "check",
                "amount_bb": 0,
                "pot_after": 5,
                "node": "BB flop decision",
            },
        ],
        result_json={"winner": "showdown"},
    )


def test_analysis_job_creation_is_idempotent() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSession() as db:
        hand = make_integrated_hand()
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
        hand = make_integrated_hand()
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
        hand = make_integrated_hand()
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
