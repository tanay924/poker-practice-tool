from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import AuthUser, require_current_user
from app.db import get_db
from app.models import AnalysisJob, Hand, utc_now
from app.schemas import (
    StatsAccuracyRow,
    StatsAnalyzed,
    StatsCountRow,
    StatsMistakeRow,
    StatsOverview,
    StatsRead,
    StatsRecent,
    StudyRecommendation,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])

CORRECT_POSTFLOP_VERDICTS = {"correct", "mixed", "ok"}
POSITION_ORDER = {"SB": 0, "BB": 1}
STREET_ORDER = {"flop": 0, "turn": 1, "river": 2}


@router.get("/me", response_model=StatsRead)
def get_my_stats(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> StatsRead:
    now = utc_now()
    hands = db.query(Hand).filter(Hand.user_id == current_user.user_id).all()
    ready_jobs = ready_analysis_jobs_for_user(db, current_user.user_id)

    preflop_results: list[dict[str, Any]] = []
    recent_preflop_results: list[dict[str, Any]] = []
    postflop_results: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
    for job in ready_jobs:
        output = job.solver_output_json or {}
        job_preflop = [result for result in output.get("preflop_results", []) if isinstance(result, dict)]
        preflop_results.extend(job_preflop)
        if is_recent(job.created_at, now, days=30):
            recent_preflop_results.extend(job_preflop)
        largest_mistake = output.get("summary", {}).get("largest_mistake")
        normalized_largest = largest_mistake if isinstance(largest_mistake, dict) else None
        for result in output.get("street_results", []):
            if isinstance(result, dict):
                postflop_results.append((result, normalized_largest))

    preflop_decisions = len(preflop_results)
    preflop_correct = sum(1 for result in preflop_results if bool(result.get("correct")))
    postflop_mistakes = sum(1 for result, largest in postflop_results if is_postflop_mistake(result, largest))
    preflop_by_spot = accuracy_rows(
        preflop_results,
        label_for_result=lambda result: str(result.get("spot_name") or result.get("spot_id") or "Unknown spot"),
    )
    postflop_by_street = mistake_rows(
        postflop_results,
        label_for_result=lambda result: street_label(str(result.get("street", "unknown"))),
        sort_key=lambda row: STREET_ORDER.get(row.label.lower(), 99),
    )
    biggest_leak = biggest_leak_text(preflop_by_spot, postflop_by_street, len(ready_jobs))

    return StatsRead(
        overall=StatsOverview(hands_played=len(hands)),
        analyzed=StatsAnalyzed(
            hands_analyzed=len(ready_jobs),
            preflop_decisions_reviewed=preflop_decisions,
            preflop_correct=preflop_correct,
            preflop_accuracy=ratio(preflop_correct, preflop_decisions),
            postflop_decisions_reviewed=len(postflop_results),
            postflop_mistakes=postflop_mistakes,
            biggest_leak=biggest_leak,
        ),
        preflop_by_position=accuracy_rows(
            preflop_results,
            label_for_result=lambda result: str(result.get("actor") or "Unknown"),
            sort_key=lambda row: POSITION_ORDER.get(row.label, 99),
        ),
        preflop_by_spot=preflop_by_spot,
        preflop_mistake_types=preflop_mistake_rows(preflop_results),
        postflop_by_street=postflop_by_street,
        postflop_by_action=mistake_rows(
            postflop_results,
            label_for_result=lambda result: action_label(str(result.get("hero_action", "unknown"))),
        ),
        postflop_by_situation=mistake_rows(
            postflop_results,
            label_for_result=lambda result: "Facing a bet" if str(result.get("hero_action", "")).lower() in {"call", "fold"} else "Not facing a bet",
        ),
        recent=StatsRecent(
            hands_played_7d=sum(1 for hand in hands if is_recent(hand.created_at, now, days=7)),
            hands_analyzed_7d=sum(1 for job in ready_jobs if is_recent(job.created_at, now, days=7)),
            hands_played_30d=sum(1 for hand in hands if is_recent(hand.created_at, now, days=30)),
            hands_analyzed_30d=sum(1 for job in ready_jobs if is_recent(job.created_at, now, days=30)),
            preflop_accuracy_30d=ratio(
                sum(1 for result in recent_preflop_results if bool(result.get("correct"))),
                len(recent_preflop_results),
            ),
        ),
        recommendations=recommendations(
            hands_played=len(hands),
            hands_analyzed=len(ready_jobs),
            preflop_by_spot=preflop_by_spot,
            postflop_by_street=postflop_by_street,
        ),
    )


def ready_analysis_jobs_for_user(db: Session, user_id: str) -> list[AnalysisJob]:
    rows = (
        db.query(AnalysisJob)
        .join(Hand, Hand.id == AnalysisJob.hand_id)
        .filter(
            Hand.user_id == user_id,
            AnalysisJob.status == "ready",
            AnalysisJob.solver_output_json.isnot(None),
        )
        .order_by(AnalysisJob.hand_id.asc(), AnalysisJob.created_at.desc(), AnalysisJob.id.desc())
        .all()
    )
    latest_by_hand: dict[int, AnalysisJob] = {}
    for job in rows:
        latest_by_hand.setdefault(job.hand_id, job)
    return list(latest_by_hand.values())


def accuracy_rows(
    results: list[dict[str, Any]],
    *,
    label_for_result,
    sort_key=None,
) -> list[StatsAccuracyRow]:
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"decisions": 0, "correct": 0})
    for result in results:
        label = label_for_result(result)
        buckets[label]["decisions"] += 1
        if bool(result.get("correct")):
            buckets[label]["correct"] += 1
    rows = [
        StatsAccuracyRow(
            label=label,
            decisions=counts["decisions"],
            correct=counts["correct"],
            accuracy=ratio(counts["correct"], counts["decisions"]),
        )
        for label, counts in buckets.items()
    ]
    return sorted(rows, key=sort_key or (lambda row: (-row.decisions, row.label)))


