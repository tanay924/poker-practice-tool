from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, JSON, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Hand(Base):
    __tablename__ = "hands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    guest_session_id: Mapped[str | None] = mapped_column(String(96), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    hero_position: Mapped[str] = mapped_column(String(16), nullable=False)
    villain_position: Mapped[str] = mapped_column(String(16), nullable=False)
    hero_cards: Mapped[str] = mapped_column(String(8), nullable=False)
    villain_cards: Mapped[str] = mapped_column(String(8), nullable=False)
    board_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    stack_bb: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    pot: Mapped[float] = mapped_column(Float, nullable=False)
    action_history_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    result_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True, index=True)
    idempotency_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)

    analysis_jobs: Mapped[list["AnalysisJob"]] = relationship(back_populates="hand", cascade="all, delete-orphan")


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    hand_id: Mapped[int] = mapped_column(ForeignKey("hands.id"), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    guest_session_id: Mapped[str | None] = mapped_column(String(96), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    queued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=True, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(96), nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    solver_input_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    solver_output_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    hand: Mapped[Hand] = relationship(back_populates="analysis_jobs")


class AnalysisControl(Base):
    __tablename__ = "analysis_control"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    message: Mapped[str] = mapped_column(String(240), nullable=False, default="Analysis is available")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)


class DecisionFact(Base):
    __tablename__ = "decision_facts"
    __table_args__ = (UniqueConstraint("analysis_job_id", "decision_key", name="uq_decision_fact_job_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    analysis_job_id: Mapped[int] = mapped_column(ForeignKey("analysis_jobs.id"), nullable=False, index=True)
    hand_id: Mapped[int] = mapped_column(ForeignKey("hands.id"), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    guest_session_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    decision_key: Mapped[str] = mapped_column(String(160), nullable=False)
    street: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    position: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    spot_id: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    branch_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    hero_action: Mapped[str] = mapped_column(String(40), nullable=False)
    best_action: Mapped[str] = mapped_column(String(40), nullable=False)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    mistake_class: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    options_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    solver_version: Mapped[str | None] = mapped_column(String(96), nullable=True)


class PreflopRange(Base):
    __tablename__ = "preflop_ranges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    spot: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    stack_bb: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="json")
    version: Mapped[str] = mapped_column(String(96), nullable=False, default="unversioned")
    provenance: Mapped[str] = mapped_column(String(240), nullable=False, default="unspecified")
    range_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class SolverCache(Base):
    __tablename__ = "solver_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cache_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    solver_input_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    solver_output_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(24), nullable=False)
    username_normalized: Mapped[str] = mapped_column(String(24), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class GuestSession(Base):
    __tablename__ = "guest_sessions"

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    analysis_trials_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    preflop_trials_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    converted_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)


class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    requester_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    recipient_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_a_id", "user_b_id", name="uq_friendship_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_a_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_b_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class UserBlock(Base):
    __tablename__ = "user_blocks"
    __table_args__ = (UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_user_block_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    blocker_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    blocked_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class UserReport(Base):
    __tablename__ = "user_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reporter_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reported_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    shared_hand_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(80), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class SharedHand(Base):
    __tablename__ = "shared_hands"
    __table_args__ = (UniqueConstraint("hand_id", "recipient_user_id", name="uq_shared_hand_recipient"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    hand_id: Mapped[int] = mapped_column(ForeignKey("hands.id"), nullable=False, index=True)
    owner_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    recipient_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    hand: Mapped[Hand] = relationship()


class StudySpot(Base):
    __tablename__ = "study_spots"
    __table_args__ = (UniqueConstraint("source_job_id", "spot_key", name="uq_study_spot_source_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_job_id: Mapped[int] = mapped_column(ForeignKey("analysis_jobs.id"), nullable=False, index=True)
    source_hand_id: Mapped[int] = mapped_column(ForeignKey("hands.id"), nullable=False, index=True)
    spot_key: Mapped[str] = mapped_column(String(180), nullable=False)
    street: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    node: Mapped[str] = mapped_column(String(240), nullable=False)
    hero_hand: Mapped[str] = mapped_column(String(8), nullable=False)
    board_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    line_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    tags_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    solver_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    visibility: Mapped[str] = mapped_column(String(24), nullable=False, default="curated_public", index=True)
    provenance: Mapped[str] = mapped_column(String(32), nullable=False, default="synthetic")
    quality_status: Mapped[str] = mapped_column(String(24), nullable=False, default="validated", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
