from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.analysis.service import AnalysisQueueLimitError, GuestAnalysisLimitError, create_analysis_job
from app.auth import RequestActor, require_actor
from app.db import get_db
from app.models import Hand
from app.schemas import AnalysisJobRead, HandCreate, HandRead

router = APIRouter(prefix="/api/hands", tags=["hands"])


@router.post("", response_model=HandRead)
def create_hand(
    payload: HandCreate,
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> Hand:
    hand = Hand(**payload.model_dump(), user_id=actor.user_id, guest_session_id=actor.guest_session_id)
    db.add(hand)
    db.commit()
    db.refresh(hand)
    return hand


@router.get("", response_model=list[HandRead])
def list_hands(
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> list[Hand]:
    return (
        db.query(Hand)
        .filter(_owner_filter(Hand, actor))
        .order_by(Hand.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/{hand_id}", response_model=HandRead)
def get_hand(
    hand_id: int,
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> Hand:
    hand = db.query(Hand).filter(Hand.id == hand_id, _owner_filter(Hand, actor)).first()
    if hand is None:
        raise HTTPException(status_code=404, detail="Hand not found")
    return hand


@router.post("/{hand_id}/analyze", response_model=AnalysisJobRead)
def analyze_hand(
    hand_id: int,
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
):
    try:
        return create_analysis_job(db, hand_id, user_id=actor.user_id, guest_session_id=actor.guest_session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AnalysisQueueLimitError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except GuestAnalysisLimitError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


def _owner_filter(model, actor: RequestActor):
    if actor.user_id is not None:
        return model.user_id == actor.user_id
    return model.guest_session_id == actor.guest_session_id
