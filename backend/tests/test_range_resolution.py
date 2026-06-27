import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import PreflopRange
from app.ranges.resolver import (
    REQUIRED_HU_SRP_SPOTS,
    RangeResolutionError,
    resolve_hu_srp_ranges,
    range_action_to_shark_string,
)


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    return TestingSession()


def insert_range(db, *, name: str, spot: str, actions: dict[str, dict[str, float]]) -> PreflopRange:
    imported = PreflopRange(
        name=name,
        spot=spot,
        stack_bb=100,
        source="test",
        range_json={
            "name": name,
            "spot": spot,
            "stack_bb": 100,
            "actions": actions,
        },
    )
    db.add(imported)
    db.commit()
    db.refresh(imported)
    return imported


def test_range_action_to_shark_string_preserves_weights() -> None:
    shark_range = range_action_to_shark_string(
        {
            "AA": {"raise": 1.0},
            "AKs": {"raise": 0.5, "fold": 0.5},
            "KQo": {"raise": 0.125, "fold": 0.875},
            "72o": {"fold": 1.0},
        },
        "raise",
    )

    assert shark_range == "AA,AKs:0.5,KQo:0.125"


def test_resolve_hu_srp_ranges_requires_sb_and_bb_imports() -> None:
    with make_session() as db:
        with pytest.raises(RangeResolutionError) as excinfo:
            resolve_hu_srp_ranges(db, stack_bb=100)

    message = str(excinfo.value)
    assert REQUIRED_HU_SRP_SPOTS.sb_open in message
    assert REQUIRED_HU_SRP_SPOTS.bb_call_vs_open in message


def test_resolve_hu_srp_ranges_uses_latest_imported_ranges_and_hashes() -> None:
    with make_session() as db:
        insert_range(
            db,
            name="old SB",
            spot=REQUIRED_HU_SRP_SPOTS.sb_open,
            actions={"AA": {"raise": 1.0}, "72o": {"fold": 1.0}},
        )
        latest_sb = insert_range(
            db,
            name="latest SB",
            spot=REQUIRED_HU_SRP_SPOTS.sb_open,
            actions={"AA": {"raise": 1.0}, "AKs": {"raise": 0.25, "fold": 0.75}},
        )
        latest_bb = insert_range(
            db,
            name="latest BB",
            spot=REQUIRED_HU_SRP_SPOTS.bb_call_vs_open,
            actions={"AA": {"call": 1.0}, "KQo": {"call": 0.5, "fold": 0.5}},
        )

        resolved = resolve_hu_srp_ranges(db, stack_bb=100)

    assert resolved.sb_open.range_id == latest_sb.id
    assert resolved.bb_call_vs_open.range_id == latest_bb.id
    assert resolved.sb_open.shark_range == "AA,AKs:0.25"
    assert resolved.bb_call_vs_open.shark_range == "AA,KQo:0.5"
    assert resolved.sb_open.range_hash != resolved.bb_call_vs_open.range_hash
