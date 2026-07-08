from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.analysis.decision_details import add_decision_details
from app.analysis.service import build_solver_input
from app.auth import AuthUser, require_current_user
from app.db import get_db
from app.models import AnalysisJob, Hand
from app.schemas import AnalysisDetail, AnalysisJobRead, AnalysisListItem, HandRead

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
    current_user: AuthUser = Depends(require_current_user),
) -> list[AnalysisListItem]:
    rows = (
        db.query(AnalysisJob, Hand)
        .join(Hand, Hand.id == AnalysisJob.hand_id)
        .filter(Hand.user_id == current_user.user_id)
        .order_by(AnalysisJob.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        AnalysisListItem(
            job_id=job.id,
            hand_id=hand.id,
            created_at=job.created_at,
            hero_hand=hand.hero_cards,
            board=visible_board_for_history(hand.board_json, hand.action_history_json),
            status=job.status,
            error=job.error,
        )
        for job, hand in rows
    ]


@router.get("/{hand_id}", response_model=AnalysisDetail)
def get_analysis(
    hand_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> AnalysisDetail:
    hand = db.query(Hand).filter(Hand.id == hand_id, Hand.user_id == current_user.user_id).first()
    if hand is None:
        raise HTTPException(status_code=404, detail="Hand not found")

    job = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.hand_id == hand_id)
        .order_by(AnalysisJob.created_at.desc())
        .first()
    )
    job_read = AnalysisJobRead.model_validate(job) if job else None
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


def visible_board_for_history(board: list[str], action_history: list[dict[str, Any]]) -> list[str]:
    visible_card_count = 0
    for entry in action_history:
        visible_card_count = max(visible_card_count, BOARD_CARDS_BY_STREET.get(str(entry.get("street")), 0))
    return board[:visible_card_count]
