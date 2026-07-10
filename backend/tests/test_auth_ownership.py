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
from app.models import AnalysisJob, GuestSession, Hand, StudySpot, UserProfile


def hand_payload(hero_cards: str = "AsKd") -> dict[str, object]:
    return {
        "hero_position": "SB",
        "villain_position": "BB",
        "hero_cards": hero_cards,
        "villain_cards": "QcJh",
        "board_json": ["Ks", "7d", "2c", "4h", "9s"],
        "stack_bb": 100,
        "pot": 2.5,
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


def as_actor(user_id: str):
    return lambda: RequestActor(user_id=user_id)


def test_api_responses_include_request_id(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client

    generated = client.get("/api/health")
    assert generated.status_code == 200
    assert generated.headers["X-Request-ID"]
    assert generated.headers["X-Content-Type-Options"] == "nosniff"
    assert generated.headers["X-Frame-Options"] == "DENY"

    assert client.get("/api/health/live").json() == {"status": "live"}
    assert client.get("/api/health/ready").json() == {"status": "ready", "database": "ok"}

    forwarded = client.get("/api/health", headers={"X-Request-ID": "study-run-42"})
    assert forwarded.headers["X-Request-ID"] == "study-run-42"


def test_server_issued_guest_cookie_owns_guest_data(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client

    issued = client.post("/api/guest-sessions")
    assert issued.status_code == 200
    assert "poker_trainer_guest=" in issued.headers["set-cookie"]
    assert issued.json()["analysis_remaining"] == 5

    response = client.post("/api/hands", json=hand_payload())
    assert response.status_code == 200
    with TestingSession() as db:
        hand = db.get(Hand, response.json()["id"])
        assert hand is not None
        assert hand.guest_session_id is not None
        assert len(hand.guest_session_id) == 64
        assert db.get(GuestSession, hand.guest_session_id) is not None

    queued = client.post(f"/api/hands/{response.json()['id']}/analyze")
    assert queued.status_code == 200
    refreshed = client.post("/api/guest-sessions")
    assert refreshed.status_code == 200
    assert refreshed.json()["analysis_remaining"] == 4


def test_invalid_guest_cookie_cannot_fall_back_to_a_different_identity(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    client.cookies.set("poker_trainer_guest", "invalid-cookie-value")

    response = client.get("/api/analysis")

    assert response.status_code == 401


def test_legacy_guest_header_is_local_only(api_client: tuple[TestClient, sessionmaker[Session]], monkeypatch: pytest.MonkeyPatch) -> None:
    client, _ = api_client
    monkeypatch.setenv("ENVIRONMENT", "production")
    response = client.get("/api/analysis", headers={"X-Guest-Session": "legacy-guest-1234567890abcdef"})
    assert response.status_code == 401


def test_production_rate_limit_protects_guest_session_issuance(
    api_client: tuple[TestClient, sessionmaker[Session]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = api_client
    monkeypatch.setenv("POKER_TRAINER_RATE_LIMIT_ENABLED", "1")
    monkeypatch.setenv("POKER_TRAINER_GUEST_SESSION_RATE_LIMIT", "2")

    assert client.post("/api/guest-sessions").status_code == 200
    assert client.post("/api/guest-sessions").status_code == 200
    limited = client.post("/api/guest-sessions")

    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "60"


def test_hand_creation_is_idempotent_and_rejects_payload_reuse(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    app.dependency_overrides[require_actor] = as_actor("user-idempotent")
    headers = {"Idempotency-Key": "hand-save-42"}

    first = client.post("/api/hands", json=hand_payload(), headers=headers)
    second = client.post("/api/hands", json=hand_payload(), headers=headers)
    changed = client.post("/api/hands", json=hand_payload("AhQh"), headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert changed.status_code == 409
    with TestingSession() as db:
        assert db.query(Hand).filter(Hand.user_id == "user-idempotent").count() == 1

    malformed = client.post("/api/hands", json=hand_payload(), headers={"Idempotency-Key": "short"})
    assert malformed.status_code == 422


def test_admin_can_pause_and_resume_analysis_admission(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    app.dependency_overrides[require_actor] = as_actor("user-pause")
    hand_response = client.post("/api/hands", json=hand_payload())
    assert hand_response.status_code == 200
    hand_id = hand_response.json()["id"]

    app.dependency_overrides[require_admin_user] = as_user("admin-user")
    paused = client.put("/api/admin/analysis", json={"enabled": False, "message": "Maintenance in progress"})
    assert paused.status_code == 200
    assert paused.json()["enabled"] is False
    assert client.get("/api/admin/analysis/status").json()["message"] == "Maintenance in progress"

    blocked = client.post(f"/api/hands/{hand_id}/analyze")
    assert blocked.status_code == 503

    resumed = client.put("/api/admin/analysis", json={"enabled": True, "message": "Analysis is available"})
    assert resumed.status_code == 200
    assert client.post(f"/api/hands/{hand_id}/analyze").status_code == 200


def test_cancel_of_solving_job_becomes_a_cancellation_request(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    app.dependency_overrides[require_actor] = as_actor("user-cancel-solving")
    hand_response = client.post("/api/hands", json=hand_payload())
    assert hand_response.status_code == 200
    hand_id = hand_response.json()["id"]
    with TestingSession() as db:
        db.add(AnalysisJob(hand_id=hand_id, user_id="user-cancel-solving", status="solving", worker_id="worker-test"))
        db.commit()

    response = client.post(f"/api/analysis/{hand_id}/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "solving"
    assert response.json()["cancel_requested_at"] is not None
    assert "Cancellation requested" in response.json()["error"]


def test_anonymous_users_cannot_save_hands(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client

    response = client.post("/api/hands", json=hand_payload())

    assert response.status_code == 401


def test_saved_hands_are_owned_by_authenticated_user(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    app.dependency_overrides[require_actor] = as_actor("user-a")

    response = client.post("/api/hands", json=hand_payload())

    assert response.status_code == 200
    with TestingSession() as db:
        hand = db.get(Hand, response.json()["id"])
        assert hand is not None
        assert hand.user_id == "user-a"


def test_guest_session_can_save_and_view_its_own_analysis(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    headers = {"X-Guest-Session": "guest-session-1234567890abcdef"}

    hand_response = client.post("/api/hands", json=hand_payload(), headers=headers)
    assert hand_response.status_code == 200
    hand_id = hand_response.json()["id"]

    analyze_response = client.post(f"/api/hands/{hand_id}/analyze", headers=headers)
    assert analyze_response.status_code == 200

    list_response = client.get("/api/analysis", headers=headers)
    assert list_response.status_code == 200
    assert [row["hand_id"] for row in list_response.json()] == [hand_id]

    detail_response = client.get(f"/api/analysis/{hand_id}", headers=headers)
    assert detail_response.status_code == 200

    with TestingSession() as db:
        hand = db.get(Hand, hand_id)
        job = db.query(AnalysisJob).filter(AnalysisJob.hand_id == hand_id).first()
        assert hand is not None
        assert job is not None
        assert hand.user_id is None
        assert job.user_id is None
        assert hand.guest_session_id == headers["X-Guest-Session"]
        assert job.guest_session_id == headers["X-Guest-Session"]


def test_guest_analysis_is_scoped_to_guest_session(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    owner_headers = {"X-Guest-Session": "guest-owner-1234567890abcdef"}
    other_headers = {"X-Guest-Session": "guest-other-1234567890abcdef"}

    hand_response = client.post("/api/hands", json=hand_payload(), headers=owner_headers)
    assert hand_response.status_code == 200
    hand_id = hand_response.json()["id"]

    denied = client.get(f"/api/analysis/{hand_id}", headers=other_headers)

    assert denied.status_code == 404


def test_guest_can_cancel_and_retry_queued_analysis(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    headers = {"X-Guest-Session": "guest-cancel-1234567890abcdef"}

    hand_response = client.post("/api/hands", json=hand_payload(), headers=headers)
    assert hand_response.status_code == 200
    hand_id = hand_response.json()["id"]

    queued = client.post(f"/api/hands/{hand_id}/analyze", headers=headers)
    assert queued.status_code == 200
    assert queued.json()["status"] == "queued"

    cancelled = client.post(f"/api/analysis/{hand_id}/cancel", headers=headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    retried = client.post(f"/api/analysis/{hand_id}/retry", headers=headers)
    assert retried.status_code == 200
    assert retried.json()["status"] == "queued"


def test_owner_can_delete_hand_and_derived_private_rows(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    app.dependency_overrides[require_actor] = as_actor("user-a")

    response = client.post("/api/hands", json=hand_payload())
    assert response.status_code == 200
    hand_id = response.json()["id"]

    with TestingSession() as db:
        hand = db.get(Hand, hand_id)
        assert hand is not None
        job = AnalysisJob(hand_id=hand_id, user_id="user-a", status="ready", solver_output_json={"street_results": []})
        db.add(job)
        db.flush()
        db.add(
            StudySpot(
                source_job_id=job.id,
                source_hand_id=hand_id,
                spot_key="flop:0:flop:test",
                street="flop",
                node="Test",
                hero_hand=hand.hero_cards,
                board_json=["Ks", "7d", "2c"],
                line_json=[],
                tags_json=["flop"],
                solver_json={"hero_action": "check"},
            )
        )
        db.commit()

    deleted = client.delete(f"/api/hands/{hand_id}")
    assert deleted.status_code == 204
    with TestingSession() as db:
        assert db.get(Hand, hand_id) is None
        assert db.query(AnalysisJob).filter(AnalysisJob.hand_id == hand_id).count() == 0
        assert db.query(StudySpot).filter(StudySpot.source_hand_id == hand_id).count() == 0


def test_authenticated_account_export_contains_owned_data(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    app.dependency_overrides[require_current_user] = as_user("user-export")
    with TestingSession() as db:
        db.add(UserProfile(user_id="user-export", username="Exporter", username_normalized="exporter"))
        hand = Hand(user_id="user-export", **hand_payload())
        db.add(hand)
        db.commit()
        db.refresh(hand)
        db.add(AnalysisJob(hand_id=hand.id, user_id="user-export", status="ready", solver_output_json={"street_results": []}))
        db.commit()

    response = client.get("/api/account/export")

    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["username"] == "Exporter"
    assert len(body["hands"]) == 1
    assert len(body["analysis_jobs"]) == 1


def test_account_delete_removes_local_user_data(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    app.dependency_overrides[require_current_user] = as_user("user-delete")
    with TestingSession() as db:
        db.add(UserProfile(user_id="user-delete", username="Deleter", username_normalized="deleter"))
        hand = Hand(user_id="user-delete", **hand_payload())
        db.add(hand)
        db.commit()
        db.refresh(hand)
        db.add(AnalysisJob(hand_id=hand.id, user_id="user-delete", status="queued"))
        db.commit()
        hand_id = hand.id

    response = client.delete("/api/account")

    assert response.status_code == 200
    assert response.json()["deleted_hands"] == 1
    assert response.json()["external_auth_deleted"] is False
    with TestingSession() as db:
        assert db.get(Hand, hand_id) is None
        assert db.query(AnalysisJob).filter(AnalysisJob.hand_id == hand_id).count() == 0
        assert db.get(UserProfile, "user-delete") is None


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

    app.dependency_overrides[require_actor] = as_actor("user-a")
    response = client.get("/api/analysis")

    assert response.status_code == 200
    assert [row["hero_hand"] for row in response.json()] == ["AsKd"]


def test_analysis_page_supports_stable_cursor_pagination(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    with TestingSession() as db:
        for index, hero_cards in enumerate(["AsKd", "Td9d", "AhQh"]):
            hand = Hand(user_id="user-page", **hand_payload(hero_cards))
            db.add(hand)
            db.flush()
            db.add(AnalysisJob(hand_id=hand.id, user_id="user-page", status="ready"))
            db.flush()
            db.query(AnalysisJob).filter(AnalysisJob.hand_id == hand.id).update({AnalysisJob.created_at: hand.created_at.replace(microsecond=index + 1)})
        db.commit()

    app.dependency_overrides[require_actor] = as_actor("user-page")
    first = client.get("/api/analysis/page?limit=2")
    assert first.status_code == 200
    first_body = first.json()
    assert len(first_body["items"]) == 2
    assert first_body["next_cursor"]

    second = client.get(f"/api/analysis/page?limit=2&cursor={first_body['next_cursor']}")
    assert second.status_code == 200
    second_body = second.json()
    assert len(second_body["items"]) == 1
    assert second_body["next_cursor"] is None
    assert {item["hand_id"] for item in first_body["items"]}.isdisjoint({item["hand_id"] for item in second_body["items"]})

    invalid = client.get("/api/analysis/page?cursor=not-a-real-cursor")
    assert invalid.status_code == 400


def test_analysis_api_redacts_internal_solver_error_details(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    with TestingSession() as db:
        hand = Hand(user_id="user-error", **hand_payload())
        db.add(hand)
        db.commit()
        db.refresh(hand)
        db.add(AnalysisJob(hand_id=hand.id, user_id="user-error", status="failed", error="C:\\private\\worker.exe crashed"))
        db.commit()
        hand_id = hand.id

    app.dependency_overrides[require_actor] = as_actor("user-error")
    listed = client.get("/api/analysis")
    detail = client.get(f"/api/analysis/{hand_id}")

    assert listed.status_code == 200
    assert listed.json()[0]["error"] == "Analysis failed. Retry it, and contact support if the problem continues."
    assert "worker.exe" not in listed.text
    assert detail.status_code == 200
    assert detail.json()["job"]["error"] == listed.json()[0]["error"]


def test_analysis_detail_does_not_expose_other_users_hands(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    with TestingSession() as db:
        other_hand = Hand(user_id="user-b", **hand_payload())
        db.add(other_hand)
        db.commit()
        db.refresh(other_hand)
        hand_id = other_hand.id

    app.dependency_overrides[require_actor] = as_actor("user-a")
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
