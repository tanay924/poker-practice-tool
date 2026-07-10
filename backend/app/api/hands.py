from __future__ import annotations

import hashlib
import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.analysis.service import AnalysisPausedError, AnalysisQueueLimitError, GuestAnalysisLimitError, create_analysis_job
from app.auth import RequestActor, require_actor
from app.db import get_db
from app.hands.validator import HandValidationError, validate_hand_payload
from app.models import AnalysisJob, DecisionFact, Hand, SharedHand, StudySpot
from app.schemas import AnalysisJobRead, HandCreate, HandRead

router = APIRouter(prefix="/api/hands", tags=["hands"])


@router.post("", response_model=HandRead)
def create_hand(
    payload: HandCreate,
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> Hand:
    try:
        validate_hand_payload(payload.model_dump())
    except HandValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    clean_key = _clean_idempotency_key(idempotency_key)
    fingerprint = _hand_fingerprint(payload) if clean_key else None
    if clean_key:
        existing = db.query(Hand).filter(Hand.idempotency_key == clean_key).first()
        if existing is not None:
            return _existing_idempotent_hand(existing, actor, fingerprint)

    hand = Hand(
        **payload.model_dump(),
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        idempotency_key=clean_key,
        idempotency_fingerprint=fingerprint,
    )
    db.add(hand)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if clean_key:
            existing = db.query(Hand).filter(Hand.idempotency_key == clean_key).first()
            if existing is not None:
                return _existing_idempotent_hand(existing, actor, fingerprint)
        raise HTTPException(status_code=409, detail="This hand could not be saved safely; please retry.") from exc
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


@router.delete("/{hand_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hand(
    hand_id: int,
    db: Session = Depends(get_db),
    actor: RequestActor = Depends(require_actor),
) -> Response:
    hand = db.query(Hand).filter(Hand.id == hand_id, _owner_filter(Hand, actor)).first()
    if hand is None:
        raise HTTPException(status_code=404, detail="Hand not found")

    db.query(StudySpot).filter(StudySpot.source_hand_id == hand_id).delete(synchronize_session=False)
    db.query(DecisionFact).filter(DecisionFact.hand_id == hand_id).delete(synchronize_session=False)
    db.query(SharedHand).filter(SharedHand.hand_id == hand_id).delete(synchronize_session=False)
    db.query(AnalysisJob).filter(AnalysisJob.hand_id == hand_id).delete(synchronize_session=False)
    db.delete(hand)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    except AnalysisPausedError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _owner_filter(model, actor: RequestActor):
    if actor.user_id is not None:
        return model.user_id == actor.user_id
    return model.guest_session_id == actor.guest_session_id


def _clean_idempotency_key(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", cleaned):
        raise HTTPException(status_code=422, detail="Idempotency-Key must be 8-128 safe characters")
    return cleaned


def _hand_fingerprint(payload: HandCreate) -> str:
    canonical = json.dumps(payload.model_dump(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _existing_idempotent_hand(hand: Hand, actor: RequestActor, fingerprint: str | None) -> Hand:
    owns_hand = (
        actor.user_id is not None and hand.user_id == actor.user_id
    ) or (
        actor.user_id is None and hand.guest_session_id == actor.guest_session_id
    )
    if not owns_hand:
        raise HTTPException(status_code=409, detail="This idempotency key has already been used")
    if hand.idempotency_fingerprint != fingerprint:
        raise HTTPException(status_code=409, detail="Idempotency key was reused with different hand data")
    return hand
