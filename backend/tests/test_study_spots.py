from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import AuthUser, RequestActor, require_actor, require_current_user
from app.db import Base, get_db
from app.main import app
from app.models import AnalysisJob, Hand
from app.study_spots import upsert_study_spots_for_job


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
            {"street": "preflop", "actor": "SB", "action": "raise", "amount_bb": 2.5, "pot_after": 2.5},
            {"street": "preflop", "actor": "BB", "action": "call", "amount_bb": 2.5, "pot_after": 5.0},
            {"street": "flop", "actor": "BB", "action": "bet", "amount_bb": 3.0, "pot_after": 8.0},
            {"street": "flop", "actor": "SB", "action": "call", "amount_bb": 3.0, "pot_after": 11.0},
        ],
        "result_json": {"winner": "showdown", "reason": "river_completed"},
    }


def solver_input() -> dict[str, object]:
    return {
        "postflop_branch_id": "srp_open_call",
        "ranges": {"branch_id": "srp_open_call"},
    }


def solver_output(hero_hand: str = "AsKd") -> dict[str, object]:
    return {
        "postflop_status": "ready",
        "street_results": [
            {
                "best_action": "fold",
                "board": ["Ks", "7d", "2c"],
                "confidence": "high",
                "hero_action": "call",
                "hero_hand": hero_hand,
                "node": "Flop facing bet",
                "solver_strategy": {"fold": 0.9, "call": 0.1},
                "street": "flop",
                "verdict": "mistake",
            }
        ],
        "summary": {
            "largest_mistake": {
                "best_action": "fold",
                "hero_action": "call",
                "node": "Flop facing bet",
                "street": "flop",
            },
            "overall": "needs_review",
        },
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


def set_user(user_id: str) -> None:
    app.dependency_overrides[require_current_user] = lambda: AuthUser(user_id=user_id, email=f"{user_id}@example.com")
    app.dependency_overrides[require_actor] = lambda: RequestActor(user_id=user_id)


def test_similar_study_spots_use_global_anonymized_ready_analyses(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    with TestingSession() as db:
        source_hand = Hand(user_id="user-a", **hand_payload("AsKd"))
        global_hand = Hand(user_id="user-b", **hand_payload("AhKh"))
        db.add_all([source_hand, global_hand])
        db.commit()
        db.refresh(source_hand)
        db.refresh(global_hand)
        source_job = AnalysisJob(
            hand_id=source_hand.id,
            user_id="user-a",
            status="ready",
            solver_input_json=solver_input(),
            solver_output_json=solver_output("AsKd"),
        )
        global_job = AnalysisJob(
            hand_id=global_hand.id,
            user_id="user-b",
            status="ready",
            solver_input_json=solver_input(),
            solver_output_json=solver_output("AhKh"),
        )
        db.add_all([source_job, global_job])
        db.commit()
        db.refresh(source_job)
        db.refresh(global_job)
        upsert_study_spots_for_job(db, source_hand, source_job)
        upsert_study_spots_for_job(db, global_hand, global_job)
        source_hand_id = source_hand.id

    set_user("user-a")
    response = client.get(f"/api/study-spots/similar?hand_id={source_hand_id}&street=flop&node=Flop%20facing%20bet")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"]["tags"]
    assert payload["spots"]
    spot = payload["spots"][0]
    assert spot["hero_hand"] == "AhKh"
    assert "flop" in spot["tags"]
    assert "facing-bet" in spot["tags"]
    assert "single-raised-pot" in spot["tags"]
    assert "id" not in spot
    assert "source_hand_id" not in spot
    assert "source_job_id" not in spot
    assert "user_id" not in spot
    assert "username" not in str(spot).lower()


def test_similar_study_spots_require_visible_source_hand(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    with TestingSession() as db:
        source_hand = Hand(user_id="user-a", **hand_payload("AsKd"))
        db.add(source_hand)
        db.commit()
        db.refresh(source_hand)
        hand_id = source_hand.id

    set_user("user-b")
    response = client.get(f"/api/study-spots/similar?hand_id={hand_id}&street=flop")

    assert response.status_code == 404


def test_private_study_spots_are_not_added_to_global_candidates(
    api_client: tuple[TestClient, sessionmaker[Session]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, TestingSession = api_client
    monkeypatch.setenv("POKER_TRAINER_PUBLIC_STUDY_SPOTS_ENABLED", "0")
    with TestingSession() as db:
        source_hand = Hand(user_id="user-a", **hand_payload("AsKd"))
        candidate_hand = Hand(user_id="user-b", **hand_payload("AhKh"))
        db.add_all([source_hand, candidate_hand])
        db.commit()
        db.refresh(source_hand)
        db.refresh(candidate_hand)
        source_job = AnalysisJob(hand_id=source_hand.id, user_id="user-a", status="ready", solver_input_json=solver_input(), solver_output_json=solver_output())
        candidate_job = AnalysisJob(hand_id=candidate_hand.id, user_id="user-b", status="ready", solver_input_json=solver_input(), solver_output_json=solver_output("AhKh"))
        db.add_all([source_job, candidate_job])
        db.commit()
        db.refresh(source_job)
        db.refresh(candidate_job)
        upsert_study_spots_for_job(db, source_hand, source_job)
        upsert_study_spots_for_job(db, candidate_hand, candidate_job)
        source_hand_id = source_hand.id

    set_user("user-a")
    response = client.get(f"/api/study-spots/similar?hand_id={source_hand_id}&street=flop&node=Flop%20facing%20bet")

    assert response.status_code == 200
    assert response.json()["spots"] == []
