from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.env import load_local_env


load_local_env()


def _database_url() -> str:
    return os.getenv("POKER_TRAINER_DB_URL", "sqlite:///./data/poker_trainer.sqlite3")


DATABASE_URL = _database_url()

if DATABASE_URL.startswith("sqlite:///"):
    db_path = DATABASE_URL.replace("sqlite:///", "", 1)
    if db_path not in (":memory:", ""):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_runtime_columns()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_runtime_columns() -> None:
    _ensure_columns(
        "hands",
        {
            "user_id": "VARCHAR(64)",
            "guest_session_id": "VARCHAR(96)",
        },
    )
    _ensure_indexes("hands", ["user_id", "guest_session_id"])
    _ensure_columns(
        "analysis_jobs",
        {
            "user_id": "VARCHAR(64)",
            "guest_session_id": "VARCHAR(96)",
            "queued_at": "DATETIME",
            "claimed_at": "DATETIME",
            "worker_id": "VARCHAR(96)",
            "attempt_count": "INTEGER DEFAULT 0 NOT NULL",
        },
    )
    _ensure_indexes("analysis_jobs", ["user_id", "guest_session_id", "queued_at"])
    with engine.begin() as connection:
        connection.execute(text("UPDATE analysis_jobs SET queued_at = created_at WHERE queued_at IS NULL"))
        connection.execute(text("UPDATE analysis_jobs SET attempt_count = 0 WHERE attempt_count IS NULL"))


def _ensure_columns(table_name: str, columns: dict[str, str]) -> None:
    inspector = inspect(engine)
    existing = {column["name"] for column in inspector.get_columns(table_name)}
    for column_name, column_type in columns.items():
        if column_name not in existing:
            with engine.begin() as connection:
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))


def _ensure_indexes(table_name: str, column_names: list[str]) -> None:
    for column_name in column_names:
        inspector = inspect(engine)
        indexes = {index["name"] for index in inspector.get_indexes(table_name)}
        index_name = f"ix_{table_name}_{column_name}"
        if index_name not in indexes:
            with engine.begin() as connection:
                connection.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_name})"))
