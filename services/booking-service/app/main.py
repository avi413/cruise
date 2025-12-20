from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import events
from .db import session
from .models import Booking, SailingCategoryInventory, SailingInventory
from .security import require_roles
from .tenancy import get_company_id, get_tenant_engine

app = FastAPI(
    title="Cabin & Booking Management Service",
    version="0.1.0",
    description="Cabin search/allocation (stub), reservation holds/locks, and booking confirmation with real-time availability hooks.",
)


class GuestCounts(BaseModel):
    adult: int = 1
    child: int = 0
    infant: int = 0

    def as_guest_list(self) -> list[dict]:
        guests: list[dict] = []
        for _ in range(self.adult):
            guests.append({"paxtype": "adult"})
        for _ in range(self.child):
            guests.append({"paxtype": "child"})
        for _ in range(self.infant):
            guests.append({"paxtype": "infant"})
        return guests


class HoldRequest(BaseModel):
    customer_id: str | None = None
    sailing_id: str
    sailing_date: datetime | None = None
    cabin_type: Literal["inside", "oceanview", "balcony", "suite"] = "inside"
    cabin_category_code: str | None = Field(default=None, description="Optional cabin category code (e.g. CO3) for category-based pricing")
    price_type: str = Field(default="regular", min_length=1, description="Price type / rate plan for category pricing (e.g. regular, internet)")
    guests: GuestCounts = Field(default_factory=GuestCounts)
    coupon_code: str | None = None
    loyalty_tier: str | None = None
    hold_minutes: int = 15


class QuoteOut(BaseModel):
    currency: str
    subtotal: int
    discounts: int
    taxes_fees: int
    total: int
    lines: list[dict]


class BookingOut(BaseModel):
    id: str
    status: str
    created_at: datetime
    updated_at: datetime
    hold_expires_at: datetime | None
    customer_id: str | None
    sailing_id: str
    cabin_type: str
    cabin_category_code: str | None = None
    guests: dict
    quote: QuoteOut


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _release_expired_holds(tenant_engine) -> int:
    """
    Best-effort cleanup to prevent inventory getting stuck in held state.
    This is NOT a background scheduler; it's invoked on write paths.
    """
    now = _now()
    released = 0
    with session(tenant_engine) as s:
        expired = (
            s.query(Booking)
            .filter(Booking.status == "held")
            .filter(Booking.hold_expires_at.isnot(None))
            .filter(Booking.hold_expires_at < now)
            .all()
        )

        for b in expired:
            inv = (
                s.query(SailingInventory)
                .filter(SailingInventory.sailing_id == b.sailing_id)
                .filter(SailingInventory.cabin_type == b.cabin_type)
                .first()
            )
            if inv is not None and inv.held > 0:
                inv.held = max(0, inv.held - 1)
                s.add(inv)

            b.status = "cancelled"
            b.updated_at = now
            b.hold_expires_at = None
            s.add(b)
            released += 1

        s.commit()
    return released


def _ensure_inventory_row(s, sailing_id: str, cabin_type: str) -> SailingInventory:
    inv = (
        s.query(SailingInventory)
        .filter(SailingInventory.sailing_id == sailing_id)
        .filter(SailingInventory.cabin_type == cabin_type)
        .first()
    )
    if inv is None:
        # Starter-friendly default to avoid breaking flows; portal can set real capacity.
        inv = SailingInventory(
            id=str(uuid4()),
            sailing_id=sailing_id,
            cabin_type=cabin_type,
            capacity=999,
            held=0,
            confirmed=0,
        )
        s.add(inv)
        s.commit()
        s.refresh(inv)
    return inv


def _ensure_category_inventory_row(s, sailing_id: str, category_code: str) -> SailingCategoryInventory:
    code = (category_code or "").strip().upper()
    inv = (
        s.query(SailingCategoryInventory)
        .filter(SailingCategoryInventory.sailing_id == sailing_id)
        .filter(SailingCategoryInventory.category_code == code)
        .first()
    )
    if inv is None:
        inv = SailingCategoryInventory(
            id=str(uuid4()),
            sailing_id=sailing_id,
            category_code=code,
            capacity=999,
            held=0,
            confirmed=0,
        )
        s.add(inv)
        s.commit()
        s.refresh(inv)
    return inv


