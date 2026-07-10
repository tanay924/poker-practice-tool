from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.api.analysis import visible_board_for_history
from app.auth import AuthUser, require_current_user
from app.db import get_db
from app.models import AnalysisJob, FriendRequest, Friendship, Hand, SharedHand, UserBlock, UserProfile, UserReport, utc_now
from app.schemas import (
    FriendRead,
    BlockRead,
    BlockUserRequest,
    FriendRequestCreate,
    FriendRequestRead,
    NotificationCounts,
    ProfileRead,
    ProfileUpsertRequest,
    ReportCreate,
    ReportRead,
    ShareHandRequest,
    SharedHandRead,
)

router = APIRouter(prefix="/api/social", tags=["social"])


@router.put("/profile", response_model=ProfileRead)
def upsert_profile(
    payload: ProfileUpsertRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> ProfileRead:
    username = normalize_username(payload.username)
    if len(username) < 2 or len(username) > 24:
        raise HTTPException(status_code=422, detail="Username must be between 2 and 24 characters")
    normalized = username_key(username)
    existing_owner = (
        db.query(UserProfile)
        .filter(UserProfile.username_normalized == normalized, UserProfile.user_id != current_user.user_id)
        .first()
    )
    if existing_owner is not None:
        raise HTTPException(status_code=409, detail="Username is already taken")

    profile = db.get(UserProfile, current_user.user_id)
    now = utc_now()
    if profile is None:
        profile = UserProfile(user_id=current_user.user_id, username=username, username_normalized=normalized, updated_at=now)
        db.add(profile)
    else:
        profile.username = username
        profile.username_normalized = normalized
        profile.updated_at = now
    db.commit()
    db.refresh(profile)
    return profile_read(profile)


@router.get("/profile", response_model=ProfileRead)
def get_profile(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> ProfileRead:
    return profile_read(require_profile(db, current_user.user_id))


@router.post("/friend-requests", response_model=FriendRequestRead)
def create_friend_request(
    payload: FriendRequestCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> FriendRequestRead:
    requester = require_profile(db, current_user.user_id)
    recipient = profile_by_username(db, payload.username)
    if recipient is None:
        raise HTTPException(status_code=404, detail="User not found")
    if recipient.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")
    if blocked_between(db, current_user.user_id, recipient.user_id):
        raise HTTPException(status_code=403, detail="This user is unavailable")
    if friendship_between(db, current_user.user_id, recipient.user_id) is not None:
        raise HTTPException(status_code=409, detail="You are already friends")

    existing = (
        db.query(FriendRequest)
        .filter(
            FriendRequest.status == "pending",
            or_(
                and_(
                    FriendRequest.requester_user_id == current_user.user_id,
                    FriendRequest.recipient_user_id == recipient.user_id,
                ),
                and_(
                    FriendRequest.requester_user_id == recipient.user_id,
                    FriendRequest.recipient_user_id == current_user.user_id,
                ),
            ),
        )
        .first()
    )
    if existing is not None:
        return friend_request_read(db, existing)

    request = FriendRequest(requester_user_id=requester.user_id, recipient_user_id=recipient.user_id)
    db.add(request)
    db.commit()
    db.refresh(request)
    return friend_request_read(db, request)


@router.get("/friend-requests", response_model=list[FriendRequestRead])
def list_friend_requests(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> list[FriendRequestRead]:
    requests = (
        db.query(FriendRequest)
        .filter(
            FriendRequest.status == "pending",
            or_(
                FriendRequest.requester_user_id == current_user.user_id,
                FriendRequest.recipient_user_id == current_user.user_id,
            ),
        )
        .order_by(FriendRequest.created_at.desc())
        .all()
    )
    return [friend_request_read(db, request) for request in requests]


@router.post("/friend-requests/{request_id}/accept", response_model=FriendRequestRead)
def accept_friend_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> FriendRequestRead:
    request = db.get(FriendRequest, request_id)
    if request is None or request.recipient_user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if request.status != "pending":
        return friend_request_read(db, request)

    user_a_id, user_b_id = sorted([request.requester_user_id, request.recipient_user_id])
    if friendship_between(db, user_a_id, user_b_id) is None:
        db.add(Friendship(user_a_id=user_a_id, user_b_id=user_b_id))
    request.status = "accepted"
    request.responded_at = utc_now()
    db.commit()
    db.refresh(request)
    return friend_request_read(db, request)


@router.post("/friend-requests/{request_id}/decline", response_model=FriendRequestRead)
def decline_friend_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> FriendRequestRead:
    request = db.get(FriendRequest, request_id)
    if request is None or request.recipient_user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if request.status == "pending":
        request.status = "declined"
        request.responded_at = utc_now()
        db.commit()
        db.refresh(request)
    return friend_request_read(db, request)


@router.get("/friends", response_model=list[FriendRead])
def list_friends(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> list[FriendRead]:
    friendships = (
        db.query(Friendship)
        .filter(or_(Friendship.user_a_id == current_user.user_id, Friendship.user_b_id == current_user.user_id))
        .order_by(Friendship.created_at.desc())
        .all()
    )
    friend_ids = [
        friendship.user_b_id if friendship.user_a_id == current_user.user_id else friendship.user_a_id
        for friendship in friendships
    ]
    profiles = db.query(UserProfile).filter(UserProfile.user_id.in_(friend_ids)).all() if friend_ids else []
    profiles_by_id = {profile.user_id: profile for profile in profiles}
    return [
        FriendRead(user_id=friend_id, username=profiles_by_id[friend_id].username)
        for friend_id in friend_ids
        if friend_id in profiles_by_id
    ]


@router.get("/blocks", response_model=list[BlockRead])
def list_blocks(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> list[BlockRead]:
    rows = db.query(UserBlock).filter(UserBlock.blocker_user_id == current_user.user_id).order_by(UserBlock.created_at.desc()).all()
    profiles = db.query(UserProfile).filter(UserProfile.user_id.in_([row.blocked_user_id for row in rows])).all() if rows else []
    names = {profile.user_id: profile.username for profile in profiles}
    return [
        BlockRead(user_id=row.blocked_user_id, username=names.get(row.blocked_user_id, "Unknown"), created_at=row.created_at)
        for row in rows
    ]


@router.post("/blocks", response_model=BlockRead)
def block_user(
    payload: BlockUserRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> BlockRead:
    recipient = profile_by_username(db, payload.username)
    if recipient is None:
        raise HTTPException(status_code=404, detail="User not found")
    if recipient.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="You cannot block yourself")
    block = db.query(UserBlock).filter(
        UserBlock.blocker_user_id == current_user.user_id,
        UserBlock.blocked_user_id == recipient.user_id,
    ).first()
    if block is None:
        block = UserBlock(blocker_user_id=current_user.user_id, blocked_user_id=recipient.user_id)
        db.add(block)
    friendship = friendship_between(db, current_user.user_id, recipient.user_id)
    if friendship is not None:
        db.delete(friendship)
    db.query(SharedHand).filter(
        or_(
            and_(SharedHand.owner_user_id == current_user.user_id, SharedHand.recipient_user_id == recipient.user_id),
            and_(SharedHand.owner_user_id == recipient.user_id, SharedHand.recipient_user_id == current_user.user_id),
        )
    ).delete(synchronize_session=False)
    db.commit()
    db.refresh(block)
    return BlockRead(user_id=recipient.user_id, username=recipient.username, created_at=block.created_at)


@router.delete("/blocks/{user_id}", status_code=204)
def unblock_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> Response:
    block = db.query(UserBlock).filter(
        UserBlock.blocker_user_id == current_user.user_id,
        UserBlock.blocked_user_id == user_id,
    ).first()
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    db.delete(block)
    db.commit()
    return Response(status_code=204)


@router.delete("/friends/{friend_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(
    friend_user_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> Response:
    friendship = friendship_between(db, current_user.user_id, friend_user_id)
    if friendship is None:
        raise HTTPException(status_code=404, detail="Friendship not found")
    db.delete(friendship)
    db.query(SharedHand).filter(
        or_(
            and_(SharedHand.owner_user_id == current_user.user_id, SharedHand.recipient_user_id == friend_user_id),
            and_(SharedHand.owner_user_id == friend_user_id, SharedHand.recipient_user_id == current_user.user_id),
        )
    ).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/notifications", response_model=NotificationCounts)
def notification_counts(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> NotificationCounts:
    pending_friend_requests = (
        db.query(FriendRequest)
        .filter(
            FriendRequest.recipient_user_id == current_user.user_id,
            FriendRequest.status == "pending",
        )
        .count()
    )
    unread_shared_hands = (
        db.query(SharedHand)
        .filter(SharedHand.recipient_user_id == current_user.user_id, SharedHand.read_at.is_(None))
        .count()
    )
    return NotificationCounts(
        pending_friend_requests=pending_friend_requests,
        unread_shared_hands=unread_shared_hands,
    )


@router.post("/shared-hands", response_model=SharedHandRead)
def share_hand(
    payload: ShareHandRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> SharedHandRead:
    owner = require_profile(db, current_user.user_id)
    recipient = profile_by_username(db, payload.username)
    if recipient is None:
        raise HTTPException(status_code=404, detail="User not found")
    if recipient.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="You cannot share a hand with yourself")
    if blocked_between(db, current_user.user_id, recipient.user_id):
        raise HTTPException(status_code=403, detail="This user is unavailable")
    if friendship_between(db, current_user.user_id, recipient.user_id) is None:
        raise HTTPException(status_code=403, detail="You can only share hands with accepted friends")

    hand = db.query(Hand).filter(Hand.id == payload.hand_id, Hand.user_id == current_user.user_id).first()
    if hand is None:
        raise HTTPException(status_code=404, detail="Hand not found")

    shared = (
        db.query(SharedHand)
        .filter(
            SharedHand.hand_id == hand.id,
            SharedHand.owner_user_id == current_user.user_id,
            SharedHand.recipient_user_id == recipient.user_id,
        )
        .first()
    )
    if shared is None:
        shared = SharedHand(hand_id=hand.id, owner_user_id=current_user.user_id, recipient_user_id=recipient.user_id)
        db.add(shared)
        db.commit()
        db.refresh(shared)
    return shared_hand_read(db, shared, owner)


@router.get("/shared-hands", response_model=list[SharedHandRead])
def list_shared_hands(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> list[SharedHandRead]:
    shares = (
        db.query(SharedHand)
        .filter(SharedHand.recipient_user_id == current_user.user_id)
        .order_by(SharedHand.created_at.desc())
        .all()
    )
    return [shared_hand_read(db, share) for share in shares]


@router.post("/shared-hands/{share_id}/read", response_model=SharedHandRead)
def mark_shared_hand_read(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> SharedHandRead:
    share = db.get(SharedHand, share_id)
    if share is None or share.recipient_user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Shared hand not found")
    if share.read_at is None:
        share.read_at = utc_now()
        db.commit()
        db.refresh(share)
    return shared_hand_read(db, share)


@router.delete("/shared-hands/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_shared_hand(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> Response:
    share = db.get(SharedHand, share_id)
    if share is None or current_user.user_id not in {share.owner_user_id, share.recipient_user_id}:
        raise HTTPException(status_code=404, detail="Shared hand not found")
    db.delete(share)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reports", response_model=ReportRead)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_current_user),
) -> ReportRead:
    reported_user_id = None
    if payload.username:
        reported = profile_by_username(db, payload.username)
        if reported is None:
            raise HTTPException(status_code=404, detail="User not found")
        if reported.user_id == current_user.user_id:
            raise HTTPException(status_code=400, detail="You cannot report yourself")
        reported_user_id = reported.user_id
    if payload.share_id is None and reported_user_id is None:
        raise HTTPException(status_code=422, detail="A username or shared hand is required")
    if payload.share_id is not None:
        share = db.get(SharedHand, payload.share_id)
        if share is None or current_user.user_id not in {share.owner_user_id, share.recipient_user_id}:
            raise HTTPException(status_code=404, detail="Shared hand not found")
        reported_user_id = reported_user_id or (
            share.owner_user_id if share.owner_user_id != current_user.user_id else share.recipient_user_id
        )
    report = UserReport(
        reporter_user_id=current_user.user_id,
        reported_user_id=reported_user_id,
        shared_hand_id=payload.share_id,
        reason=payload.reason.strip(),
        details=payload.details.strip() if payload.details else None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def normalize_username(username: str) -> str:
    return " ".join(username.strip().split())


def username_key(username: str) -> str:
    return normalize_username(username).casefold()


def require_profile(db: Session, user_id: str) -> UserProfile:
    profile = db.get(UserProfile, user_id)
    if profile is None:
        raise HTTPException(status_code=409, detail="Create a username before using friends")
    return profile


def profile_by_username(db: Session, username: str) -> UserProfile | None:
    return db.query(UserProfile).filter(UserProfile.username_normalized == username_key(username)).first()


def profile_read(profile: UserProfile) -> ProfileRead:
    return ProfileRead(user_id=profile.user_id, username=profile.username)


def friendship_between(db: Session, first_user_id: str, second_user_id: str) -> Friendship | None:
    user_a_id, user_b_id = sorted([first_user_id, second_user_id])
    return db.query(Friendship).filter(Friendship.user_a_id == user_a_id, Friendship.user_b_id == user_b_id).first()


def blocked_between(db: Session, first_user_id: str, second_user_id: str) -> bool:
    return db.query(UserBlock).filter(
        or_(
            and_(UserBlock.blocker_user_id == first_user_id, UserBlock.blocked_user_id == second_user_id),
            and_(UserBlock.blocker_user_id == second_user_id, UserBlock.blocked_user_id == first_user_id),
        )
    ).first() is not None


def friend_request_read(db: Session, request: FriendRequest) -> FriendRequestRead:
    requester = db.get(UserProfile, request.requester_user_id)
    recipient = db.get(UserProfile, request.recipient_user_id)
    return FriendRequestRead(
        id=request.id,
        requester_username=requester.username if requester else "Unknown",
        recipient_username=recipient.username if recipient else "Unknown",
        status=request.status,
        created_at=request.created_at,
    )


def shared_hand_read(db: Session, share: SharedHand, owner: UserProfile | None = None) -> SharedHandRead:
    hand = db.get(Hand, share.hand_id)
    if hand is None:
        raise HTTPException(status_code=404, detail="Hand not found")
    owner_profile = owner or db.get(UserProfile, share.owner_user_id)
    job = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.hand_id == hand.id)
        .order_by(AnalysisJob.created_at.desc())
        .first()
    )
    return SharedHandRead(
        id=share.id,
        hand_id=hand.id,
        owner_username=owner_profile.username if owner_profile else "Unknown",
        hero_hand=hand.hero_cards,
        board=visible_board_for_history(hand.board_json, hand.action_history_json),
        status=job.status if job else None,
        created_at=share.created_at,
        read_at=share.read_at,
    )
