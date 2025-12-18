from __future__ import annotations

import os
import re

import psycopg
from psycopg import sql

POSTGRES_ADMIN_DSN = os.getenv(
    "POSTGRES_ADMIN_DSN",
    # points at a database that always exists
    "postgresql://cruise:cruise@localhost:5432/postgres",
)

TENANT_DB_PREFIX = os.getenv("TENANT_DB_PREFIX", "tenant_")


def tenant_db_name_from_code(company_code: str) -> str:
    code = company_code.strip().lower()
    # keep it safe for postgres identifiers; map others to underscore
    code = re.sub(r"[^a-z0-9_]+", "_", code)
    code = code.strip("_")
    if not code:
        raise ValueError("Invalid company code")
    return f"{TENANT_DB_PREFIX}{code}"


def ensure_tenant_database(db_name: str) -> None:
    """Create tenant database if it doesn't exist."""
    with psycopg.connect(POSTGRES_ADMIN_DSN, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
            exists = cur.fetchone() is not None
            if exists:
                return
            cur.execute(sql.SQL("CREATE DATABASE {};").format(sql.Identifier(db_name)))
