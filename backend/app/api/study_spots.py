from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import RequestActor, require_actor
from app.db import get_db
from app.models import Hand, SharedHand, StudySpot
from app.schemas import SimilarStudySpotsRead, StudySpotSourceRead
from app.study_spots import similar_spots, study_spot_read

router = APIRouter(prefix="/api/study-spots", tags=["study-spots"])


@router.get("/similar", response_model=SimilarStudySpotsRead)
def get_similar_study_spots(
    hand_id: int,
    street: str,
    node: str | None = None,
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> SimilarStudySpotsRead:
    hand = visible_hand(db, hand_id, actor)
    if hand is None:
        raise HTTPException(status_code=404, detail="Hand not found")

    source = source_spot(db, hand.id, street, node)
    if source is None:
        raise HTTPException(status_code=404, detail="Study spot not found")

    spots = similar_spots(db, source, limit=limit)
    return SimilarStudySpotsRead(
        source=StudySpotSourceRead(street=source.street, node=source.node, tags=source.tags_json),
        spots=[study_spot_read(spot) for spot in spots],
    )


def visible_hand(db: Session, hand_id: int, actor: RequestActor) -> Hand | None:
    if actor.user_id is not None:
        hand = db.query(Hand).filter(Hand.id == hand_id, Hand.user_id == actor.user_id).first()
        if hand is not None:
            return hand
        shared = db.query(SharedHand).filter(SharedHand.hand_id == hand_id, SharedHand.recipient_user_id == actor.user_id).first()
        return db.get(Hand, hand_id) if shared is not None else None
    return db.query(Hand).filter(Hand.id == hand_id, Hand.guest_session_id == actor.guest_session_id).first()


def source_spot(db: Session, hand_id: int, street: str, node: str | None) -> StudySpot | None:
    query = db.query(StudySpot).filter(StudySpot.source_hand_id == hand_id, StudySpot.street == street.lower())
    if node:
        query = query.filter(StudySpot.node == node)
    return query.order_by(StudySpot.id.asc()).first()
