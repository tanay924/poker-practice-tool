from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient, PyJWTError, decode


@dataclass(frozen=True)
class AuthUser:
    user_id: str
    email: str | None = None


class AuthNotConfiguredError(RuntimeError):
    pass


def require_current_user(authorization: Annotated[str | None, Header()] = None) -> AuthUser:
    token = _bearer_token(authorization)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required")

    try:
        claims = verify_supabase_jwt(token)
    except AuthNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from exc

    user_id = claims.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session subject")

    email = claims.get("email")
    return AuthUser(user_id=user_id, email=email if isinstance(email, str) else None)


def require_admin_user(current_user: Annotated[AuthUser, Depends(require_current_user)]) -> AuthUser:
    if current_user.user_id not in _admin_user_ids():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    project_url = _supabase_project_url()
    if project_url is None:
        raise AuthNotConfiguredError("Authentication is not configured")

    issuer = f"{project_url}/auth/v1"
    audience = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    legacy_secret = os.getenv("SUPABASE_JWT_SECRET")
    if legacy_secret:
        return decode(token, legacy_secret, algorithms=["HS256"], audience=audience, issuer=issuer)

    jwks_url = f"{issuer}/.well-known/jwks.json"
    signing_key = _jwk_client(jwks_url).get_signing_key_from_jwt(token)
    return decode(
        token,
        signing_key.key,
        algorithms=["RS256", "ES256", "EdDSA"],
        audience=audience,
        issuer=issuer,
    )


_JWK_CLIENTS: dict[str, PyJWKClient] = {}


def _jwk_client(jwks_url: str) -> PyJWKClient:
    client = _JWK_CLIENTS.get(jwks_url)
    if client is None:
        client = PyJWKClient(jwks_url)
        _JWK_CLIENTS[jwks_url] = client
    return client


def _supabase_project_url() -> str | None:
    raw = os.getenv("SUPABASE_PROJECT_URL") or os.getenv("VITE_SUPABASE_URL")
    if not raw:
        return None
    return raw.rstrip("/")


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def _admin_user_ids() -> set[str]:
    raw = os.getenv("POKER_TRAINER_ADMIN_USER_IDS", "")
    return {user_id.strip() for user_id in raw.split(",") if user_id.strip()}
