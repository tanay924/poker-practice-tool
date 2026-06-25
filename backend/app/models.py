from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Hand(Base):
    __tablename__ = "hands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
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

    analysis_jobs: Mapped[list["AnalysisJob"]] = relationship(back_populates="hand", cascade="all, delete-orphan")


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    hand_id: Mapped[int] = mapped_column(ForeignKey("hands.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    solver_input_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    solver_output_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    hand: Mapped[Hand] = relationship(back_populates="analysis_jobs")


class PreflopRange(Base):
    __tablename__ = "preflop_ranges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    spot: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    stack_bb: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="json")
    range_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class SolverCache(Base):
    __tablename__ = "solver_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cache_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    solver_input_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    solver_output_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