@app.get("/health")
def health():
    return {"status": "ok"}


class InventoryUpsert(BaseModel):
    cabin_type: str
    capacity: int = Field(ge=0)


class InventoryOut(BaseModel):
    sailing_id: str
    cabin_type: str
    capacity: int
    held: int
    confirmed: int
    available: int


@app.get("/inventory/sailings/{sailing_id}", response_model=list[InventoryOut])
def get_inventory(
    sailing_id: str,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        rows = s.query(SailingInventory).filter(SailingInventory.sailing_id == sailing_id).all()
    return [
        InventoryOut(
            sailing_id=r.sailing_id,
            cabin_type=r.cabin_type,
            capacity=r.capacity,
            held=r.held,
            confirmed=r.confirmed,
            available=max(0, r.capacity - r.held - r.confirmed),
        )
        for r in rows
    ]


@app.post("/inventory/sailings/{sailing_id}", response_model=InventoryOut)
def upsert_inventory(
    sailing_id: str,
    payload: InventoryUpsert,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("staff", "admin")),
):
    if not payload.cabin_type.strip():
        raise HTTPException(status_code=400, detail="cabin_type is required")
    with session(tenant_engine) as s:
        inv = _ensure_inventory_row(s, sailing_id=sailing_id, cabin_type=payload.cabin_type.strip())
        inv.capacity = int(payload.capacity)
        # Clamp held/confirmed to capacity if capacity reduced.
        inv.held = min(inv.held, inv.capacity)
        inv.confirmed = min(inv.confirmed, inv.capacity - inv.held)
        s.add(inv)
        s.commit()
        s.refresh(inv)
    return InventoryOut(
        sailing_id=inv.sailing_id,
        cabin_type=inv.cabin_type,
        capacity=inv.capacity,
        held=inv.held,
        confirmed=inv.confirmed,
        available=max(0, inv.capacity - inv.held - inv.confirmed),
    )


class CategoryInventoryUpsert(BaseModel):
    category_code: str
    capacity: int = Field(ge=0)


class CategoryInventoryOut(BaseModel):
    sailing_id: str
    category_code: str
    capacity: int
    held: int
    confirmed: int
    available: int


@app.get("/inventory/sailings/{sailing_id}/categories", response_model=list[CategoryInventoryOut])
def get_category_inventory(
    sailing_id: str,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        rows = s.query(SailingCategoryInventory).filter(SailingCategoryInventory.sailing_id == sailing_id).all()
    return [
        CategoryInventoryOut(
            sailing_id=r.sailing_id,
            category_code=r.category_code,
            capacity=r.capacity,
            held=r.held,
            confirmed=r.confirmed,
            available=max(0, r.capacity - r.held - r.confirmed),
        )
        for r in rows
    ]


@app.post("/inventory/sailings/{sailing_id}/categories", response_model=CategoryInventoryOut)
def upsert_category_inventory(
    sailing_id: str,
    payload: CategoryInventoryUpsert,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("staff", "admin")),
):
    code = (payload.category_code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="category_code is required")
    with session(tenant_engine) as s:
        inv = _ensure_category_inventory_row(s, sailing_id=sailing_id, category_code=code)
        inv.capacity = int(payload.capacity)
        inv.held = min(inv.held, inv.capacity)
        inv.confirmed = min(inv.confirmed, max(0, inv.capacity - inv.held))
        s.add(inv)
        s.commit()
        s.refresh(inv)
    return CategoryInventoryOut(
        sailing_id=inv.sailing_id,
        category_code=inv.category_code,
        capacity=inv.capacity,
        held=inv.held,
        confirmed=inv.confirmed,
        available=max(0, inv.capacity - inv.held - inv.confirmed),
    )