def mistake_rows(
    results: list[tuple[dict[str, Any], dict[str, Any] | None]],
    *,
    label_for_result,
    sort_key=None,
) -> list[StatsMistakeRow]:
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"decisions": 0, "mistakes": 0})
    for result, largest_mistake in results:
        label = label_for_result(result)
        buckets[label]["decisions"] += 1
        if is_postflop_mistake(result, largest_mistake):
            buckets[label]["mistakes"] += 1
    rows = [
        StatsMistakeRow(label=label, decisions=counts["decisions"], mistakes=counts["mistakes"])
        for label, counts in buckets.items()
    ]
    return sorted(rows, key=sort_key or (lambda row: (-row.mistakes, -row.decisions, row.label)))


def preflop_mistake_rows(results: list[dict[str, Any]]) -> list[StatsCountRow]:
    counts: dict[str, int] = defaultdict(int)
    for result in results:
        if bool(result.get("correct")):
            continue
        counts[preflop_mistake_label(result)] += 1
    return [
        StatsCountRow(label=label, count=count)
        for label, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def preflop_mistake_label(result: dict[str, Any]) -> str:
    action = str(result.get("hero_action", "")).lower()
    options = result.get("options", {})
    if not isinstance(options, dict):
        options = {}
    has_continue = any(action_name != "fold" and float_or_zero(frequency) > 0 for action_name, frequency in options.items())
    has_aggression = any(action_name in {"raise", "allin"} and float_or_zero(frequency) > 0 for action_name, frequency in options.items())
    if action == "fold" and has_continue:
        return "Folded a valid continue"
    if action in {"call", "check", "limp"} and has_aggression:
        return "Missed aggression"
    return "Chose a 0% action"


def is_postflop_mistake(result: dict[str, Any], largest_mistake: dict[str, Any] | None) -> bool:
    verdict = str(result.get("verdict", "")).strip().lower()
    if largest_mistake is not None and matches_largest_mistake(result, largest_mistake):
        return True
    return verdict not in CORRECT_POSTFLOP_VERDICTS


def matches_largest_mistake(result: dict[str, Any], largest_mistake: dict[str, Any]) -> bool:
    for key in ["street", "node", "hero_action"]:
        if key in largest_mistake and str(result.get(key)) != str(largest_mistake.get(key)):
            return False
    return True


def biggest_leak_text(preflop_by_spot: list[StatsAccuracyRow], postflop_by_street: list[StatsMistakeRow], hands_analyzed: int) -> str:
    if hands_analyzed == 0:
        return "Not enough analyzed hands yet."
    weakest_preflop = next((row for row in sorted(preflop_by_spot, key=lambda row: (row.accuracy if row.accuracy is not None else 1, -row.decisions)) if row.decisions > 0 and (row.accuracy or 0) < 1), None)
    if weakest_preflop is not None:
        return f"{weakest_preflop.label} is your lowest preflop spot."
    weakest_postflop = next((row for row in postflop_by_street if row.mistakes > 0), None)
    if weakest_postflop is not None:
        return f"{weakest_postflop.label} decisions are your most common postflop issue."
    return "No major leak found in analyzed hands yet."


def recommendations(
    *,
    hands_played: int,
    hands_analyzed: int,
    preflop_by_spot: list[StatsAccuracyRow],
    postflop_by_street: list[StatsMistakeRow],
) -> list[StudyRecommendation]:
    if hands_played == 0:
        return [StudyRecommendation(label="Play a few hands", detail="Build a sample before stats can identify leaks.", to="/play")]
    if hands_analyzed == 0:
        return [StudyRecommendation(label="Analyze saved hands", detail="Accuracy and leak stats appear after completed analysis.", to="/analysis")]

    items: list[StudyRecommendation] = []
    weakest_preflop = next((row for row in sorted(preflop_by_spot, key=lambda row: (row.accuracy if row.accuracy is not None else 1, -row.decisions)) if row.decisions > 0 and (row.accuracy or 0) < 1), None)
    if weakest_preflop is not None:
        items.append(
            StudyRecommendation(
                label=f"Drill {weakest_preflop.label}",
                detail=f"{format_percent(weakest_preflop.accuracy)} accuracy across {weakest_preflop.decisions} analyzed decisions.",
                to="/preflop",
            )
        )
    weakest_postflop = next((row for row in postflop_by_street if row.mistakes > 0), None)
    if weakest_postflop is not None:
        items.append(
            StudyRecommendation(
                label=f"Review {weakest_postflop.label.lower()} decisions",
                detail=f"{weakest_postflop.mistakes} mistakes across {weakest_postflop.decisions} reviewed decisions.",
                to="/analysis",
            )
        )
    if not items:
        items.append(StudyRecommendation(label="Analyze more hands", detail="More analyzed hands will make recommendations sharper.", to="/play"))
    return items[:3]


def ratio(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return round(numerator / denominator, 4)


def is_recent(value: datetime, now: datetime, *, days: int) -> bool:
    return aware_datetime(value) >= now - timedelta(days=days)


def aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def street_label(street: str) -> str:
    return street.strip().capitalize() if street.strip() else "Unknown"


def action_label(action: str) -> str:
    cleaned = action.replace("_", " ").strip()
    return cleaned.capitalize() if cleaned else "Unknown"


def format_percent(value: float | None) -> str:
    if value is None:
        return "No"
    return f"{round(value * 100)}%"


def float_or_zero(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
