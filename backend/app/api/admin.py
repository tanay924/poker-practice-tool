from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import AuthUser, require_admin_user
from app.db import get_db
from app.models import AnalysisControl, UserReport, utc_now
from app.schemas import AnalysisControlRead, AnalysisControlUpdate, ReportRead

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/analysis/status", response_model=AnalysisControlRead)
def analysis_status(db: Session = Depends(get_db)) -> AnalysisControlRead:
    return _read_control(_get_control(db))


@router.put("/analysis", response_model=AnalysisControlRead)
def update_analysis_control(
    payload: AnalysisControlUpdate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_admin_user),
) -> AnalysisControlRead:
    control = _get_control(db)
    control.enabled = payload.enabled
    control.message = payload.message.strip()
    control.updated_at = utc_now()
    control.updated_by = current_user.user_id
    db.commit()
    db.refresh(control)
    return _read_control(control)


@router.get("/reports", response_model=list[ReportRead])
def list_reports(
    db: Session = Depends(get_db),
    _current_user: AuthUser = Depends(require_admin_user),
) -> list[ReportRead]:
    return db.query(UserReport).order_by(UserReport.created_at.desc(), UserReport.id.desc()).limit(200).all()


def _get_control(db: Session) -> AnalysisControl:
    control = db.get(AnalysisControl, 1)
    if control is None:
        control = AnalysisControl(id=1, enabled=True, message="Analysis is available")
        db.add(control)
        db.commit()
        db.refresh(control)
    return control


def _read_control(control: AnalysisControl) -> AnalysisControlRead:
    return AnalysisControlRead(enabled=control.enabled, message=control.message, updated_at=control.updated_at)
