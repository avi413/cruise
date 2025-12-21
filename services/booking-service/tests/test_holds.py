import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine

# Ensure `services/booking-service` is on sys.path so `import app` works when
# running tests from the monorepo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import events
from app.main import HoldRequest, create_hold
from app.models import Base


class _DummyResponse:
    def __init__(self, status_code: int, json_data: dict):
        self.status_code = status_code
        self._json = json_data
        self.text = "dummy"

    def json(self):
        return self._json


class _DummyAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, json=None, headers=None):
        # booking-service expects `total` and `lines` (list[dict]) at minimum.
        return _DummyResponse(
            200,
            {
                "currency": "USD",
                "subtotal": 100_00,
                "discounts": 0,
                "taxes_fees": 8_00,
                "total": 108_00,
                "lines": [
                    {"code": "fare.adult", "description": "Base fare (adult) x1", "amount": 100_00},
                    {"code": "taxes_fees", "description": "Estimated taxes & fees (8%)", "amount": 8_00},
                ],
            },
        )


@pytest.mark.anyio
async def test_create_hold_succeeds_when_rabbitmq_down(monkeypatch):
    # Ensure default best-effort behavior.
    monkeypatch.delenv("EVENTS_STRICT", raising=False)
    monkeypatch.setattr(events, "EVENTS_STRICT", False)

    async def _boom(*args, **kwargs):
        raise RuntimeError("rabbitmq down")

    # Simulate RabbitMQ being unavailable.
    monkeypatch.setattr(events.aio_pika, "connect_robust", _boom)

    # Avoid network call to pricing-service.
    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _DummyAsyncClient)

    # In-memory tenant DB.
    eng = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(eng)

    payload = HoldRequest(
        sailing_id="dd78f1d9-5298-48dc-8368-488aff85e693",
        cabin_type="inside",
        guests={"adult": 2, "child": 0, "infant": 0},
        hold_minutes=15,
    )

    out = await create_hold(payload=payload, company_id="company-1", tenant_engine=eng, _principal={"role": "guest"})
    assert out.status == "held"
    assert out.sailing_id == payload.sailing_id
    assert out.quote.total == 108_00

