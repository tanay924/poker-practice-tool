from __future__ import annotations

from sqlalchemy.orm import Session

from app.analysis.service import build_solver_input, compute_cache_key
from app.models import AnalysisJob, Hand, PreflopRange, SolverCache, utc_now
from app.ranges.parser import parse_preflop_range
from app.solver.adapters import MockSolverAdapter


SAMPLE_RANGE = {
    "name": "HU 100bb SB open",
    "spot": "HU_SB_OPEN_100BB",
    "stack_bb": 100,
    "actions": {
        "AA": {"raise": 1.0},
        "KQo": {"raise": 0.75, "fold": 0.25},
        "72o": {"fold": 1.0},
    },
}

SAMPLE_ACTION_HISTORY = [
    {
        "street": "preflop",
        "actor": "SB",
        "action": "open_2_5",
        "amount_bb": 2.5,
        "pot_after": 2.5,
        "node": "SB scripted open",
    },
    {
        "street": "preflop",
        "actor": "BB",
        "action": "call",
        "amount_bb": 2.5,
        "pot_after": 5.0,
        "node": "BB scripted call",
    },
    {
        "street": "flop",
        "actor": "SB",
        "action": "check",
        "amount_bb": 0,
        "pot_after": 5.0,
        "node": "SB continuation decision",
    },
    {
        "street": "turn",
        "actor": "SB",
        "action": "bet_66",
        "amount_bb": 3.3,
        "pot_after": 8.3,
        "node": "SB turn barrel decision",
    },
]


async def seed_database(db: Session) -> None:
    if db.query(PreflopRange).count() == 0:
        parsed = parse_preflop_range(SAMPLE_RANGE)
        db.add(
            PreflopRange(
                name=parsed.name,
                spot=parsed.spot,
                stack_bb=parsed.stack_bb,
                source="seed",
                range_json=parsed.model_dump(),
            )
        )
        db.commit()

    if db.query(Hand).count() > 0:
        return

    hand = Hand(
        hero_position="SB",
        villain_position="BB",
        hero_cards="AsKd",
        villain_cards="QcJh",
        board_json=["Ks", "7d", "2c", "4h", "9s"],
        stack_bb=100,
        pot=8.3,
        action_history_json=SAMPLE_ACTION_HISTORY,
        result_json={"winner": "hero", "reason": "sample_hand"},
    )
    db.add(hand)
    db.commit()
    db.refresh(hand)

    solver_input = build_solver_input(hand)
    solver_output = await MockSolverAdapter(delay_seconds=0).solve(solver_input)
    cache_key = compute_cache_key(solver_input)
    db.add(
        SolverCache(
            cache_key=cache_key,
            solver_input_json=solver_input,
            solver_output_json=solver_output,
        )
    )
    db.add(
        AnalysisJob(
            hand_id=hand.id,
            status="ready",
            started_at=utc_now(),
            finished_at=utc_now(),
            solver_input_json=solver_input,
            solver_output_json=solver_output,
        )
    )
    db.commit()
