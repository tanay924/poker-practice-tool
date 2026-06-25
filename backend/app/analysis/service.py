from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AnalysisJob, Hand, SolverCache, utc_now
from app.solver.adapters import MockSolverAdapter, SolverAdapter


def create_analysis_job(db: Session, hand_id: int) -> AnalysisJob:
    existing = db.query(AnalysisJob).filter(AnalysisJob.hand_id == hand_id).first()
    if existing:
        return existing

    hand = db.get(Hand, hand_id)
    if hand is None:
        raise ValueError(f"Hand {hand_id} does not exist")

    job = AnalysisJob(hand_id=hand_id, status="queued")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def build_solver_input(hand: Hand) -> dict[str, Any]:
    return {
        "hand_id": hand.id,
        "hero_position": hand.hero_position,
        "villain_position": hand.villain_position,
        "hero_cards": hand.hero_cards,
        "villain_cards": hand.villain_cards,
        "board": hand.board_json,
        "stack_bb": hand.stack_bb,
        "pot": hand.pot,
        "action_history": hand.action_history_json,
        "result": hand.result_json,
    }


def compute_cache_key(solver_input: dict[str, Any]) -> str:
    payload = json.dumps(solver_input, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def process_next_analysis_job(
    db: Session,
    solver: SolverAdapter | None = None,
) -> AnalysisJob | None:
    job = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.status == "queued")
        .order_by(AnalysisJob.created_at.asc())
        .first()
    )
    if job is None:
        return None

    solver = solver or MockSolverAdapter()
    job.status = "solving"
    job.started_at = utc_now()
    job.error = None
    db.commit()
    db.refresh(job)

    try:
        hand = db.get(Hand, job.hand_id)
        if hand is None:
            raise ValueError(f"Hand {job.hand_id} does not exist")

        solver_input = build_solver_input(hand)
        cache_key = compute_cache_key(solver_input)
        cached = db.query(SolverCache).filter(SolverCache.cache_key == cache_key).first()

        if cached is not None:
            solver_output = cached.solver_output_json
        else:
            solver_output = await solver.solve(solver_input)
            db.add(
                SolverCache(
                    cache_key=cache_key,
                    solver_input_json=solver_input,
                    solver_output_json=solver_output,
                )
            )

        job.solver_input_json = solver_input
        job.solver_output_json = solver_output
        job.status = "ready"
        job.finished_at = utc_now()
        db.commit()
        db.refresh(job)
        return job
    except NotImplementedError as exc:
        job.status = "unsupported"
        job.error = str(exc)
        job.finished_at = utc_now()
        db.commit()
        db.refresh(job)
        return job
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        job.finished_at = utc_now()
        db.commit()
        db.refresh(job)
        return job
