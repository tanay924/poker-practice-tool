from __future__ import annotations

import os
from typing import Any

from sqlalchemy.orm import Session

from app.models import AnalysisJob, Hand, StudySpot
from app.schemas import StudySpotRead

STREET_ORDER = {"preflop": 0, "flop": 1, "turn": 2, "river": 3}


def backfill_study_spots(db: Session, *, limit: int = 500) -> None:
    jobs = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.status == "ready", AnalysisJob.solver_output_json.isnot(None))
        .order_by(AnalysisJob.created_at.desc(), AnalysisJob.id.desc())
        .limit(limit)
        .all()
    )
    changed = False
    for job in jobs:
        if db.query(StudySpot).filter(StudySpot.source_job_id == job.id).first() is not None:
            continue
        hand = db.get(Hand, job.hand_id)
        if hand is None:
            continue
        changed = upsert_study_spots_for_job(db, hand, job, commit=False) or changed
    if changed:
        db.commit()


def upsert_study_spots_for_job(db: Session, hand: Hand, job: AnalysisJob, *, commit: bool = True) -> bool:
    if job.status != "ready" or not isinstance(job.solver_output_json, dict):
        return False
    output = job.solver_output_json
    input_payload = job.solver_input_json if isinstance(job.solver_input_json, dict) else {}
    spots = extract_study_spot_payloads(hand, job, input_payload, output)
    existing_keys = {
        spot.spot_key
        for spot in db.query(StudySpot).filter(StudySpot.source_job_id == job.id).all()
    }
    changed = False
    for payload in spots:
        if payload["spot_key"] in existing_keys:
            continue
        db.add(StudySpot(**payload))
        changed = True
    if changed and commit:
        db.commit()
    return changed


def extract_study_spot_payloads(
    hand: Hand,
    job: AnalysisJob,
    solver_input: dict[str, Any],
    solver_output: dict[str, Any],
) -> list[dict[str, Any]]:
    branch_tag = branch_tag_for_solver_input(solver_input)
    payloads: list[dict[str, Any]] = []

    for index, result in enumerate(solver_output.get("preflop_results", [])):
        if not isinstance(result, dict):
            continue
        spot_name = str(result.get("spot_name") or result.get("spot_id") or "Preflop decision")
        tags = compact_tags(
            [
                "preflop",
                branch_tag,
                str(result.get("spot_id") or ""),
                f"hero-{result.get('hero_action', 'unknown')}",
                "correct" if bool(result.get("correct")) else "zero-percent-action",
            ]
        )
        payloads.append(
            {
                "source_job_id": job.id,
                "source_hand_id": hand.id,
                "spot_key": f"preflop:{index}:{spot_name}",
                "street": "preflop",
                "node": spot_name,
                "hero_hand": hand.hero_cards,
                "board_json": [],
                "line_json": line_for_street(hand.action_history_json, "preflop"),
                "tags_json": tags,
                "solver_json": {
                    "hero_action": str(result.get("hero_action") or "unknown"),
                    "best_action": best_action_from_strategy(result.get("options", {})),
                    "verdict": "correct" if bool(result.get("correct")) else "mistake",
                    "confidence": None,
                    "solver_strategy": numeric_strategy(result.get("options", {})),
                },
                **study_spot_publication_fields(hand),
            }
        )

    for index, result in enumerate(solver_output.get("street_results", [])):
        if not isinstance(result, dict):
            continue
        street = str(result.get("street") or "unknown").lower()
        board = [str(card) for card in result.get("board", []) if isinstance(card, str)]
        tags = compact_tags(
            [
                street,
                branch_tag,
                situation_tag(result),
                f"hero-{result.get('hero_action', 'unknown')}",
                f"best-{result.get('best_action', 'unknown')}",
                *board_texture_tags(board),
            ]
        )
        node = str(result.get("node") or f"{street} decision")
        payloads.append(
            {
                "source_job_id": job.id,
                "source_hand_id": hand.id,
                "spot_key": f"postflop:{index}:{street}:{node}",
                "street": street,
                "node": node,
                "hero_hand": str(result.get("hero_hand") or hand.hero_cards),
                "board_json": board,
                "line_json": line_for_street(hand.action_history_json, street),
                "tags_json": tags,
                "solver_json": {
                    "hero_action": str(result.get("hero_action") or "unknown"),
                    "best_action": str(result.get("best_action") or "unknown"),
                    "verdict": str(result.get("verdict") or "unknown"),
                    "confidence": result.get("confidence") if isinstance(result.get("confidence"), str) else None,
                    "solver_strategy": numeric_strategy(result.get("solver_strategy", {})),
                },
                **study_spot_publication_fields(hand),
            }
        )
    return payloads


