from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.analysis.service import create_analysis_job
from app.auth import AuthUser, require_current_user
from app.db import get_db
from app.models import Hand
from app.schemas import AnalysisJobRead, HandCreate, HandRead

router = APIRouter(prefix="/api/hands", tags=["hands"])


@router.post("", response_model=HandRead)
def create_hand(
    payload: HandCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> Hand:
    hand = Hand(**payload.model_dump(), user_id=current_user.user_id)
    db.add(hand)
    db.commit()
    db.refresh(hand)
    return hand


@router.get("", response_model=list[HandRead])
def list_hands(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> list[Hand]:
    return (
        db.query(Hand)
        .filter(Hand.user_id == current_user.user_id)
        .order_by(Hand.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/{hand_id}", response_model=HandRead)
def get_hand(
    hand_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> Hand:
    hand = db.query(Hand).filter(Hand.id == hand_id, Hand.user_id == current_user.user_id).first()
    if hand is None:
        raise HTTPException(status_code=404, detail="Hand not found")
    return hand


@router.post("/{hand_id}/analyze", response_model=AnalysisJobRead)
def analyze_hand(
    hand_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
):
    try:
        return create_analysis_job(db, hand_id, user_id=current_user.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
