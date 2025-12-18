from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from .consumer import start_consumer
from .db import session
from .models import BookingHistory, Customer
from .security import require_roles
from .tenancy import get_tenant_engine

app = FastAPI(
    title="Customer Management (CRM) Service",
    version="0.1.0",
    description="Customer profiles, preferences, loyalty/rewards, and booking history (projected from events).",
)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


@app.on_event("startup")
async def _startup():
    # Run event consumer in background
    asyncio.create_task(start_consumer())


@app.get("/health")
def health():
    return {"status": "ok"}


class CustomerCreate(BaseModel):
    email: str
    first_name: str | None = None
    last_name: str | None = None
    loyalty_tier: str | None = None
    preferences: dict = Field(default_factory=dict)


class CustomerOut(CustomerCreate):
    id: str
    created_at: datetime
    updated_at: datetime


@app.post("/customers", response_model=CustomerOut)
def create_customer(
    payload: CustomerCreate,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("agent", "staff", "admin")),
):
    now = _now()
    cust = Customer(
        id=str(uuid4()),
        created_at=now,
        updated_at=now,
        email=payload.email.lower().strip(),
        first_name=payload.first_name,
        last_name=payload.last_name,
        loyalty_tier=payload.loyalty_tier,
        preferences=payload.preferences,
    )

    with session(tenant_engine) as s:
        existing = s.query(Customer).filter(Customer.email == cust.email).first()
        if existing is not None:
            raise HTTPException(status_code=409, detail="Customer email already exists")
        s.add(cust)
        s.commit()

    return CustomerOut(**payload.model_dump(), id=cust.id, created_at=cust.created_at, updated_at=cust.updated_at)


@app.get("/customers/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: str,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("guest", "agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        cust = s.get(Customer, customer_id)
        if cust is None:
            raise HTTPException(status_code=404, detail="Customer not found")

    return CustomerOut(
        id=cust.id,
        created_at=cust.created_at,
        updated_at=cust.updated_at,
        email=cust.email,
        first_name=cust.first_name,
        last_name=cust.last_name,
        loyalty_tier=cust.loyalty_tier,
        preferences=cust.preferences,
    )


class CustomerPatch(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    loyalty_tier: str | None = None
    preferences: dict | None = None


@app.patch("/customers/{customer_id}", response_model=CustomerOut)
def patch_customer(
    customer_id: str,
    payload: CustomerPatch,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        cust = s.get(Customer, customer_id)
        if cust is None:
            raise HTTPException(status_code=404, detail="Customer not found")

        if payload.first_name is not None:
            cust.first_name = payload.first_name
        if payload.last_name is not None:
            cust.last_name = payload.last_name
        if payload.loyalty_tier is not None:
            cust.loyalty_tier = payload.loyalty_tier
        if payload.preferences is not None:
            cust.preferences = payload.preferences

        cust.updated_at = _now()
        s.add(cust)
        s.commit()

    return get_customer(customer_id)


class BookingHistoryOut(BaseModel):
    booking_id: str
    sailing_id: str
    status: str
    updated_at: datetime
    meta: dict


@app.get("/customers/{customer_id}/bookings", response_model=list[BookingHistoryOut])
def list_customer_bookings(
    customer_id: str,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("guest", "agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        rows = (
            s.query(BookingHistory)
            .filter(BookingHistory.customer_id == customer_id)
            .order_by(BookingHistory.updated_at.desc())
            .all()
        )

    return [
        BookingHistoryOut(
            booking_id=r.id,
            sailing_id=r.sailing_id,
            status=r.status,
            updated_at=r.updated_at,
            meta=r.meta,
        )
        for r in rows
    ]
