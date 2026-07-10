from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.guest_sessions import (
    GUEST_ANALYSIS_TRIAL_LIMIT,
    GUEST_PREFLOP_TRIAL_LIMIT,
    GUEST_SESSION_COOKIE,
    guest_cookie_secure,
    issue_guest_session,
    resolve_guest_session,
)
from app.schemas import GuestSessionRead

router = APIRouter(prefix="/api/guest-sessions", tags=["guest-sessions"])


@router.post("", response_model=GuestSessionRead)
def create_guest_session(
    response: Response,
    db: Session = Depends(get_db),
    guest_session_cookie: Annotated[str | None, Cookie(alias=GUEST_SESSION_COOKIE)] = None,
) -> GuestSessionRead:
    session = resolve_guest_session(db, guest_session_cookie) if guest_session_cookie else None
    if session is None:
        secret, session = issue_guest_session(db)
        response.set_cookie(
            key=GUEST_SESSION_COOKIE,
            value=secret,
            max_age=(session.expires_at - session.created_at).days * 86400,
            httponly=True,
            secure=guest_cookie_secure(),
            samesite="lax",
            path="/",
        )
    return GuestSessionRead(
        **_allowance_for(session),
    )


@router.post("/use-preflop", response_model=GuestSessionRead)
def consume_preflop_trial(
    db: Session = Depends(get_db),
    guest_session_cookie: Annotated[str | None, Cookie(alias=GUEST_SESSION_COOKIE)] = None,
) -> GuestSessionRead:
    session = resolve_guest_session(db, guest_session_cookie)
    if session is None:
        raise HTTPException(status_code=401, detail="Valid guest session required")
    if session.preflop_trials_used >= GUEST_PREFLOP_TRIAL_LIMIT:
        raise HTTPException(status_code=403, detail="Free preflop trial used. Sign in to keep practicing.")
    session.preflop_trials_used += 1
    db.commit()
    db.refresh(session)
    return GuestSessionRead(**_allowance_for(session))


def _allowance_for(session) -> dict[str, object]:
    return {
        "expires_at": session.expires_at,
        "analysis_remaining": max(GUEST_ANALYSIS_TRIAL_LIMIT - session.analysis_trials_used, 0),
        "preflop_remaining": max(GUEST_PREFLOP_TRIAL_LIMIT - session.preflop_trials_used, 0),
    }
