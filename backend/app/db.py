from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


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
    _ensure_auth_columns()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_auth_columns() -> None:
    for table_name in ("hands", "analysis_jobs"):
        inspector = inspect(engine)
        columns = {column["name"] for column in inspector.get_columns(table_name)}
        if "user_id" not in columns:
            with engine.begin() as connection:
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN user_id VARCHAR(64)"))

        index_name = f"ix_{table_name}_user_id"
        inspector = inspect(engine)
        indexes = {index["name"] for index in inspector.get_indexes(table_name)}
        if index_name not in indexes:
            with engine.begin() as connection:
                connection.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} (user_id)"))