@app.post("/holds", response_model=BookingOut)
async def create_hold(
    payload: HoldRequest,
    company_id=Depends(get_company_id),
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("guest", "agent", "staff", "admin")),
):
    # Prevent stale holds from blocking inventory.
    _release_expired_holds(tenant_engine)

    # Quote via pricing-service
    pricing_url = __import__("os").getenv("PRICING_SERVICE_URL", "http://localhost:8004")
    req = {
        "sailing_date": payload.sailing_date.date().isoformat() if payload.sailing_date else None,
        "cabin_type": payload.cabin_type,
        "cabin_category_code": payload.cabin_category_code,
        "price_type": (payload.price_type or "regular"),
        "guests": payload.guests.as_guest_list(),
        "coupon_code": payload.coupon_code,
        "loyalty_tier": payload.loyalty_tier,
    }

    # Ignore HTTP(S)_PROXY env vars for internal service calls.
    async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
        r = await client.post(f"{pricing_url}/quote", json=req, headers={"X-Company-Id": company_id})
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail={"pricing_error": r.text})
        quote = r.json()

    now = _now()
    hold_expires_at = now + timedelta(minutes=max(1, min(payload.hold_minutes, 60)))

    booking = Booking(
        id=str(uuid4()),
        company_id=company_id,
        status="held",
        created_at=now,
        updated_at=now,
        hold_expires_at=hold_expires_at,
        customer_id=payload.customer_id,
        sailing_id=payload.sailing_id,
        cabin_type=payload.cabin_type,
        cabin_category_code=(payload.cabin_category_code.strip().upper() if payload.cabin_category_code else None),
        cabin_id=None,
        guests=payload.guests.model_dump(),
        currency=quote.get("currency", "USD"),
        quote_total=int(quote["total"]),
        quote_breakdown=quote.get("lines", []),
        coupon_code=payload.coupon_code,
        loyalty_tier=payload.loyalty_tier,
    )

    with session(tenant_engine) as s:
        # If a category code was provided, allocate inventory from that bucket.
        if booking.cabin_category_code:
            cinv = _ensure_category_inventory_row(s, sailing_id=booking.sailing_id, category_code=booking.cabin_category_code)
            available = max(0, cinv.capacity - cinv.held - cinv.confirmed)
            if available <= 0:
                raise HTTPException(status_code=409, detail="Sold out (category)")
            cinv.held += 1
            s.add(cinv)
        else:
            inv = _ensure_inventory_row(s, sailing_id=booking.sailing_id, cabin_type=booking.cabin_type)
            available = max(0, inv.capacity - inv.held - inv.confirmed)
            if available <= 0:
                raise HTTPException(status_code=409, detail="Sold out")
            inv.held += 1
            s.add(inv)
        s.add(booking)
        s.commit()

    await events.publish(
        "booking.held",
        {
            "company_id": booking.company_id,
            "booking_id": booking.id,
            "customer_id": booking.customer_id,
            "sailing_id": booking.sailing_id,
            "hold_expires_at": booking.hold_expires_at.isoformat() if booking.hold_expires_at else None,
            "total": booking.quote_total,
            "currency": booking.currency,
        },
    )

    return BookingOut(
        id=booking.id,
        status=booking.status,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        hold_expires_at=booking.hold_expires_at,
        customer_id=booking.customer_id,
        sailing_id=booking.sailing_id,
        cabin_type=booking.cabin_type,
        cabin_category_code=booking.cabin_category_code,
        guests=booking.guests,
        quote=QuoteOut(
            currency=booking.currency,
            subtotal=sum([l["amount"] for l in booking.quote_breakdown if l.get("code", "").startswith("fare.")]),
            discounts=sum([-l["amount"] for l in booking.quote_breakdown if l.get("code") == "discount"]),
            taxes_fees=sum([l["amount"] for l in booking.quote_breakdown if l.get("code") == "taxes_fees"]),
            total=booking.quote_total,
            lines=booking.quote_breakdown,
        ),
    )


