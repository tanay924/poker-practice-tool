from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import AnalysisJob, DecisionFact, Hand

CORRECT_POSTFLOP_VERDICTS = {"correct", "mixed", "ok"}


def upsert_decision_facts_for_job(db: Session, hand: Hand, job: AnalysisJob, *, commit: bool = True) -> bool:
    if job.status != "ready" or not isinstance(job.solver_output_json, dict):
        return False
    output = job.solver_output_json
    solver_input = job.solver_input_json if isinstance(job.solver_input_json, dict) else {}
    solver_version = _solver_version(output, solver_input)
    branch_id = str(solver_input.get("postflop_branch_id") or "") or None
    existing_keys = {
        fact.decision_key
        for fact in db.query(DecisionFact).filter(DecisionFact.analysis_job_id == job.id).all()
    }
    changed = False

    for index, result in enumerate(output.get("preflop_results", [])):
        if not isinstance(result, dict):
            continue
        key = f"preflop:{index}"
        if key in existing_keys:
            continue
        options = numeric_options(result.get("options"))
        hero_action = str(result.get("hero_action") or "unknown")
        best_action = max(options.items(), key=lambda item: item[1])[0] if options else "unknown"
        correct = bool(result.get("correct"))
        db.add(
            DecisionFact(
                analysis_job_id=job.id,
                hand_id=hand.id,
                user_id=hand.user_id,
                guest_session_id=hand.guest_session_id,
                decision_key=key,
                street="preflop",
                position=str(result.get("actor") or hand.hero_position),
                spot_id=str(result.get("spot_id") or result.get("spot_name") or "unknown"),
                branch_id=branch_id,
                hero_action=hero_action,
                best_action=best_action,
                correct=correct,
                mistake_class=None if correct else preflop_mistake_class(hero_action, options),
                options_json=options,
                occurred_at=job.created_at,
                solver_version=solver_version,
            )
        )
        changed = True

    for index, result in enumerate(output.get("street_results", [])):
        if not isinstance(result, dict):
            continue
        key = f"postflop:{index}"
        if key in existing_keys:
            continue
        hero_action = str(result.get("hero_action") or "unknown")
        best_action = str(result.get("best_action") or "unknown")
        verdict = str(result.get("verdict") or "unknown").strip().lower()
        correct = verdict in CORRECT_POSTFLOP_VERDICTS
        db.add(
            DecisionFact(
                analysis_job_id=job.id,
                hand_id=hand.id,
                user_id=hand.user_id,
                guest_session_id=hand.guest_session_id,
                decision_key=key,
                street=str(result.get("street") or "unknown"),
                position=hand.hero_position,
                spot_id=str(result.get("node") or "unknown"),
                branch_id=branch_id,
                hero_action=hero_action,
                best_action=best_action,
                correct=correct,
                mistake_class=None if correct else f"{hero_action}_instead_of_{best_action}",
                options_json=numeric_options(result.get("solver_strategy")),
                occurred_at=job.created_at,
                solver_version=solver_version,
            )
        )
        changed = True

    if changed and commit:
        db.commit()
    return changed


def numeric_options(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, float] = {}
    for key, frequency in value.items():
        try:
            result[str(key)] = float(frequency)
        except (TypeError, ValueError):
            continue
    return result


def preflop_mistake_class(action: str, options: dict[str, float]) -> str:
    has_continue = any(key != "fold" and value > 0 for key, value in options.items())
    has_aggression = any(key in {"raise", "allin"} and value > 0 for key, value in options.items())
    if action == "fold" and has_continue:
        return "folded_valid_continue"
    if action in {"call", "check", "limp"} and has_aggression:
        return "missed_aggression"
    return "zero_percent_action"


def _solver_version(output: dict[str, Any], solver_input: dict[str, Any]) -> str | None:
    for payload in [output.get("metadata", {}).get("solver", {}), solver_input.get("solver", {})]:
        if isinstance(payload, dict):
            version = payload.get("version")
            if isinstance(version, str) and version:
                return version
    return None
