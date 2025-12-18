from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session


def session(engine: Engine) -> Session:
    return Session(engine)
