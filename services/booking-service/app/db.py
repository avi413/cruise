from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session


def session(engine: Engine) -> Session:
    # This service commonly returns ORM objects (or reads their fields) after
    # committing inside a short-lived session context. Prevent attributes from
    # being expired on commit to avoid DetachedInstanceError.
    return Session(engine, expire_on_commit=False)
