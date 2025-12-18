from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    status: Mapped[str] = mapped_column(String, index=True)  # held|confirmed|cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    customer_id: Mapped[str | None] = mapped_column(String, index=True)
    sailing_id: Mapped[str] = mapped_column(String, index=True)

    cabin_type: Mapped[str] = mapped_column(String, index=True)
    cabin_id: Mapped[str | None] = mapped_column(String, index=True)

    guests: Mapped[dict] = mapped_column(JSON)  # {"adult": 2, "child": 1, "infant": 0}

    currency: Mapped[str] = mapped_column(String, default="USD")
    quote_total: Mapped[int] = mapped_column(Integer)
    quote_breakdown: Mapped[list] = mapped_column(JSON)

    coupon_code: Mapped[str | None] = mapped_column(String)
    loyalty_tier: Mapped[str | None] = mapped_column(String)
