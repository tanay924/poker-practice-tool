from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

AnalysisStatus = Literal["queued", "solving", "ready", "failed", "unsupported", "cancelled"]


class HandCreate(BaseModel):
    hero_position: str = "SB"
    villain_position: str = "BB"
    hero_cards: str
    villain_cards: str
    board_json: list[str] = Field(min_length=3, max_length=5)
    stack_bb: int = 100
    pot: float
    action_history_json: list[dict[str, Any]]
    result_json: dict[str, Any]


class HandRead(HandCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class AnalysisJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hand_id: int
    status: AnalysisStatus
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    lease_expires_at: datetime | None = None
    heartbeat_at: datetime | None = None
    cancel_requested_at: datetime | None = None
    error: str | None = None
    solver_input_json: dict[str, Any] | None = None
    solver_output_json: dict[str, Any] | None = None


class AnalysisListItem(BaseModel):
    job_id: int
    hand_id: int
    created_at: datetime
    hero_hand: str
    board: list[str]
    status: AnalysisStatus
    error: str | None = None


class AnalysisPageRead(BaseModel):
    items: list[AnalysisListItem]
    next_cursor: str | None = None


class AnalysisControlRead(BaseModel):
    enabled: bool
    message: str
    updated_at: datetime


class AnalysisControlUpdate(BaseModel):
    enabled: bool
    message: str = Field(min_length=1, max_length=240)


class AnalysisDetail(BaseModel):
    hand: HandRead
    job: AnalysisJobRead | None


class RangeImportRequest(BaseModel):
    name: str
    spot: str
    stack_bb: int
    actions: dict[str, dict[str, float]]
    version: str = Field(default="admin-import", min_length=1, max_length=96)
    provenance: str = Field(default="admin-import", min_length=1, max_length=240)


class RangeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    spot: str
    stack_bb: int
    source: str
    version: str
    provenance: str
    range_json: dict[str, Any]
    created_at: datetime


class ProfileUpsertRequest(BaseModel):
    username: str = Field(min_length=2, max_length=24)


class ProfileRead(BaseModel):
    username: str
    user_id: str


class AccountExportRead(BaseModel):
    exported_at: datetime
    profile: ProfileRead | None
    hands: list[dict[str, Any]]
    analysis_jobs: list[dict[str, Any]]
    friend_requests: list[dict[str, Any]]
    friendships: list[dict[str, Any]]
    shared_hands: list[dict[str, Any]]


class AccountDeletionRead(BaseModel):
    deleted_hands: int
    deleted_analysis_jobs: int
    deleted_study_spots: int
    deleted_shared_hands: int
    deleted_social_rows: int
    external_auth_deleted: bool
    message: str


class GuestSessionRead(BaseModel):
    expires_at: datetime
    analysis_remaining: int
    preflop_remaining: int


class FriendRequestCreate(BaseModel):
    username: str = Field(min_length=2, max_length=24)


class FriendRequestRead(BaseModel):
    id: int
    requester_username: str
    recipient_username: str
    status: str
    created_at: datetime


class FriendRead(BaseModel):
    user_id: str
    username: str


class BlockUserRequest(BaseModel):
    username: str = Field(min_length=2, max_length=24)


class BlockRead(BaseModel):
    user_id: str
    username: str
    created_at: datetime


class ReportCreate(BaseModel):
    username: str | None = Field(default=None, min_length=2, max_length=24)
    share_id: int | None = None
    reason: str = Field(min_length=2, max_length=80)
    details: str | None = Field(default=None, max_length=1000)


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reporter_user_id: str
    reported_user_id: str | None
    shared_hand_id: int | None
    reason: str
    details: str | None
    status: str
    created_at: datetime


class NotificationCounts(BaseModel):
    pending_friend_requests: int
    unread_shared_hands: int


class ShareHandRequest(BaseModel):
    hand_id: int
    username: str = Field(min_length=2, max_length=24)


class SharedHandRead(BaseModel):
    id: int
    hand_id: int
    owner_username: str
    hero_hand: str
    board: list[str]
    status: AnalysisStatus | None = None
    created_at: datetime
    read_at: datetime | None = None


class StatsOverview(BaseModel):
    hands_played: int


class StatsAnalyzed(BaseModel):
    hands_analyzed: int
    sample_size: int
    preflop_decisions_reviewed: int
    preflop_correct: int
    preflop_accuracy: float | None
    postflop_decisions_reviewed: int
    postflop_mistakes: int
    biggest_leak: str


class StatsAccuracyRow(BaseModel):
    label: str
    decisions: int
    correct: int
    accuracy: float | None


class StatsMistakeRow(BaseModel):
    label: str
    decisions: int
    mistakes: int


class StatsCountRow(BaseModel):
    label: str
    count: int


class StatsRecent(BaseModel):
    hands_played_7d: int
    hands_analyzed_7d: int
    hands_played_30d: int
    hands_analyzed_30d: int
    preflop_accuracy_30d: float | None


class StudyRecommendation(BaseModel):
    label: str
    detail: str
    to: str


class StatsRead(BaseModel):
    overall: StatsOverview
    analyzed: StatsAnalyzed
    preflop_by_position: list[StatsAccuracyRow]
    preflop_by_spot: list[StatsAccuracyRow]
    preflop_mistake_types: list[StatsCountRow]
    postflop_by_street: list[StatsMistakeRow]
    postflop_by_action: list[StatsMistakeRow]
    postflop_by_situation: list[StatsMistakeRow]
    recent: StatsRecent
    recommendations: list[StudyRecommendation]


class StudySpotRead(BaseModel):
    street: str
    node: str
    hero_hand: str
    board: list[str]
    line: list[str]
    tags: list[str]
    hero_action: str
    best_action: str
    verdict: str
    confidence: str | None = None
    solver_strategy: dict[str, float]


class StudySpotSourceRead(BaseModel):
    street: str
    node: str
    tags: list[str]


class SimilarStudySpotsRead(BaseModel):
    source: StudySpotSourceRead
    spots: list[StudySpotRead]