def similar_spots(db: Session, source: StudySpot, *, limit: int = 5) -> list[StudySpot]:
    source_tags = set(source.tags_json)
    candidates = (
        db.query(StudySpot)
        .filter(
            StudySpot.id != source.id,
            StudySpot.source_hand_id != source.source_hand_id,
            StudySpot.street == source.street,
            StudySpot.visibility == "curated_public",
            StudySpot.quality_status == "validated",
        )
        .order_by(StudySpot.created_at.desc(), StudySpot.id.desc())
        .limit(300)
        .all()
    )
    scored = [
        (tag_overlap_score(source_tags, set(candidate.tags_json)), candidate)
        for candidate in candidates
    ]
    return [candidate for score, candidate in sorted(scored, key=lambda item: (-item[0], -item[1].id)) if score > 0][:limit]


def study_spot_read(spot: StudySpot) -> StudySpotRead:
    solver = spot.solver_json
    return StudySpotRead(
        street=spot.street,
        node=spot.node,
        hero_hand=spot.hero_hand,
        board=spot.board_json,
        line=spot.line_json,
        tags=spot.tags_json,
        hero_action=str(solver.get("hero_action") or "unknown"),
        best_action=str(solver.get("best_action") or "unknown"),
        verdict=str(solver.get("verdict") or "unknown"),
        confidence=solver.get("confidence") if isinstance(solver.get("confidence"), str) else None,
        solver_strategy=numeric_strategy(solver.get("solver_strategy", {})),
    )


def tag_overlap_score(source_tags: set[str], candidate_tags: set[str]) -> int:
    return len(source_tags & candidate_tags)


def branch_tag_for_solver_input(solver_input: dict[str, Any]) -> str:
    branch_id = str(solver_input.get("postflop_branch_id") or solver_input.get("ranges", {}).get("branch_id") or "")
    if branch_id == "three_bet_call":
        return "3bet-pot"
    if branch_id in {"limp_check", "limp_raise_call"}:
        return "limp-pot"
    if branch_id == "srp_open_call":
        return "single-raised-pot"
    return "unknown-pot-type"


def situation_tag(result: dict[str, Any]) -> str:
    action = str(result.get("hero_action") or "").lower()
    if action in {"call", "fold"}:
        return "facing-bet"
    return "first-to-act"


def board_texture_tags(board: list[str]) -> list[str]:
    if len(board) < 3:
        return []
    ranks = [card[:-1] for card in board]
    suits = [card[-1:] for card in board]
    tags: list[str] = []
    if len(set(ranks)) < len(ranks):
        tags.append("paired-board")
    suit_counts = [suits.count(suit) for suit in set(suits)]
    if max(suit_counts) == len(suits):
        tags.append("monotone-board")
    elif max(suit_counts) >= 2:
        tags.append("two-tone-board")
    if is_connected_board(ranks):
        tags.append("connected-board")
    if ranks and rank_value(ranks[0]) == 14:
        tags.append("ace-high-board")
    return tags


def is_connected_board(ranks: list[str]) -> bool:
    values = sorted({rank_value(rank) for rank in ranks}, reverse=True)
    if len(values) < 3:
        return False
    return max(values) - min(values) <= 4


def rank_value(rank: str) -> int:
    return {"A": 14, "K": 13, "Q": 12, "J": 11, "T": 10}.get(rank, int(rank) if rank.isdigit() else 0)


def line_for_street(action_history: list[dict[str, Any]], street: str) -> list[str]:
    target_order = STREET_ORDER.get(street, 99)
    line: list[str] = []
    for entry in action_history:
        entry_street = str(entry.get("street") or "")
        if STREET_ORDER.get(entry_street, 99) > target_order:
            continue
        actor = str(entry.get("actor") or "Player")
        action = str(entry.get("action") or "acts").replace("_", " ")
        amount = entry.get("amount_bb")
        if isinstance(amount, int | float) and amount > 0:
            line.append(f"{entry_street}: {actor} {action} {amount:g}bb")
        else:
            line.append(f"{entry_street}: {actor} {action}")
    return line


def best_action_from_strategy(strategy: Any) -> str:
    normalized = numeric_strategy(strategy)
    if not normalized:
        return "unknown"
    return max(normalized.items(), key=lambda item: item[1])[0]


def numeric_strategy(strategy: Any) -> dict[str, float]:
    if not isinstance(strategy, dict):
        return {}
    result: dict[str, float] = {}
    for action, frequency in strategy.items():
        try:
            result[str(action)] = float(frequency)
        except (TypeError, ValueError):
            continue
    return result


def compact_tags(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for tag in tags:
        normalized = tag.strip().lower().replace("_", "-").replace(" ", "-")
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def study_spot_publication_fields(hand: Hand) -> dict[str, str]:
    public_enabled = os.getenv("POKER_TRAINER_PUBLIC_STUDY_SPOTS_ENABLED", "1").strip().lower() not in {"0", "false", "no"}
    if public_enabled:
        return {"visibility": "curated_public", "provenance": "synthetic" if hand.user_id is None else "user_contributed", "quality_status": "validated"}
    return {"visibility": "private", "provenance": "user_private", "quality_status": "pending"}
