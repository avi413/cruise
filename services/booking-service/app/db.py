import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+pysqlite:///./booking-dev.db",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def session() -> Session:
    return Session(engine)
