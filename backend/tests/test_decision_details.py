from app.analysis.decision_details import add_decision_details
from app.api.analysis import get_analysis
from app.auth import AuthUser
from app.db import Base
from app.models import AnalysisJob, Hand
from app.poker.equity import exact_holdem_equity
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def base_solver_output() -> dict:
    return {
        "street_results": [
            {
                "street": "flop",
                "node": "SB flop decision",
                "hero_hand": "AsKs",
                "board": ["Ah", "7d", "2c", "4s", "Td"],
                "solver_strategy": {"check": 0.25, "bet_50": 0.75},
                "hero_action": "call",
                "best_action": "bet_50",
                "verdict": "mixed",
                "confidence": "high",
            }
        ],
        "summary": {"overall": "mixed", "largest_mistake": None},
    }


def test_pot_odds_are_attached_when_hero_calls() -> None:
    solver_input = {
        "hero_position": "SB",
        "hero_cards": "AsKs",
        "villain_cards": "QhQc",
        "board": ["Ah", "7d", "2c", "4s", "Td"],
        "result": {"winner": "hero", "reason": "river_completed"},
        "action_history": [
            {"street": "flop", "actor": "BB", "action": "bet", "amount_bb": 5, "pot_after": 10, "node": "BB flop action"},
            {"street": "flop", "actor": "SB", "action": "call", "amount_bb": 5, "pot_after": 15, "node": "SB flop decision"},
        ],
    }

    output = add_decision_details(base_solver_output(), solver_input)

    pot_odds = output["street_results"][0]["details"]["pot_odds"]
    assert pot_odds["available"] is True
    assert pot_odds["call_amount_bb"] == 5
    assert pot_odds["pot_before_call_bb"] == 10
    assert pot_odds["pot_if_call_bb"] == 15
    assert pot_odds["required_equity"] == 1 / 3


def test_pot_odds_are_attached_when_hero_folds_to_a_bet() -> None:
    solver_input = {
        "hero_position": "SB",
        "hero_cards": "AsKs",
        "villain_cards": "QhQc",
        "board": ["Ah", "7d", "2c", "4s", "Td"],
        "result": {"winner": "villain", "reason": "hero_folded"},
        "action_history": [
            {"street": "turn", "actor": "BB", "action": "bet", "amount_bb": 8, "pot_after": 20, "node": "BB turn action"},
            {"street": "turn", "actor": "SB", "action": "fold", "amount_bb": 0, "pot_after": 20, "node": "SB turn decision"},
        ],
    }
    solver_output = base_solver_output()
    solver_output["street_results"][0]["street"] = "turn"
    solver_output["street_results"][0]["hero_action"] = "fold"

    output = add_decision_details(solver_output, solver_input)

    pot_odds = output["street_results"][0]["details"]["pot_odds"]
    assert pot_odds["available"] is True
    assert pot_odds["call_amount_bb"] == 8
    assert pot_odds["pot_before_call_bb"] == 20
    assert pot_odds["pot_if_call_bb"] == 28
    assert pot_odds["required_equity"] == 8 / 28


def test_equity_is_exact_against_revealed_cards() -> None:
    equity = exact_holdem_equity(
        hero_cards=["As", "Ks"],
        villain_cards=["Qh", "Qc"],
        board=["Ah", "7d", "2c", "4s"],
    )

    assert equity["available"] is True
    assert equity["source"] == "exact_revealed_cards"
    assert equity["total_runouts"] == 44
    assert equity["hero"] > 0.9
    assert equity["villain"] < 0.1


def test_equity_is_attached_for_folded_hands_in_analysis() -> None:
    solver_input = {
        "hero_position": "SB",
        "hero_cards": "AsKs",
        "villain_cards": "QhQc",
        "board": ["Ah", "7d", "2c", "4s", "Td"],
        "result": {"winner": "hero", "reason": "villain_folded"},
        "action_history": [
            {"street": "flop", "actor": "SB", "action": "bet", "amount_bb": 5, "pot_after": 10, "node": "SB flop decision"},
            {"street": "flop", "actor": "BB", "action": "fold", "amount_bb": 0, "pot_after": 10, "node": "BB flop action"},
        ],
    }

    output = add_decision_details(base_solver_output(), solver_input)

    equity = output["street_results"][0]["details"]["equity"]
    assert equity["available"] is True
    assert equity["source"] == "exact_revealed_cards"
    assert equity["hero"] > equity["villain"]


def test_get_analysis_enriches_older_saved_solver_output() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSession() as db:
        hand = Hand(
            user_id="user-a",
            hero_position="SB",
            villain_position="BB",
            hero_cards="AsKs",
            villain_cards="QhQc",
            board_json=["Ah", "7d", "2c", "4s", "Td"],
            stack_bb=100,
            pot=15,
            action_history_json=[
                {"street": "flop", "actor": "BB", "action": "bet", "amount_bb": 5, "pot_after": 10, "node": "BB flop action"},
                {"street": "flop", "actor": "SB", "action": "call", "amount_bb": 5, "pot_after": 15, "node": "SB flop decision"},
            ],
            result_json={"winner": "hero", "reason": "villain_folded"},
        )
        db.add(hand)
        db.commit()
        db.refresh(hand)
        db.add(
            AnalysisJob(
                hand_id=hand.id,
                status="ready",
                solver_output_json=base_solver_output(),
            )
        )
        db.commit()

        detail = get_analysis(hand.id, db, AuthUser(user_id="user-a"))

    street_result = detail.job.solver_output_json["street_results"][0]
    assert street_result["details"]["pot_odds"]["available"] is True
    assert street_result["details"]["equity"]["available"] is True
