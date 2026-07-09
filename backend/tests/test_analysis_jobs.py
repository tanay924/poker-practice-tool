import asyncio

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analysis.service import AnalysisQueueLimitError, create_analysis_job, process_next_analysis_job
from app.api.analysis import list_analysis
from app.auth import RequestActor
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


def test_user_cannot_queue_more_than_five_active_analysis_jobs() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSession() as db:
        hands = []
        for index in range(6):
            hand = make_integrated_hand()
            hand.user_id = "user-a"
            hand.hero_cards = f"AsK{index}"
            db.add(hand)
            hands.append(hand)
        db.commit()
        for hand in hands:
            db.refresh(hand)

        for hand in hands[:5]:
            create_analysis_job(db, hand.id, user_id="user-a")

        try:
            create_analysis_job(db, hands[5].id, user_id="user-a")
        except AnalysisQueueLimitError as exc:
            error = exc
        else:
            raise AssertionError("Expected queue limit error")

        jobs = db.query(AnalysisJob).filter(AnalysisJob.user_id == "user-a").all()

    assert error.active_count == 5
    assert len(jobs) == 5


def test_processing_uses_global_fifo_order_across_users() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSession() as db:
        hand_a = make_integrated_hand()
        hand_a.user_id = "user-a"
        hand_b = make_integrated_hand()
        hand_b.user_id = "user-b"
        db.add_all([hand_a, hand_b])
        db.commit()
        db.refresh(hand_a)
        db.refresh(hand_b)

        later = create_analysis_job(db, hand_b.id, user_id="user-b")
        earlier = create_analysis_job(db, hand_a.id, user_id="user-a")
        hand_a_id = hand_a.id
        earlier.queued_at = later.queued_at.replace(year=later.queued_at.year - 1)
        db.commit()

        job = asyncio.run(process_next_analysis_job(db, solver=BlankFailureSolver()))

    assert job is not None
    assert job.hand_id == hand_a_id


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


def test_analysis_list_only_includes_revealed_board_cards() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSession() as db:
        preflop_hand = Hand(
            user_id="user-a",
            hero_position="SB",
            villain_position="BB",
            hero_cards="AdTd",
            villain_cards="Jc4d",
            board_json=["8c", "Th", "6d", "4c", "Qd"],
            stack_bb=100,
            pot=2.5,
            action_history_json=[
                {
                    "street": "preflop",
                    "actor": "SB",
                    "action": "raise",
                    "amount_bb": 2.5,
                    "pot_after": 2.5,
                    "node": "SB preflop decision",
                },
                {
                    "street": "preflop",
                    "actor": "BB",
                    "action": "fold",
                    "amount_bb": 0,
                    "pot_after": 2.5,
                    "node": "BB versus SB open",
                },
            ],
            result_json={"winner": "hero", "reason": "villain_folded_preflop"},
        )
        flop_hand = make_integrated_hand()
        flop_hand.user_id = "user-a"
        db.add_all([preflop_hand, flop_hand])
        db.commit()
        db.refresh(preflop_hand)
        db.refresh(flop_hand)
        db.add_all([
            AnalysisJob(hand_id=preflop_hand.id, status="ready"),
            AnalysisJob(hand_id=flop_hand.id, status="ready"),
        ])
        db.commit()

        rows = list_analysis(db, RequestActor(user_id="user-a"))

    boards_by_hand_id = {row.hand_id: row.board for row in rows}
    assert boards_by_hand_id[preflop_hand.id] == []
    assert boards_by_hand_id[flop_hand.id] == ["Ks", "7d", "2c"]
