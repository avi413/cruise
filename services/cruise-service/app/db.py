import os
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# Connect to the shared Postgres instance
CONTROL_PLANE_DATABASE_URL = os.getenv(
    "CONTROL_PLANE_DATABASE_URL",
    "sqlite+pysqlite:///./cruise-control-plane.db",
)

engine = create_engine(CONTROL_PLANE_DATABASE_URL, pool_pre_ping=True)

def session() -> Session:
    return Session(engine)