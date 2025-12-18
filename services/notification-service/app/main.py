from __future__ import annotations

import asyncio

from fastapi import Depends, FastAPI

from .consumer import start_consumer, store
from .security import require_roles

app = FastAPI(
    title="Notifications & Communications Service",
    version="0.1.0",
    description="Consumes domain events and produces outbound communications (email/SMS/in-app). Demo exposes an in-app feed.",
)


@app.on_event("startup")
async def _startup():
    asyncio.create_task(start_consumer())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/notifications")
def list_notifications(
    customer_id: str | None = None,
    _principal=Depends(require_roles("guest", "agent", "staff", "admin")),
):
    return {"items": store.list(customer_id=customer_id)}
