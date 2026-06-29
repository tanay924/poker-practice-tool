from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json

from sqlalchemy.orm import Session

from app.models import PreflopRange
from app.solver.errors import UnsupportedAnalysisError


@dataclass(frozen=True)
class RequiredHuSrpSpots:
    sb_open: str = "HU_SRP_SB_OPEN_100BB"
    bb_call_vs_open: str = "HU_SRP_BB_CALL_VS_SB_OPEN_100BB"


@dataclass(frozen=True)
class ResolvedRange:
    spot: str
    action: str
    range_id: int
    name: str
    range_hash: str
    shark_range: str


@dataclass(frozen=True)
class ResolvedHuSrpRanges:
    sb_open: ResolvedRange
    bb_call_vs_open: ResolvedRange

    def to_solver_payload(self) -> dict[str, object]:
        return {
            "spots": {
                "sb_open": self.sb_open.spot,
                "bb_call_vs_open": self.bb_call_vs_open.spot,
            },
            "range_ids": {
                "sb_open": self.sb_open.range_id,
                "bb_call_vs_open": self.bb_call_vs_open.range_id,
            },
            "range_hashes": {
                "sb_open": self.sb_open.range_hash,
                "bb_call_vs_open": self.bb_call_vs_open.range_hash,
            },
            "shark_ranges": {
                "sb_open": self.sb_open.shark_range,
                "bb_call_vs_open": self.bb_call_vs_open.shark_range,
            },
            "actions": {
                "sb_open": self.sb_open.action,
                "bb_call_vs_open": self.bb_call_vs_open.action,
            },
        }


class RangeResolutionError(UnsupportedAnalysisError):
    pass


REQUIRED_HU_SRP_SPOTS = RequiredHuSrpSpots()


def resolve_hu_srp_ranges(db: Session, stack_bb: int = 100) -> ResolvedHuSrpRanges:
    required = [
        (REQUIRED_HU_SRP_SPOTS.sb_open, "raise"),
        (REQUIRED_HU_SRP_SPOTS.bb_call_vs_open, "call"),
    ]
    missing: list[str] = []
    resolved: dict[str, ResolvedRange] = {}

    for spot, action in required:
        imported = _latest_range(db, spot=spot, stack_bb=stack_bb)
        if imported is None:
            missing.append(spot)
            continue

        shark_range = range_action_to_shark_string(imported.range_json["actions"], action)
        if not shark_range:
            raise RangeResolutionError(
                f"Imported range {spot} exists, but contains no positive '{action}' frequencies."
            )

        key = "sb_open" if spot == REQUIRED_HU_SRP_SPOTS.sb_open else "bb_call_vs_open"
        resolved[key] = ResolvedRange(
            spot=spot,
            action=action,
            range_id=imported.id,
            name=imported.name,
            range_hash=hash_range_json(imported.range_json),
            shark_range=shark_range,
        )

    if missing:
        raise RangeResolutionError(
            "Missing required imported ranges for Shark analysis: "
            + ", ".join(missing)
            + ". Import these spots before running accurate Shark analysis."
        )

    return ResolvedHuSrpRanges(
        sb_open=resolved["sb_open"],
        bb_call_vs_open=resolved["bb_call_vs_open"],
    )


def range_action_to_shark_string(actions: dict[str, dict[str, float]], action_name: str) -> str:
    tokens: list[str] = []
    for combo, action_map in actions.items():
        frequency = float(action_map.get(action_name, 0.0))
        if frequency <= 0.0:
            continue
        if abs(frequency - 1.0) <= 0.000001:
            tokens.append(combo)
        else:
            tokens.append(f"{combo}:{_format_frequency(frequency)}")
    return ",".join(tokens)


def hash_range_json(range_json: dict) -> str:
    payload = json.dumps(range_json, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _latest_range(db: Session, *, spot: str, stack_bb: int) -> PreflopRange | None:
    return (
        db.query(PreflopRange)
        .filter(PreflopRange.spot == spot, PreflopRange.stack_bb == stack_bb)
        .order_by(PreflopRange.created_at.desc(), PreflopRange.id.desc())
        .first()
    )


def _format_frequency(value: float) -> str:
    return f"{value:.6g}"
