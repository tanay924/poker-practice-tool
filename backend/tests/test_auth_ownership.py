from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import AuthUser, require_admin_user, require_current_user
from app.db import Base, get_db
from app.main import app
from app.models import AnalysisJob, Hand


def hand_payload(hero_cards: str = "AsKd") -> dict[str, object]:
    return {
        "hero_position": "SB",
        "villain_position": "BB",
        "hero_cards": hero_cards,
        "villain_cards": "QcJh",
        "board_json": ["Ks", "7d", "2c", "4h", "9s"],
        "stack_bb": 100,
        "pot": 5.0,
        "action_history_json": [
            {
                "street": "preflop",
                "actor": "SB",
                "action": "raise",
                "amount_bb": 2.5,
                "pot_after": 2.5,
                "node": "SB preflop decision",
            }
        ],
        "result_json": {"winner": "hero", "reason": "villain_folded_preflop"},
    }


@pytest.fixture()
def api_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, sessionmaker[Session]]]:
    monkeypatch.setenv("POKER_TRAINER_WORKER_AUTOSTART", "0")
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_db() -> Iterator[Session]:
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            yield client, TestingSession
    finally:
        app.dependency_overrides.clear()


def as_user(user_id: str, email: str = "user@example.com"):
    return lambda: AuthUser(user_id=user_id, email=email)


def test_anonymous_users_cannot_save_hands(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client

    response = client.post("/api/hands", json=hand_payload())

    assert response.status_code == 401


def test_saved_hands_are_owned_by_authenticated_user(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    app.dependency_overrides[require_current_user] = as_user("user-a")

    response = client.post("/api/hands", json=hand_payload())

    assert response.status_code == 200
    with TestingSession() as db:
        hand = db.get(Hand, response.json()["id"])
        assert hand is not None
        assert hand.user_id == "user-a"


def test_analysis_list_is_scoped_to_current_user(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    with TestingSession() as db:
        own_hand = Hand(user_id="user-a", **hand_payload("AsKd"))
        other_hand = Hand(user_id="user-b", **hand_payload("Td9d"))
        db.add_all([own_hand, other_hand])
        db.commit()
        db.refresh(own_hand)
        db.refresh(other_hand)
        db.add_all([
            AnalysisJob(hand_id=own_hand.id, user_id="user-a", status="ready"),
            AnalysisJob(hand_id=other_hand.id, user_id="user-b", status="ready"),
        ])
        db.commit()

    app.dependency_overrides[require_current_user] = as_user("user-a")
    response = client.get("/api/analysis")

    assert response.status_code == 200
    assert [row["hero_hand"] for row in response.json()] == ["AsKd"]


def test_analysis_detail_does_not_expose_other_users_hands(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    with TestingSession() as db:
        other_hand = Hand(user_id="user-b", **hand_payload())
        db.add(other_hand)
        db.commit()
        db.refresh(other_hand)
        hand_id = other_hand.id

    app.dependency_overrides[require_current_user] = as_user("user-a")
    response = client.get(f"/api/analysis/{hand_id}")

    assert response.status_code == 404


def test_range_import_requires_admin_user(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    payload = {
        "name": "HU 100bb SB open",
        "spot": "HU_SB_OPEN_100BB",
        "stack_bb": 100,
        "actions": {"AA": {"raise": 1.0}},
    }
    app.dependency_overrides[require_current_user] = as_user("user-a")

    denied = client.post("/api/ranges/import", json=payload)
    assert denied.status_code == 403

    app.dependency_overrides[require_admin_user] = as_user("user-a")
    allowed = client.post("/api/ranges/import", json=payload)
    assert allowed.status_code == 200
