from __future__ import annotations

import copy
import hashlib
import json
from typing import Any

from sqlalchemy.orm import Session

from app.analysis.decision_details import add_decision_details
from app.models import AnalysisJob, Hand, SolverCache, utc_now
from app.preflop.analysis import (
    analyze_preflop_actions,
    derive_postflop_branch,
    has_integrated_preflop_metadata,
)
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
        "action_history": normalize_action_history(hand.action_history_json),
        "result": hand.result_json,
    }


def normalize_action_history(action_history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_normalize_action_entry(entry) for entry in action_history]


def _normalize_action_entry(entry: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(entry)
    action = str(normalized.get("action", "")).strip().lower()

    if action.startswith("open_") or action.startswith("raise_"):
        normalized["action"] = "raise_to"
        normalized.setdefault("target_amount_bb", normalized.get("amount_bb", 0))
    elif action.startswith("bet_"):
        normalized["action"] = "bet"

    return normalized


def prepare_solver_input(db: Session, hand: Hand, solver: SolverAdapter) -> dict[str, Any]:
    solver_input = build_solver_input(hand)
    preflop_analysis = analyze_preflop_actions(solver_input["action_history"])
    solver_input["preflop_analysis"] = preflop_analysis

    solver_input["solver"] = solver.solver_metadata()
    solver_input["solver_settings"] = solver.cache_settings()
    if has_integrated_preflop_metadata(solver_input["action_history"]):
        branch = derive_postflop_branch(solver_input["action_history"])
        if branch is not None:
            solver_input["ranges"] = {
                "branch_id": branch["branch_id"],
                "range_hashes": branch["range_hashes"],
                "shark_ranges": branch["shark_ranges"],
                "line": branch["line"],
            }
            solver_input["postflop_branch_id"] = branch["branch_id"]
            solver_input["starting_pot_bb"] = branch["starting_pot_bb"]
            solver_input["effective_stack_bb"] = branch["effective_stack_bb"]
        else:
            solver_input["postflop_skip_reason"] = "preflop ended before a supported postflop branch"
    else:
        resolved_ranges = resolve_hu_srp_ranges(db, stack_bb=hand.stack_bb)
        solver_input["ranges"] = resolved_ranges.to_solver_payload()
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

    solver_input: dict[str, Any] | None = None

    try:
        hand = db.get(Hand, job.hand_id)
        if hand is None:
            raise ValueError(f"Hand {job.hand_id} does not exist")

        solver_input = prepare_solver_input(db, hand, solver)
        cache_key = compute_cache_key(solver_input)
        cached = db.query(SolverCache).filter(SolverCache.cache_key == cache_key).first()

        if cached is not None:
            solver_output = _with_cache_hit(cached.solver_output_json, hit=True)
        elif _should_skip_postflop(solver_input):
            solver_output = _with_cache_hit(_preflop_only_output(solver_input), hit=False)
            db.add(
                SolverCache(
                    cache_key=cache_key,
                    solver_input_json=solver_input,
                    solver_output_json=solver_output,
                )
            )
        else:
            solver_output = await solver.solve(solver_input)
            solver_output = _merge_preflop_output(solver_output, solver_input)
            solver_output = _with_cache_hit(solver_output, hit=False)
            db.add(
                SolverCache(
                    cache_key=cache_key,
                    solver_input_json=solver_input,
                    solver_output_json=solver_output,
                )
            )

        solver_output = add_decision_details(solver_output, solver_input)
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
        if solver_input is not None:
            job.solver_input_json = solver_input
            job.solver_output_json = _preflop_only_output(solver_input, postflop_status="unsupported", postflop_error=job.error)
        job.finished_at = utc_now()
        db.commit()
        db.refresh(job)
        return job
    except SolverExecutionError as exc:
        job.status = "failed"
        job.error = _exception_message(exc)
        if solver_input is not None:
            job.solver_input_json = solver_input
            job.solver_output_json = _preflop_only_output(solver_input, postflop_status="failed", postflop_error=job.error)
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


def _should_skip_postflop(solver_input: dict[str, Any]) -> bool:
    preflop_summary = solver_input.get("preflop_analysis", {}).get("summary", {})
    return bool(preflop_summary.get("blocks_postflop")) or (
        preflop_summary.get("decision_count", 0) > 0 and "ranges" not in solver_input
    )


def _preflop_only_output(
    solver_input: dict[str, Any],
    *,
    postflop_status: str = "skipped",
    postflop_error: str | None = None,
) -> dict[str, Any]:
    output = {
        "metadata": {
            "solver": solver_input.get("solver", {"name": "preflop-ranges", "version": "bundled"}),
            "range_hashes": solver_input.get("ranges", {}).get("range_hashes", {}),
        },
        "preflop_results": solver_input.get("preflop_analysis", {}).get("results", []),
        "preflop_summary": solver_input.get("preflop_analysis", {}).get("summary", {}),
        "postflop_status": postflop_status,
        "street_results": [],
        "summary": {
            "overall": "needs_review"
            if solver_input.get("preflop_analysis", {}).get("summary", {}).get("blocks_postflop")
            else "preflop_only",
            "largest_mistake": None,
        },
    }
    if postflop_error:
        output["postflop_error"] = postflop_error
    return output


def _merge_preflop_output(solver_output: dict[str, Any], solver_input: dict[str, Any]) -> dict[str, Any]:
    output = copy.deepcopy(solver_output)
    output["preflop_results"] = solver_input.get("preflop_analysis", {}).get("results", [])
    output["preflop_summary"] = solver_input.get("preflop_analysis", {}).get("summary", {})
    output["postflop_status"] = "ready"
    return output


def _exception_message(exc: Exception) -> str:
    message = str(exc).strip()
    if message:
        return message
    return type(exc).__name__
