"""Create a consistent SQLite backup without exposing application data in logs."""

from __future__ import annotations

import argparse
from pathlib import Path
import sqlite3


def backup(source: Path, destination: Path) -> None:
    source = source.resolve()
    destination = destination.resolve()
    if source == destination:
        raise ValueError("Backup destination must differ from the database")
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source) as source_db, sqlite3.connect(destination) as destination_db:
        source_db.backup(destination_db)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path("backend/data/poker_trainer.sqlite3"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    backup(args.database, args.output)
    print(f"Backup written to {args.output.resolve()}")
