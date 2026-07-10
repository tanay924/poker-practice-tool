from __future__ import annotations

import base64
from datetime import datetime, timezone
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.analysis.decision_details import add_decision_details
from app.analysis.service import AnalysisPausedError, build_solver_input, create_analysis_job
from app.auth import RequestActor, require_actor
from app.db import get_db
from app.models import AnalysisJob, Hand, SharedHand, utc_now
from app.schemas import AnalysisDetail, AnalysisJobRead, AnalysisListItem, AnalysisPageRead, HandRead

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

BOARD_CARDS_BY_STREET = {
    "preflop": 0,
    "flop": 3,
    "turn": 4,
    "river": 5,
}


@router.get("", response_model=list[AnalysisListItem])
def list_analysis(
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> list[AnalysisListItem]:
    rows = (
        db.query(AnalysisJob, Hand)
        .join(Hand, Hand.id == AnalysisJob.hand_id)
        .filter(_owner_filter(Hand, actor))
        .order_by(AnalysisJob.created_at.desc())
        .limit(100)
        .all()
    )
    return [_analysis_list_item(job, hand) for job, hand in rows]


@router.get("/page", response_model=AnalysisPageRead)
def list_analysis_page(
    limit: int = Query(default=25, ge=1, le=100),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> AnalysisPageRead:
    query = (
        db.query(AnalysisJob, Hand)
        .join(Hand, Hand.id == AnalysisJob.hand_id)
        .filter(_owner_filter(Hand, actor))
    )
    if cursor:
        cursor_created_at, cursor_job_id = decode_cursor(cursor)
        query = query.filter(
            or_(
                AnalysisJob.created_at < cursor_created_at,
                and_(AnalysisJob.created_at == cursor_created_at, AnalysisJob.id < cursor_job_id),
            )
        )

    rows = (
        query
        .order_by(AnalysisJob.created_at.desc(), AnalysisJob.id.desc())
        .limit(limit + 1)
        .all()
    )
    has_next = len(rows) > limit
    rows = rows[:limit]
    return AnalysisPageRead(
        items=[_analysis_list_item(job, hand) for job, hand in rows],
        next_cursor=encode_cursor(rows[-1][0]) if has_next and rows else None,
    )


@router.get("/{hand_id}", response_model=AnalysisDetail)
def get_analysis(
    hand_id: int,
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> AnalysisDetail:
    hand = db.query(Hand).filter(Hand.id == hand_id, _owner_filter(Hand, actor)).first()
    if hand is None and actor.user_id is not None:
        shared_hand = (
            db.query(SharedHand)
            .filter(SharedHand.hand_id == hand_id, SharedHand.recipient_user_id == actor.user_id)
            .first()
        )
        if shared_hand is not None:
            hand = db.get(Hand, hand_id)
    if hand is None:
        raise HTTPException(status_code=404, detail="Hand not found")

    job = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.hand_id == hand_id)
        .order_by(AnalysisJob.created_at.desc())
        .first()
    )
    job_read = public_job_read(job) if job else None
    if job_read is not None and job_read.solver_output_json is not None:
        job_read = job_read.model_copy(
            update={
                "solver_output_json": add_decision_details(
                    job_read.solver_output_json,
                    build_solver_input(hand),
                )
            }
        )

    return AnalysisDetail(
        hand=HandRead.model_validate(hand),
        job=job_read,
    )


@router.post("/{hand_id}/retry", response_model=AnalysisJobRead)
def retry_analysis(
    hand_id: int,
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> AnalysisJobRead:
    try:
        job = create_analysis_job(
            db,
            hand_id,
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Hand not found") from exc
    except AnalysisPausedError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return public_job_read(job)


@router.post("/{hand_id}/cancel", response_model=AnalysisJobRead)
def cancel_analysis(
    hand_id: int,
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> AnalysisJobRead:
    hand = db.query(Hand).filter(Hand.id == hand_id, _owner_filter(Hand, actor)).first()
    if hand is None:
        raise HTTPException(status_code=404, detail="Hand not found")
    job = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.hand_id == hand_id)
        .order_by(AnalysisJob.created_at.desc())
        .first()
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    if job.status == "queued":
        job.status = "cancelled"
        job.finished_at = utc_now()
        job.worker_id = None
        job.error = None
        db.commit()
        db.refresh(job)
        return public_job_read(job)
    if job.status == "solving":
        job.cancel_requested_at = utc_now()
        db.commit()
        db.refresh(job)
        return public_job_read(job)
    return public_job_read(job)


def _owner_filter(model, actor: RequestActor):
    if actor.user_id is not None:
        return model.user_id == actor.user_id
    return model.guest_session_id == actor.guest_session_id


def visible_board_for_history(board: list[str], action_history: list[dict[str, Any]]) -> list[str]:
    visible_card_count = 0
    for entry in action_history:
        visible_card_count = max(visible_card_count, BOARD_CARDS_BY_STREET.get(str(entry.get("street")), 0))
    return board[:visible_card_count]


def _analysis_list_item(job: AnalysisJob, hand: Hand) -> AnalysisListItem:
    return AnalysisListItem(
        job_id=job.id,
        hand_id=hand.id,
        created_at=job.created_at,
        hero_hand=hand.hero_cards,
        board=visible_board_for_history(hand.board_json, hand.action_history_json),
        status=job.status,
        error=public_error_message(job),
    )


def public_job_read(job: AnalysisJob) -> AnalysisJobRead:
    read = AnalysisJobRead.model_validate(job)
    return read.model_copy(update={"error": public_error_message(job)})


def public_error_message(job: AnalysisJob) -> str | None:
    if job.cancel_requested_at is not None:
        return "Cancellation requested. The current solve will stop before its result is stored."
    if not job.error:
        return None
    if job.status == "unsupported":
        return "This hand follows a line the configured solver does not support."
    if job.status == "failed":
        return "Analysis failed. Retry it, and contact support if the problem continues."
    return "Analysis could not be completed."


def encode_cursor(job: AnalysisJob) -> str:
    created_at = job.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    payload = {"created_at": created_at.astimezone(timezone.utc).isoformat(), "job_id": job.id}
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
        created_at = datetime.fromisoformat(str(payload["created_at"]))
        job_id = int(payload["job_id"])
        if job_id < 1:
            raise ValueError
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid analysis cursor") from exc
    return created_at, job_id
