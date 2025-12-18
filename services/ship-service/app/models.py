from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    name: Mapped[str] = mapped_column(String)
    code: Mapped[str] = mapped_column(String, unique=True, index=True)

    # Separate database per company (tenant)
    tenant_db: Mapped[str] = mapped_column(String, unique=True, index=True)

    ships: Mapped[list[Ship]] = relationship(back_populates="company")  # type: ignore[name-defined]


class Ship(Base):
    __tablename__ = "ships"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    company_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    code: Mapped[str] = mapped_column(String, unique=True, index=True)

    operator: Mapped[str | None] = mapped_column(String)
    decks: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, index=True)

    amenities: Mapped[list] = mapped_column(JSON, default=list)
    maintenance_records: Mapped[list] = mapped_column(JSON, default=list)

    company: Mapped[Company] = relationship(back_populates="ships")
