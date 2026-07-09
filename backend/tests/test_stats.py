from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import AuthUser, require_current_user
from app.db import Base, get_db
from app.main import app
from app.models import AnalysisJob, Hand, utc_now


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
            }
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


def set_user(user_id: str) -> None:
    app.dependency_overrides[require_current_user] = lambda: AuthUser(user_id=user_id, email="hero@example.com")


def ready_solver_output() -> dict[str, object]:
    return {
        "preflop_results": [
            {
                "actor": "SB",
                "correct": True,
                "hero_action": "raise",
                "options": {"fold": 0, "limp": 0.2, "raise": 0.8},
                "selected_frequency": 0.8,
                "spot_id": "HU_SB_OPEN_2_5BB_OR_LIMP_100BB",
                "spot_name": "SB open",
                "street": "preflop",
            },
            {
                "actor": "BB",
                "correct": False,
                "hero_action": "fold",
                "options": {"fold": 0, "call": 0.5, "raise": 0.5, "allin": 0},
                "selected_frequency": 0,
                "spot_id": "HU_SRP_BB_VS_SB_OPEN_100BB",
                "spot_name": "BB vs SB open",
                "street": "preflop",
            },
        ],
        "preflop_summary": {"correct_count": 1, "decision_count": 2},
        "postflop_status": "ready",
        "street_results": [
            {
                "best_action": "fold",
                "board": ["Ks", "7d", "2c"],
                "confidence": "high",
                "hero_action": "call",
                "hero_hand": "AsKd",
                "node": "Flop facing bet",
                "solver_strategy": {"fold": 0.9, "call": 0.1},
                "street": "flop",
                "verdict": "mistake",
            },
            {
                "best_action": "check",
                "board": ["Ks", "7d", "2c", "4h"],
                "confidence": "medium",
                "hero_action": "check",
                "hero_hand": "AsKd",
                "node": "Turn first action",
                "solver_strategy": {"check": 0.6, "bet": 0.4},
                "street": "turn",
                "verdict": "mixed",
            },
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


def test_stats_requires_sign_in(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client

    response = client.get("/api/stats/me")

    assert response.status_code == 401


def test_stats_split_overall_hands_from_analyzed_accuracy(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, TestingSession = api_client
    now = utc_now()
    with TestingSession() as db:
        ready_hand = Hand(user_id="user-a", created_at=now - timedelta(days=1), **hand_payload("AsKd"))
        queued_hand = Hand(user_id="user-a", created_at=now - timedelta(days=3), **hand_payload("9c9d"))
        unanalysed_hand = Hand(user_id="user-a", created_at=now - timedelta(days=40), **hand_payload("7s6s"))
        other_user_hand = Hand(user_id="user-b", created_at=now, **hand_payload("AhAc"))
        db.add_all([ready_hand, queued_hand, unanalysed_hand, other_user_hand])
        db.commit()
        db.refresh(ready_hand)
        db.refresh(queued_hand)
        db.refresh(other_user_hand)
        db.add_all(
            [
                AnalysisJob(
                    hand_id=ready_hand.id,
                    user_id="user-a",
                    status="ready",
                    created_at=now - timedelta(days=1),
                    solver_output_json=ready_solver_output(),
                ),
                AnalysisJob(
                    hand_id=queued_hand.id,
                    user_id="user-a",
                    status="queued",
                    created_at=now - timedelta(days=3),
                    solver_output_json=None,
                ),
                AnalysisJob(
                    hand_id=other_user_hand.id,
                    user_id="user-b",
                    status="ready",
                    created_at=now,
                    solver_output_json=ready_solver_output(),
                ),
            ]
        )
        db.commit()

    set_user("user-a")
    response = client.get("/api/stats/me")

    assert response.status_code == 200
    payload = response.json()
    assert payload["overall"]["hands_played"] == 3
    assert payload["analyzed"]["hands_analyzed"] == 1
    assert payload["analyzed"]["preflop_decisions_reviewed"] == 2
    assert payload["analyzed"]["preflop_correct"] == 1
    assert payload["analyzed"]["preflop_accuracy"] == 0.5
    assert payload["analyzed"]["postflop_decisions_reviewed"] == 2
    assert payload["analyzed"]["postflop_mistakes"] == 1
    assert payload["preflop_by_position"][0] == {"accuracy": 1.0, "correct": 1, "decisions": 1, "label": "SB"}
    assert payload["preflop_by_position"][1] == {"accuracy": 0.0, "correct": 0, "decisions": 1, "label": "BB"}
    assert payload["postflop_by_street"][0] == {"decisions": 1, "label": "Flop", "mistakes": 1}
    assert payload["recent"]["hands_played_7d"] == 2
    assert payload["recent"]["hands_played_30d"] == 2
    assert payload["recent"]["hands_analyzed_30d"] == 1
    assert payload["recommendations"][0]["to"] in ["/preflop", "/analysis", "/play"]
