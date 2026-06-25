from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PreflopRange
from app.ranges.parser import parse_preflop_range
from app.schemas import RangeImportRequest, RangeRead

router = APIRouter(prefix="/api/ranges", tags=["ranges"])


@router.post("/import", response_model=RangeRead)
def import_range(payload: RangeImportRequest, db: Session = Depends(get_db)) -> PreflopRange:
    try:
        parsed = parse_preflop_range(payload.model_dump())
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    imported = PreflopRange(
        name=parsed.name,
        spot=parsed.spot,
        stack_bb=parsed.stack_bb,
        source="json",
        range_json=parsed.model_dump(),
    )
    db.add(imported)
    db.commit()
    db.refresh(imported)
    return imported


@router.get("", response_model=list[RangeRead])
def list_ranges(db: Session = Depends(get_db)) -> list[PreflopRange]:
    return db.query(PreflopRange).order_by(PreflopRange.created_at.desc()).all()
