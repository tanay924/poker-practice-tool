from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

AnalysisStatus = Literal["queued", "solving", "ready", "failed", "unsupported"]


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


class AnalysisDetail(BaseModel):
    hand: HandRead
    job: AnalysisJobRead | None


class RangeImportRequest(BaseModel):
    name: str
    spot: str
    stack_bb: int
    actions: dict[str, dict[str, float]]


class RangeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    spot: str
    stack_bb: int
    source: str
    range_json: dict[str, Any]
    created_at: datetime


class ProfileUpsertRequest(BaseModel):
    username: str = Field(min_length=2, max_length=24)


class ProfileRead(BaseModel):
    username: str
    user_id: str


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
