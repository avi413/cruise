from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class SailingInventory(Base):
    __tablename__ = "sailing_inventory"
    __table_args__ = (UniqueConstraint("sailing_id", "cabin_type", name="uq_sailing_inventory_sailing_cabin_type"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sailing_id: Mapped[str] = mapped_column(String, index=True)
    cabin_type: Mapped[str] = mapped_column(String, index=True)  # inside|oceanview|balcony|suite (or future)

    capacity: Mapped[int] = mapped_column(Integer, default=0)  # max sellable
    held: Mapped[int] = mapped_column(Integer, default=0)
    confirmed: Mapped[int] = mapped_column(Integer, default=0)


class SailingCategoryInventory(Base):
    """
    Inventory bucket keyed by cabin category code (e.g. CO3).

    This lets ops manage true category availability (not just cabin_type).
    """

    __tablename__ = "sailing_category_inventory"
    __table_args__ = (UniqueConstraint("sailing_id", "category_code", name="uq_sailing_category_inventory_sailing_category"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sailing_id: Mapped[str] = mapped_column(String, index=True)
    category_code: Mapped[str] = mapped_column(String, index=True)  # e.g. CO3

    capacity: Mapped[int] = mapped_column(Integer, default=0)
    held: Mapped[int] = mapped_column(Integer, default=0)
    confirmed: Mapped[int] = mapped_column(Integer, default=0)


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    company_id: Mapped[str] = mapped_column(String, index=True)

    status: Mapped[str] = mapped_column(String, index=True)  # held|confirmed|cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    customer_id: Mapped[str | None] = mapped_column(String, index=True)
    sailing_id: Mapped[str] = mapped_column(String, index=True)

    booking_ref: Mapped[str | None] = mapped_column(String, index=True)

    cabin_type: Mapped[str] = mapped_column(String, index=True)
    cabin_category_code: Mapped[str | None] = mapped_column(String, index=True)
    cabin_id: Mapped[str | None] = mapped_column(String, index=True)

    guests: Mapped[dict] = mapped_column(JSON)  # {"adult": 2, "child": 1, "infant": 0}

    currency: Mapped[str] = mapped_column(String, default="USD")
    quote_total: Mapped[int] = mapped_column(Integer)
    quote_breakdown: Mapped[list] = mapped_column(JSON)

    coupon_code: Mapped[str | None] = mapped_column(String)
    loyalty_tier: Mapped[str | None] = mapped_column(String)
