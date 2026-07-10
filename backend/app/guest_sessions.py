from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets

from sqlalchemy.orm import Session

from app.models import GuestSession, utc_now

GUEST_SESSION_COOKIE = "poker_trainer_guest"
GUEST_SESSION_TTL_DAYS = 30
GUEST_ANALYSIS_TRIAL_LIMIT = 5
GUEST_PREFLOP_TRIAL_LIMIT = 5


def issue_guest_session(db: Session) -> tuple[str, GuestSession]:
    secret = secrets.token_urlsafe(32)
    now = utc_now()
    session = GuestSession(
        session_id=guest_session_digest(secret),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=guest_session_ttl_days()),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return secret, session


def guest_session_digest(secret: str) -> str:
    key = os.getenv("GUEST_SESSION_HMAC_KEY")
    if key:
        return hmac.new(key.encode("utf-8"), secret.encode("utf-8"), hashlib.sha256).hexdigest()
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def resolve_guest_session(db: Session, secret: str | None) -> GuestSession | None:
    if not secret or len(secret) < 32 or len(secret) > 128:
        return None
    session = db.get(GuestSession, guest_session_digest(secret))
    if session is None or session.revoked_at is not None or _utc(session.expires_at) <= utc_now():
        return None

    now = utc_now()
    if _utc(session.last_seen_at) + timedelta(minutes=10) <= now:
        session.last_seen_at = now
        db.commit()
    return session


def guest_session_ttl_days() -> int:
    try:
        return max(1, min(int(os.getenv("GUEST_SESSION_TTL_DAYS", str(GUEST_SESSION_TTL_DAYS))), 365))
    except ValueError:
        return GUEST_SESSION_TTL_DAYS


def guest_cookie_secure() -> bool:
    return os.getenv("ENVIRONMENT", "local").strip().lower() not in {"local", "development", "test"}


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
