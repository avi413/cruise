from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import events
from .db import engine, session
from .models import Base, Booking
from .security import require_roles

Base.metadata.create_all(engine)

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
    guests: dict
    quote: QuoteOut


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/holds", response_model=BookingOut)
async def create_hold(payload: HoldRequest, _principal=Depends(require_roles("guest", "agent", "staff", "admin"))):
    # Quote via pricing-service
    pricing_url = __import__("os").getenv("PRICING_SERVICE_URL", "http://localhost:8004")
    req = {
        "sailing_date": payload.sailing_date.date().isoformat() if payload.sailing_date else None,
        "cabin_type": payload.cabin_type,
        "guests": payload.guests.as_guest_list(),
        "coupon_code": payload.coupon_code,
        "loyalty_tier": payload.loyalty_tier,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(f"{pricing_url}/quote", json=req)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail={"pricing_error": r.text})
        quote = r.json()

    now = _now()
    hold_expires_at = now + timedelta(minutes=max(1, min(payload.hold_minutes, 60)))

    booking = Booking(
        id=str(uuid4()),
        status="held",
        created_at=now,
        updated_at=now,
        hold_expires_at=hold_expires_at,
        customer_id=payload.customer_id,
        sailing_id=payload.sailing_id,
        cabin_type=payload.cabin_type,
        cabin_id=None,
        guests=payload.guests.model_dump(),
        currency=quote.get("currency", "USD"),
        quote_total=int(quote["total"]),
        quote_breakdown=quote.get("lines", []),
        coupon_code=payload.coupon_code,
        loyalty_tier=payload.loyalty_tier,
    )

    with session() as s:
        s.add(booking)
        s.commit()

    await events.publish(
        "booking.held",
        {
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
def get_booking(booking_id: str, _principal=Depends(require_roles("guest", "agent", "staff", "admin"))):
    with session() as s:
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
    _principal=Depends(require_roles("guest", "agent", "staff", "admin")),
):
    now = _now()
    with session() as s:
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

        booking.status = "confirmed"
        booking.updated_at = now
        booking.hold_expires_at = None

        s.add(booking)
        s.commit()

    await events.publish(
        "booking.confirmed",
        {
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
