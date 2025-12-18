from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    first_name: Mapped[str | None] = mapped_column(String)
    last_name: Mapped[str | None] = mapped_column(String)

    loyalty_tier: Mapped[str | None] = mapped_column(String, index=True)

    preferences: Mapped[dict] = mapped_column(JSON)  # e.g. dining, accessibility


class BookingHistory(Base):
    __tablename__ = "booking_history"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # booking_id
    customer_id: Mapped[str | None] = mapped_column(String, index=True)
    sailing_id: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    meta: Mapped[dict] = mapped_column(JSON)
