from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth import AuthUser, require_current_user
from app.db import get_db
from app.models import AnalysisJob, DecisionFact, FriendRequest, Friendship, Hand, SharedHand, StudySpot, UserBlock, UserProfile, UserReport, utc_now
from app.schemas import AccountDeletionRead, AccountExportRead, ProfileRead

router = APIRouter(prefix="/api/account", tags=["account"])


@router.get("/export", response_model=AccountExportRead)
def export_account(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> AccountExportRead:
    user_id = current_user.user_id
    profile = db.get(UserProfile, user_id)
    hands = db.query(Hand).filter(Hand.user_id == user_id).order_by(Hand.created_at.asc(), Hand.id.asc()).all()
    hand_ids = [hand.id for hand in hands]
    jobs = (
        db.query(AnalysisJob)
        .filter(or_(AnalysisJob.user_id == user_id, AnalysisJob.hand_id.in_(hand_ids) if hand_ids else False))
        .order_by(AnalysisJob.created_at.asc(), AnalysisJob.id.asc())
        .all()
    )
    requests = (
        db.query(FriendRequest)
        .filter(or_(FriendRequest.requester_user_id == user_id, FriendRequest.recipient_user_id == user_id))
        .order_by(FriendRequest.created_at.asc(), FriendRequest.id.asc())
        .all()
    )
    friendships = (
        db.query(Friendship)
        .filter(or_(Friendship.user_a_id == user_id, Friendship.user_b_id == user_id))
        .order_by(Friendship.created_at.asc(), Friendship.id.asc())
        .all()
    )
    shares = (
        db.query(SharedHand)
        .filter(or_(SharedHand.owner_user_id == user_id, SharedHand.recipient_user_id == user_id))
        .order_by(SharedHand.created_at.asc(), SharedHand.id.asc())
        .all()
    )

    return AccountExportRead(
        exported_at=utc_now(),
        profile=ProfileRead(user_id=profile.user_id, username=profile.username) if profile else None,
        hands=[_json_model(hand) for hand in hands],
        analysis_jobs=[_json_model(job) for job in jobs],
        friend_requests=[_json_model(request) for request in requests],
        friendships=[_json_model(friendship) for friendship in friendships],
        shared_hands=[_json_model(share) for share in shares],
    )


@router.delete("", response_model=AccountDeletionRead)
def delete_account(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> AccountDeletionRead:
    user_id = current_user.user_id
    external_auth_deleted = delete_external_supabase_user(user_id)
    hand_ids = [row[0] for row in db.execute(select(Hand.id).where(Hand.user_id == user_id)).all()]
    job_filter = [AnalysisJob.user_id == user_id]
    if hand_ids:
        job_filter.append(AnalysisJob.hand_id.in_(hand_ids))
    job_ids = [row[0] for row in db.execute(select(AnalysisJob.id).where(or_(*job_filter))).all()]

    study_spot_filter = []
    if hand_ids:
        study_spot_filter.append(StudySpot.source_hand_id.in_(hand_ids))
    if job_ids:
        study_spot_filter.append(StudySpot.source_job_id.in_(job_ids))
    study_spot_count = 0
    if study_spot_filter:
        study_spot_count = db.query(StudySpot).filter(or_(*study_spot_filter)).delete(synchronize_session=False)
    if hand_ids:
        db.query(DecisionFact).filter(DecisionFact.hand_id.in_(hand_ids)).delete(synchronize_session=False)
    block_count = db.query(UserBlock).filter(
        or_(UserBlock.blocker_user_id == user_id, UserBlock.blocked_user_id == user_id)
    ).delete(synchronize_session=False)
    report_count = db.query(UserReport).filter(UserReport.reporter_user_id == user_id).delete(synchronize_session=False)

    shared_hand_count = db.query(SharedHand).filter(
        or_(
            SharedHand.owner_user_id == user_id,
            SharedHand.recipient_user_id == user_id,
            SharedHand.hand_id.in_(hand_ids) if hand_ids else False,
        )
    ).delete(synchronize_session=False)
    job_count = db.query(AnalysisJob).filter(or_(*job_filter)).delete(synchronize_session=False)

    hand_count = 0
    if hand_ids:
        hand_count = db.query(Hand).filter(Hand.id.in_(hand_ids)).delete(synchronize_session=False)

    request_count = db.query(FriendRequest).filter(
        or_(FriendRequest.requester_user_id == user_id, FriendRequest.recipient_user_id == user_id)
    ).delete(synchronize_session=False)
    friendship_count = db.query(Friendship).filter(
        or_(Friendship.user_a_id == user_id, Friendship.user_b_id == user_id)
    ).delete(synchronize_session=False)
    profile_count = db.query(UserProfile).filter(UserProfile.user_id == user_id).delete(synchronize_session=False)
    db.commit()

    social_count = request_count + friendship_count + profile_count + block_count + report_count
    return AccountDeletionRead(
        deleted_hands=hand_count,
        deleted_analysis_jobs=job_count,
        deleted_study_spots=study_spot_count,
        deleted_shared_hands=shared_hand_count,
        deleted_social_rows=social_count,
        external_auth_deleted=external_auth_deleted,
        message=(
            "Local data and the configured external auth identity were deleted."
            if external_auth_deleted
            else "Local data deleted. Configure the server-only Supabase admin key to delete the external identity automatically."
        ),
    )


def _json_model(model) -> dict:
    return {
        key: value.isoformat() if hasattr(value, "isoformat") else value
        for key, value in vars(model).items()
        if not key.startswith("_")
    }


def delete_external_supabase_user(user_id: str) -> bool:
    project_url = (os.getenv("SUPABASE_PROJECT_URL") or "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not project_url or not service_key:
        return False
    try:
        response = httpx.delete(
            f"{project_url}/auth/v1/admin/users/{user_id}",
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
            timeout=5.0,
        )
        return response.status_code in {200, 204, 404}
    except httpx.HTTPError:
        return False
