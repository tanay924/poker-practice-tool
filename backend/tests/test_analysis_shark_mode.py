import asyncio

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analysis.service import compute_cache_key, process_next_analysis_job
from app.db import Base
from app.models import AnalysisJob, Hand
from app.solver.config import SolverSettings
from app.solver.factory import create_solver


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    return TestingSession()


def insert_hand(db) -> Hand:
    hand = Hand(
        hero_position="SB",
        villain_position="BB",
        hero_cards="AsKd",
        villain_cards="QcJh",
        board_json=["Ks", "7d", "2c", "4h", "9s"],
        stack_bb=100,
        pot=11.0,
        action_history_json=[
            {"street": "preflop", "actor": "SB", "action": "open_2_5", "amount_bb": 2.5, "pot_after": 2.5, "node": "SB scripted open"},
            {"street": "preflop", "actor": "BB", "action": "call", "amount_bb": 2.5, "pot_after": 5.0, "node": "BB scripted call"},
            {"street": "flop", "actor": "SB", "action": "check", "amount_bb": 0, "pot_after": 5.0, "node": "SB flop decision"},
        ],
        result_json={"winner": "showdown"},
    )
    db.add(hand)
    db.commit()
    db.refresh(hand)
    db.add(AnalysisJob(hand_id=hand.id, status="queued"))
    db.commit()
    return hand


def test_shark_mode_missing_ranges_marks_job_unsupported() -> None:
    with make_session() as db:
        hand = insert_hand(db)
        solver = create_solver(
            SolverSettings(
                solver_name="shark",
                shark_worker_path="C:/missing/shark_worker.exe",
            )
        )

        job = asyncio.run(process_next_analysis_job(db, solver=solver))

        assert job is not None
        assert job.hand_id == hand.id
        assert job.status == "unsupported"
        assert "HU_SRP_SB_OPEN_100BB" in (job.error or "")
        assert "HU_SRP_BB_CALL_VS_SB_OPEN_100BB" in (job.error or "")


def test_cache_key_changes_when_solver_settings_or_ranges_change() -> None:
    base = {
        "hand_id": 1,
        "board": ["Ks", "7d", "2c"],
        "action_history": [{"street": "flop", "actor": "SB", "action": "check"}],
        "solver": {"name": "shark", "version": "v2.6.0"},
        "solver_settings": {"iterations": 100, "min_exploitability_pct": 0.1},
        "ranges": {"range_hashes": {"sb_open": "a", "bb_call_vs_open": "b"}},
    }

    same = compute_cache_key(dict(base))
    changed_version = compute_cache_key({**base, "solver": {"name": "shark", "version": "v2.6.1"}})
    changed_settings = compute_cache_key({**base, "solver_settings": {"iterations": 200, "min_exploitability_pct": 0.1}})
    changed_range = compute_cache_key({**base, "ranges": {"range_hashes": {"sb_open": "z", "bb_call_vs_open": "b"}}})

    assert same != changed_version
    assert same != changed_settings
    assert same != changed_range
