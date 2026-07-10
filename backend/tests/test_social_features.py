from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import AuthUser, RequestActor, require_actor, require_admin_user, require_current_user
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
                "spot_id": "HU_SB_OPEN_2_5BB_OR_LIMP_100BB",
                "hand_key": "AKo",
                "automatic": False,
            },
            {
                "street": "preflop",
                "actor": "BB",
                "action": "call",
                "amount_bb": 2.5,
                "pot_after": 5,
                "node": "BB versus SB open",
                "spot_id": "HU_SRP_BB_VS_SB_OPEN_100BB",
                "hand_key": "QJo",
                "automatic": True,
            },
        ],
        "result_json": {"winner": "showdown", "reason": "river_completed"},
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


def set_user(user_id: str) -> None:
    app.dependency_overrides[require_current_user] = as_user(user_id)
    app.dependency_overrides[require_actor] = lambda: RequestActor(user_id=user_id)


def create_profile(client: TestClient, user_id: str, username: str) -> dict:
    set_user(user_id)
    response = client.put("/api/social/profile", json={"username": username})
    assert response.status_code == 200
    return response.json()


def test_usernames_are_unique_case_insensitively(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    create_profile(client, "user-a", "Pocket Tens")

    set_user("user-b")
    response = client.put("/api/social/profile", json={"username": " pocket   tens "})

    assert response.status_code == 409
    assert response.json()["detail"] == "Username is already taken"


def test_username_must_have_visible_characters(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    set_user("user-a")

    response = client.put("/api/social/profile", json={"username": "   "})

    assert response.status_code == 422
    assert response.json()["detail"] == "Username must be between 2 and 24 characters"


def test_friend_request_acceptance_and_notifications(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    create_profile(client, "user-a", "Hero")
    create_profile(client, "user-b", "Villain")

    set_user("user-a")
    request_response = client.post("/api/social/friend-requests", json={"username": "Villain"})
    assert request_response.status_code == 200
    request_id = request_response.json()["id"]

    set_user("user-b")
    notifications = client.get("/api/social/notifications")
    assert notifications.status_code == 200
    assert notifications.json()["pending_friend_requests"] == 1

    accepted = client.post(f"/api/social/friend-requests/{request_id}/accept")
    assert accepted.status_code == 200

    friends = client.get("/api/social/friends")
    assert friends.status_code == 200
    assert [friend["username"] for friend in friends.json()] == ["Hero"]
    assert client.get("/api/social/notifications").json()["pending_friend_requests"] == 0


def test_only_accepted_friends_can_receive_shared_hands(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    create_profile(client, "user-a", "Hero")
    create_profile(client, "user-b", "Villain")

    with TestingSession() as db:
        hand = Hand(user_id="user-a", **hand_payload())
        db.add(hand)
        db.commit()
        db.refresh(hand)
        db.add(AnalysisJob(hand_id=hand.id, user_id="user-a", status="ready"))
        db.commit()
        hand_id = hand.id

    set_user("user-a")
    denied = client.post("/api/social/shared-hands", json={"hand_id": hand_id, "username": "Villain"})
    assert denied.status_code == 403

    request_id = client.post("/api/social/friend-requests", json={"username": "Villain"}).json()["id"]
    set_user("user-b")
    assert client.post(f"/api/social/friend-requests/{request_id}/accept").status_code == 200

    set_user("user-a")
    shared = client.post("/api/social/shared-hands", json={"hand_id": hand_id, "username": "Villain"})
    assert shared.status_code == 200

    set_user("user-b")
    shared_library = client.get("/api/social/shared-hands")
    assert shared_library.status_code == 200
    assert shared_library.json()[0]["hand_id"] == hand_id
    assert shared_library.json()[0]["owner_username"] == "Hero"
    assert client.get("/api/social/notifications").json()["unread_shared_hands"] == 1

    detail = client.get(f"/api/analysis/{hand_id}")
    assert detail.status_code == 200
    assert detail.json()["hand"]["id"] == hand_id

    revoked = client.delete(f"/api/social/shared-hands/{shared.json()['id']}")
    assert revoked.status_code == 204
    assert client.get("/api/social/shared-hands").json() == []

    set_user("user-a")
    shared_again = client.post("/api/social/shared-hands", json={"hand_id": hand_id, "username": "Villain"})
    assert shared_again.status_code == 200
    removed = client.delete("/api/social/friends/user-b")
    assert removed.status_code == 204

    set_user("user-b")
    assert client.get("/api/social/friends").json() == []
    assert client.get("/api/social/shared-hands").json() == []


def test_blocking_prevents_social_contact_and_reports_are_admin_visible(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    create_profile(client, "user-a", "Hero")
    create_profile(client, "user-b", "Villain")

    set_user("user-a")
    blocked = client.post("/api/social/blocks", json={"username": "Villain"})
    assert blocked.status_code == 200
    assert blocked.json()["username"] == "Villain"
    assert client.get("/api/social/blocks").json()[0]["user_id"] == "user-b"
    denied_request = client.post("/api/social/friend-requests", json={"username": "Villain"})
    assert denied_request.status_code == 403

    report = client.post("/api/social/reports", json={"username": "Villain", "reason": "harassment"})
    assert report.status_code == 200
    assert report.json()["status"] == "open"

    app.dependency_overrides[require_admin_user] = as_user("admin")
    reports = client.get("/api/admin/reports")
    assert reports.status_code == 200
    assert reports.json()[0]["reason"] == "harassment"

    unblocked = client.delete("/api/social/blocks/user-b")
    assert unblocked.status_code == 204
