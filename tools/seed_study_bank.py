from __future__ import annotations

import argparse
import asyncio
from collections import Counter
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
DEFAULT_MANIFEST = BACKEND_ROOT / "data" / "study-bank-seed-20260709.json"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("POKER_TRAINER_DB_URL", f"sqlite:///{(BACKEND_ROOT / 'data' / 'poker_trainer.sqlite3').as_posix()}")

from app.analysis.service import process_next_analysis_job  # noqa: E402
from app.db import SessionLocal, init_db  # noqa: E402
from app.models import AnalysisJob, Hand, StudySpot, utc_now  # noqa: E402
from app.solver.factory import create_solver_from_env  # noqa: E402


SEED_VERSION = 1
SEED_PREFIX = "study-bank-seed-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate and solve synthetic hands for the global study spot bank.")
    parser.add_argument("--hands", type=int, default=100, help="Number of qualifying postflop hands to generate.")
    parser.add_argument("--seed", type=int, default=20260709, help="Deterministic generation seed.")
    parser.add_argument("--batch-size", type=int, default=5, help="Number of jobs to queue before processing.")
    parser.add_argument("--manifest", type=Path, default=None, help="Manifest path; defaults under backend/data.")
    parser.add_argument("--resume", action="store_true", help="Resume an existing seed manifest/database batch.")
    parser.add_argument("--retry-failed", action="store_true", help="Requeue failed or unsupported seed jobs.")
    parser.add_argument("--dry-run", action="store_true", help="Generate/inspect the manifest without touching the database.")
    parser.add_argument("--regenerate", action="store_true", help="Regenerate the manifest even if it already exists.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.hands <= 0 or args.batch_size <= 0:
        raise SystemExit("--hands and --batch-size must be positive")

    manifest_path = (args.manifest or (BACKEND_ROOT / "data" / f"study-bank-seed-{args.seed}.json")).resolve()
    if args.regenerate or not manifest_path.exists():
        generate_manifest(args.hands, args.seed, manifest_path)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    validate_manifest(manifest, args.hands, args.seed)
    print(json.dumps({
        "manifest": str(manifest_path),
        "seed": args.seed,
        "requested_hands": manifest["requested_hands"],
        "manifest_hands": len(manifest["hands"]),
        "dry_run": args.dry_run,
    }, indent=2))

    if args.dry_run:
        return

    init_db()
    asyncio.run(run_seed(manifest, args.batch_size, args.retry_failed, args.resume))


def generate_manifest(hands: int, seed: int, output: Path) -> None:
    tsx = REPO_ROOT / "frontend" / "node_modules" / ".bin" / "tsx.cmd"
    generator = REPO_ROOT / "tools" / "generate_seed_hands.ts"
    if not tsx.exists():
        raise SystemExit(f"Missing frontend tsx executable: {tsx}")
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [str(tsx), str(generator), "--hands", str(hands), "--seed", str(seed), "--output", str(output)],
        cwd=REPO_ROOT,
        check=True,
    )


def validate_manifest(manifest: dict[str, Any], hands: int, seed: int) -> None:
    if manifest.get("version") != 1:
        raise SystemExit("Unsupported seed manifest version")
    if manifest.get("seed") != seed:
        raise SystemExit(f"Manifest seed {manifest.get('seed')} does not match requested seed {seed}")
    records = manifest.get("hands")
    if not isinstance(records, list) or len(records) < hands:
        raise SystemExit("Seed manifest does not contain the requested number of hands")
    fingerprints = [record.get("fingerprint") for record in records]
    if any(not isinstance(fingerprint, str) for fingerprint in fingerprints) or len(set(fingerprints)) != len(fingerprints):
        raise SystemExit("Seed manifest contains duplicate or invalid fingerprints")


