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
