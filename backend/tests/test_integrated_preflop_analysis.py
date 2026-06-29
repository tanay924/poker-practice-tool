import asyncio

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analysis.service import process_next_analysis_job
from app.db import Base
from app.models import AnalysisJob, Hand
from app.preflop.analysis import analyze_preflop_actions, derive_postflop_branch


class FailingSharkSolver:
    solver_name = "shark"
    called = False

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
        }

    async def solve(self, solver_input):
        self.called = True
        raise AssertionError("Shark should not be called for a 0% preflop line")

    async def close(self) -> None:
        return None


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    return TestingSession()


def test_preflop_analyzer_scores_hero_decision_from_bundled_ranges() -> None:
    history = [
        {
            "street": "preflop",
            "actor": "SB",
            "action": "limp",
            "amount_bb": 1,
            "pot_after": 2,
            "node": "SB preflop decision",
            "spot_id": "HU_SB_OPEN_2_5BB_OR_LIMP_100BB",
            "hand_key": "AKs",
            "automatic": False,
        }
    ]

    analysis = analyze_preflop_actions(history)

    assert analysis["summary"]["blocks_postflop"] is True
    assert analysis["results"][0]["selected_frequency"] == 0
    assert analysis["results"][0]["correct"] is False
    assert analysis["results"][0]["options"]["raise"] == 1


def test_valid_srp_branch_derives_generic_shark_ranges() -> None:
    history = [
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
    ]

    branch = derive_postflop_branch(history)

    assert branch is not None
    assert branch["branch_id"] == "srp_open_call"
    assert branch["starting_pot_bb"] == 5
    assert branch["effective_stack_bb"] == 97.5
    assert "ip" in branch["shark_ranges"]
    assert "oop" in branch["shark_ranges"]
    assert "AA:0.9" in branch["shark_ranges"]["ip"]
    assert branch["range_hashes"]["ip"] != branch["range_hashes"]["oop"]


def test_zero_frequency_preflop_line_returns_ready_without_calling_shark() -> None:
    with make_session() as db:
        hand = Hand(
            hero_position="SB",
            villain_position="BB",
            hero_cards="AsKs",
            villain_cards="Qc4c",
            board_json=["2d", "7h", "Jc", "4s", "Td"],
            stack_bb=100,
            pot=2,
            action_history_json=[
                {
                    "street": "preflop",
                    "actor": "SB",
                    "action": "limp",
                    "amount_bb": 1,
                    "pot_after": 2,
                    "node": "SB preflop decision",
                    "spot_id": "HU_SB_OPEN_2_5BB_OR_LIMP_100BB",
                    "hand_key": "AKs",
                    "automatic": False,
                },
                {
                    "street": "preflop",
                    "actor": "BB",
                    "action": "check",
                    "amount_bb": 0,
                    "pot_after": 2,
                    "node": "BB versus SB limp",
                    "spot_id": "HU_LIMP_BB_VS_SB_100BB",
                    "hand_key": "Q4s",
                    "automatic": True,
                },
            ],
            result_json={"winner": "showdown", "reason": "river_completed"},
        )
        db.add(hand)
        db.commit()
        db.refresh(hand)
        db.add(AnalysisJob(hand_id=hand.id, status="queued"))
        db.commit()

        solver = FailingSharkSolver()
        job = asyncio.run(process_next_analysis_job(db, solver=solver))

    assert job is not None
    assert job.status == "ready"
    assert solver.called is False
    assert job.solver_output_json["preflop_summary"]["blocks_postflop"] is True
    assert job.solver_output_json["postflop_status"] == "skipped"
