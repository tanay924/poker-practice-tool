from __future__ import annotations

import copy
import hashlib
import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AnalysisJob, Hand, SolverCache, utc_now
from app.ranges.resolver import resolve_hu_srp_ranges
from app.solver.adapters import SolverAdapter
from app.solver.errors import SolverExecutionError, UnsupportedAnalysisError
from app.solver.factory import create_solver_from_env


def create_analysis_job(db: Session, hand_id: int) -> AnalysisJob:
    existing = db.query(AnalysisJob).filter(AnalysisJob.hand_id == hand_id).first()
    if existing:
        if existing.status in {"failed", "unsupported"}:
            existing.status = "queued"
            existing.started_at = None
            existing.finished_at = None
            existing.error = None
            existing.solver_input_json = None
            existing.solver_output_json = None
            db.commit()
            db.refresh(existing)
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


def prepare_solver_input(db: Session, hand: Hand, solver: SolverAdapter) -> dict[str, Any]:
    solver_input = build_solver_input(hand)
    if getattr(solver, "solver_name", "mock") == "shark":
        resolved_ranges = resolve_hu_srp_ranges(db, stack_bb=hand.stack_bb)
        solver_input["solver"] = solver.solver_metadata()
        solver_input["solver_settings"] = solver.cache_settings()
        solver_input["ranges"] = resolved_ranges.to_solver_payload()
    else:
        solver_input["solver"] = {"name": "mock", "version": "deterministic-local"}
    return solver_input


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

    solver = solver or create_solver_from_env()
    job.status = "solving"
    job.started_at = utc_now()
    job.error = None
    db.commit()
    db.refresh(job)

    try:
        hand = db.get(Hand, job.hand_id)
        if hand is None:
            raise ValueError(f"Hand {job.hand_id} does not exist")

        solver_input = prepare_solver_input(db, hand, solver)
        cache_key = compute_cache_key(solver_input)
        cached = db.query(SolverCache).filter(SolverCache.cache_key == cache_key).first()

        if cached is not None:
            solver_output = _with_cache_hit(cached.solver_output_json, hit=True)
        else:
            solver_output = await solver.solve(solver_input)
            solver_output = _with_cache_hit(solver_output, hit=False)
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
    except UnsupportedAnalysisError as exc:
        job.status = "unsupported"
        job.error = _exception_message(exc)
        job.finished_at = utc_now()
        db.commit()
        db.refresh(job)
        return job
    except SolverExecutionError as exc:
        job.status = "failed"
        job.error = _exception_message(exc)
        job.finished_at = utc_now()
        db.commit()
        db.refresh(job)
        return job
    except Exception as exc:
        job.status = "failed"
        job.error = _exception_message(exc)
        job.finished_at = utc_now()
        db.commit()
        db.refresh(job)
        return job


def _with_cache_hit(solver_output: dict[str, Any], *, hit: bool) -> dict[str, Any]:
    output = copy.deepcopy(solver_output)
    metadata = output.setdefault("metadata", {})
    metadata["cache"] = {"hit": hit}
    return output


def _exception_message(exc: Exception) -> str:
    message = str(exc).strip()
    if message:
        return message
    return type(exc).__name__