async def run_seed(manifest: dict[str, Any], batch_size: int, retry_failed: bool, recover_stuck: bool) -> None:
    seed = int(manifest["seed"])
    seed_session = f"{SEED_PREFIX}-{seed}"
    records = manifest["hands"]
    started = time.perf_counter()
    all_job_ids: list[int] = []
    pending_job_ids: list[int] = []

    with SessionLocal() as db:
        existing_hands = db.query(Hand).filter(Hand.guest_session_id == seed_session).all()
        existing_by_index = {
            seed_index(hand): hand
            for hand in existing_hands
            if seed_index(hand) is not None
        }
        existing_by_fingerprint = {
            hand_fingerprint(hand): hand
            for hand in existing_hands
        }

        for record in records:
            index = int(record["index"])
            payload = record["payload"]
            hand = existing_by_index.get(index) or existing_by_fingerprint.get(fingerprint_key(payload))
            if hand is None:
                hand = Hand(
                    hero_position=payload["hero_position"],
                    villain_position=payload["villain_position"],
                    hero_cards=payload["hero_cards"],
                    villain_cards=payload["villain_cards"],
                    board_json=payload["board_json"],
                    stack_bb=payload["stack_bb"],
                    pot=payload["pot"],
                    action_history_json=payload["action_history_json"],
                    result_json=payload["result_json"],
                    guest_session_id=seed_session,
                )
                db.add(hand)
                db.flush()
                existing_by_index[index] = hand

            job = db.query(AnalysisJob).filter(AnalysisJob.hand_id == hand.id).order_by(AnalysisJob.id.desc()).first()
            if job is None:
                job = AnalysisJob(
                    hand_id=hand.id,
                    guest_session_id=seed_session,
                    status="queued",
                    queued_at=utc_now(),
                )
                db.add(job)
                db.flush()
            elif recover_stuck and job.status == "solving":
                job.status = "queued"
                job.queued_at = utc_now()
                job.started_at = None
                job.claimed_at = None
                job.finished_at = None
                job.worker_id = None
                job.error = None
                job.solver_input_json = None
                job.solver_output_json = None
            elif retry_failed and job.status in {"failed", "unsupported"}:
                job.status = "queued"
                job.queued_at = utc_now()
                job.started_at = None
                job.claimed_at = None
                job.finished_at = None
                job.worker_id = None
                job.error = None
                job.solver_input_json = None
                job.solver_output_json = None

            all_job_ids.append(job.id)
            if job.status == "queued":
                pending_job_ids.append(job.id)

        db.commit()

    solver = create_solver_from_env()
    try:
        for offset in range(0, len(pending_job_ids), batch_size):
            batch_ids = set(pending_job_ids[offset : offset + batch_size])
            while True:
                with SessionLocal() as db:
                    job = await process_next_analysis_job(
                        db,
                        solver=solver,
                        worker_id=f"{SEED_PREFIX}-{seed}",
                        job_ids=batch_ids,
                    )
                    if job is not None:
                        print(json.dumps({
                            "job_id": job.id,
                            "hand_id": job.hand_id,
                            "status": job.status,
                            "progress": min(offset + len(batch_ids), len(pending_job_ids)),
                            "total_jobs": len(pending_job_ids),
                        }))
                if job is None:
                    break
    finally:
        await solver.close()

    print(json.dumps(build_summary(seed_session, all_job_ids, started), indent=2))


def seed_index(hand: Hand) -> int | None:
    marker = hand.result_json.get("_study_bank_seed") if isinstance(hand.result_json, dict) else None
    if not isinstance(marker, dict):
        return None
    value = marker.get("index")
    return value if isinstance(value, int) else None


def hand_fingerprint(hand: Hand) -> str:
    return fingerprint_key({
        "hero_cards": hand.hero_cards,
        "villain_cards": hand.villain_cards,
        "board_json": hand.board_json,
        "action_history_json": hand.action_history_json,
    })


def fingerprint_key(payload: dict[str, Any]) -> str:
    return json.dumps(
        {
            "hero_cards": payload["hero_cards"],
            "villain_cards": payload["villain_cards"],
            "board_json": payload["board_json"],
            "action_history_json": payload["action_history_json"],
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def build_summary(seed_session: str, job_ids: list[int], started: float) -> dict[str, Any]:
    with SessionLocal() as db:
        jobs = db.query(AnalysisJob).filter(AnalysisJob.id.in_(job_ids)).all()
        spots = (
            db.query(StudySpot)
            .join(AnalysisJob, StudySpot.source_job_id == AnalysisJob.id)
            .filter(AnalysisJob.guest_session_id == seed_session)
            .all()
        )

    status_counts = Counter(job.status for job in jobs)
    street_counts = Counter(spot.street for spot in spots)
    tag_counts = Counter(tag for spot in spots for tag in spot.tags_json)
    return {
        "seed_session": seed_session,
        "jobs": len(jobs),
        "status": dict(sorted(status_counts.items())),
        "study_spots": len(spots),
        "streets": dict(sorted(street_counts.items())),
        "top_tags": dict(tag_counts.most_common(20)),
        "elapsed_seconds": round(time.perf_counter() - started, 2),
    }


if __name__ == "__main__":
    main()
