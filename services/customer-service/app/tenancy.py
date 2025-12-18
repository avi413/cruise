from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from .models import Base

CONTROL_PLANE_DATABASE_URL = os.getenv(
    "CONTROL_PLANE_DATABASE_URL",
    "sqlite+pysqlite:///./control-plane.db",
)
TENANT_DATABASE_URL_TEMPLATE = os.getenv(
    "TENANT_DATABASE_URL_TEMPLATE",
    "sqlite+pysqlite:///./tenant_{db}.db",
)


@lru_cache(maxsize=32)
def _control_plane_engine() -> Engine:
    return create_engine(CONTROL_PLANE_DATABASE_URL, pool_pre_ping=True)


@lru_cache(maxsize=256)
def tenant_engine(tenant_db: str) -> Engine:
    url = TENANT_DATABASE_URL_TEMPLATE.format(db=tenant_db)
    eng = create_engine(url, pool_pre_ping=True)
    Base.metadata.create_all(eng)
    return eng


def _lookup_tenant_db(company_id: str) -> str:
    with _control_plane_engine().connect() as conn:
        r = conn.execute(text("SELECT tenant_db FROM companies WHERE id = :id"), {"id": company_id}).fetchone()
    if r is None or not r[0]:
        raise HTTPException(status_code=400, detail="Unknown company_id")
    return str(r[0])


@lru_cache(maxsize=256)
def tenant_engine_for_company(company_id: str) -> Engine:
    tenant_db = _lookup_tenant_db(company_id)
    return tenant_engine(tenant_db)


def get_company_id(x_company_id: Annotated[str | None, Header()] = None) -> str:
    if not x_company_id:
        raise HTTPException(status_code=400, detail="Missing X-Company-Id header")
    return x_company_id


def get_tenant_db(company_id: Annotated[str, Depends(get_company_id)]) -> str:
    return _lookup_tenant_db(company_id)


def get_tenant_engine(tenant_db: Annotated[str, Depends(get_tenant_db)]) -> Engine:
    return tenant_engine(tenant_db)
