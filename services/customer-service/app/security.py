import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"


def issue_token(sub: str, role: str, ttl_minutes: int = 60, extra_claims: dict | None = None) -> str:
    now = datetime.now(tz=timezone.utc)
    payload: dict = {
        "sub": sub,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


def get_principal(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return decode_token(creds.credentials)


def get_principal_optional(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
) -> Optional[dict]:
    if creds is None:
        return None
    return decode_token(creds.credentials)


def require_roles(*allowed_roles: str):
    allowed = set(allowed_roles)

    def _dep(principal: Annotated[dict, Depends(get_principal)]) -> dict:
        role = principal.get("role")
        if role not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden")
        return principal

    return _dep
