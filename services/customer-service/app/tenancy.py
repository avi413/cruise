from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

# Import all models to ensure they are registered in Base.metadata before create_all() runs.
from .models import (
    AuditLog,
    Base,
    BookingHistory,
    Customer,
    Passenger,
    StaffGroup,
    StaffGroupMember,
    StaffUser,
    StaffUserPreference,
    StaffAnnouncement,
    StaffAnnouncementRead,
)

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
    
    # Ensure tables exist
    Base.metadata.create_all(eng)
    
    # Attempt to apply extra schema updates (idempotent)
    try:
        _ensure_schema(eng)
    except Exception as e:
        # Log but don't fail; create_all covers the fresh install case.
        print(f"Warning: _ensure_schema failed: {e}")
        
    return eng


def _ensure_schema(eng: Engine) -> None:
    """
    Lightweight auto-migration for this starter repo.

    We use SQLAlchemy `create_all()` for new installs, but that does not add new columns
    to existing tables. For local/dev this helper keeps tenant DBs compatible as the
    schema evolves.
    """
    dialect = (eng.dialect.name or "").lower()
    if dialect not in {"sqlite", "postgresql"}:
        # Unknown DB: rely on create_all and fail fast if schema incompatible.
        return

    # Column DDL snippets (minimal types for cross-db compatibility).
    # NOTE: SQLite ignores length constraints.
    customers_add: dict[str, str] = {
        "title": "VARCHAR",
        "phone": "VARCHAR",
        "address_line1": "VARCHAR",
        "address_line2": "VARCHAR",
        "city": "VARCHAR",
        "state": "VARCHAR",
        "postal_code": "VARCHAR",
        "country": "VARCHAR",
        "national_id_number": "VARCHAR",
        "national_id_country": "VARCHAR",
        "passport_number": "VARCHAR",
        "passport_country": "VARCHAR",
        "passport_expiry": "DATE",
        "birth_date": "DATE",
    }

    passengers_add: dict[str, str] = {
        "title": "VARCHAR",
        "birth_date": "DATE",
        "gender": "VARCHAR",
        "nationality": "VARCHAR",
        "email": "VARCHAR",
        "phone": "VARCHAR",
        "address_line1": "VARCHAR",
        "address_line2": "VARCHAR",
        "city": "VARCHAR",
        "state": "VARCHAR",
        "postal_code": "VARCHAR",
        "country": "VARCHAR",
        "national_id_number": "VARCHAR",
        "national_id_country": "VARCHAR",
        "passport_number": "VARCHAR",
        "passport_country": "VARCHAR",
        "passport_expiry": "DATE",
    }

    with eng.begin() as conn:
        if dialect == "sqlite":
            # sqlite: PRAGMA table_info
            existing_customers = {str(r[1]) for r in conn.execute(text("PRAGMA table_info(customers)")).fetchall()}
            for col, ddl in customers_add.items():
                if col in existing_customers:
                    continue
                conn.execute(text(f"ALTER TABLE customers ADD COLUMN {col} {ddl}"))

            # passengers table will be created by create_all if missing; ensure extra columns if table already exists.
            existing_passengers = {str(r[1]) for r in conn.execute(text("PRAGMA table_info(passengers)")).fetchall()}
            if existing_passengers:
                for col, ddl in passengers_add.items():
                    if col in existing_passengers:
                        continue
                    conn.execute(text(f"ALTER TABLE passengers ADD COLUMN {col} {ddl}"))

        if dialect == "postgresql":
            # For Postgres, we use IF NOT EXISTS which is safe.
            # However, we must ensure the table exists first. create_all() should have handled it.
            for col, ddl in customers_add.items():
                conn.execute(text(f"ALTER TABLE customers ADD COLUMN IF NOT EXISTS {col} {ddl}"))
            
            for col, ddl in passengers_add.items():
                conn.execute(text(f"ALTER TABLE passengers ADD COLUMN IF NOT EXISTS {col} {ddl}"))


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
