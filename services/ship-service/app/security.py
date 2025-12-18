import os
from typing import Annotated, Iterable, Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"


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


def require_roles(*allowed_roles: str):
    allowed = set(allowed_roles)

    def _dep(principal: Annotated[dict, Depends(get_principal)]) -> dict:
        role = principal.get("role")
        if role not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden")
        return principal

    return _dep