@app.get("/bookings/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: str,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("guest", "agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        booking = s.get(Booking, booking_id)
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")

    return BookingOut(
        id=booking.id,
        status=booking.status,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        hold_expires_at=booking.hold_expires_at,
        customer_id=booking.customer_id,
        sailing_id=booking.sailing_id,
        cabin_type=booking.cabin_type,
        cabin_category_code=getattr(booking, "cabin_category_code", None),
        guests=booking.guests,
        quote=QuoteOut(
            currency=booking.currency,
            subtotal=sum([l["amount"] for l in booking.quote_breakdown if l.get("code", "").startswith("fare.")]),
            discounts=sum([-l["amount"] for l in booking.quote_breakdown if l.get("code") == "discount"]),
            taxes_fees=sum([l["amount"] for l in booking.quote_breakdown if l.get("code") == "taxes_fees"]),
            total=booking.quote_total,
            lines=booking.quote_breakdown,
        ),
    )


class ConfirmRequest(BaseModel):
    payment_token: str | None = Field(default=None, description="Placeholder for payment integration")


@app.post("/bookings/{booking_id}/confirm", response_model=BookingOut)
async def confirm_booking(
    booking_id: str,
    _payload: ConfirmRequest,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("guest", "agent", "staff", "admin")),
):
    now = _now()
    # Prevent stale holds from blocking inventory.
    _release_expired_holds(tenant_engine)
    with session(tenant_engine) as s:
        booking = s.get(Booking, booking_id)
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")

        if booking.status != "held":
            raise HTTPException(status_code=409, detail=f"Booking is not holdable (status={booking.status})")

        if booking.hold_expires_at and booking.hold_expires_at < now:
            booking.status = "cancelled"
            booking.updated_at = now
            s.add(booking)
            s.commit()
            raise HTTPException(status_code=409, detail="Hold expired")

        # Move inventory from held -> confirmed in the right bucket.
        cat = (getattr(booking, "cabin_category_code", None) or "").strip().upper()
        if cat:
            inv = (
                s.query(SailingCategoryInventory)
                .filter(SailingCategoryInventory.sailing_id == booking.sailing_id)
                .filter(SailingCategoryInventory.category_code == cat)
                .first()
            )
            if inv is not None:
                inv.held = max(0, inv.held - 1)
                inv.confirmed += 1
                inv.confirmed = min(inv.confirmed, max(0, inv.capacity - inv.held))
                s.add(inv)
        else:
            inv = (
                s.query(SailingInventory)
                .filter(SailingInventory.sailing_id == booking.sailing_id)
                .filter(SailingInventory.cabin_type == booking.cabin_type)
                .first()
            )
            if inv is not None:
                inv.held = max(0, inv.held - 1)
                inv.confirmed += 1
                inv.confirmed = min(inv.confirmed, max(0, inv.capacity - inv.held))
                s.add(inv)

        booking.status = "confirmed"
        booking.updated_at = now
        booking.hold_expires_at = None

        s.add(booking)
        s.commit()

    await events.publish(
        "booking.confirmed",
        {
            "company_id": booking.company_id,
            "booking_id": booking.id,
            "customer_id": booking.customer_id,
            "sailing_id": booking.sailing_id,
            "total": booking.quote_total,
            "currency": booking.currency,
        },
    )

    return BookingOut(
        id=booking.id,
        status=booking.status,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        hold_expires_at=booking.hold_expires_at,
        customer_id=booking.customer_id,
        sailing_id=booking.sailing_id,
        cabin_type=booking.cabin_type,
        cabin_category_code=getattr(booking, "cabin_category_code", None),
        guests=booking.guests,
        quote=QuoteOut(
            currency=booking.currency,
            subtotal=sum([l["amount"] for l in booking.quote_breakdown if l.get("code", "").startswith("fare.")]),
            discounts=sum([-l["amount"] for l in booking.quote_breakdown if l.get("code") == "discount"]),
            taxes_fees=sum([l["amount"] for l in booking.quote_breakdown if l.get("code") == "taxes_fees"]),
            total=booking.quote_total,
            lines=booking.quote_breakdown,
        ),
    )
