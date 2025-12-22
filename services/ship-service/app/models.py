from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
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


class CompanySettings(Base):
    """
    Company-scoped configuration stored in the control-plane DB.

    This intentionally lives in its own table (instead of adding columns to `companies`)
    to avoid schema-migration friction in this starter repo.
    """

    __tablename__ = "company_settings"
    __table_args__ = (UniqueConstraint("company_id", name="uq_company_settings_company_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    company_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id"), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    # White-label branding and UI theme configuration (logo, colors, backgrounds, etc.)
    branding: Mapped[dict] = mapped_column(JSON, default=dict)

    # Localization preferences (supported locales/currencies, defaults)
    localization: Mapped[dict] = mapped_column(JSON, default=dict)


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
    deck_plans: Mapped[dict] = mapped_column(JSON, default=dict)

    company: Mapped[Company] = relationship(back_populates="ships")

    cabin_categories: Mapped[list[CabinCategory]] = relationship(back_populates="ship")  # type: ignore[name-defined]
    cabins: Mapped[list[Cabin]] = relationship(back_populates="ship")  # type: ignore[name-defined]


class CabinCategory(Base):
    __tablename__ = "cabin_categories"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ship_id: Mapped[str] = mapped_column(String, ForeignKey("ships.id"), index=True)

    code: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)

    # Example values: inside, oceanview_full, oceanview_partial, balcony, suite, panoramic, etc.
    view: Mapped[str] = mapped_column(String, index=True)
    cabin_class: Mapped[str] = mapped_column(String, index=True)  # classic|deluxe|suite|...

    max_occupancy: Mapped[int] = mapped_column(Integer, default=2)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)  # free-form: bed config, size, etc.

    ship: Mapped[Ship] = relationship(back_populates="cabin_categories")


class Cabin(Base):
    __tablename__ = "cabins"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ship_id: Mapped[str] = mapped_column(String, ForeignKey("ships.id"), index=True)
    category_id: Mapped[str | None] = mapped_column(String, ForeignKey("cabin_categories.id"), index=True)

    cabin_no: Mapped[str] = mapped_column(String, index=True)
    deck: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="active", index=True)  # active|inactive|maintenance

    # Each cabin can have its own accessories (safe box, iron, etc.)
    accessories: Mapped[list] = mapped_column(JSON, default=list)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    ship: Mapped[Ship] = relationship(back_populates="cabins")


class ShipCapability(Base):
    __tablename__ = "ship_capabilities"
    __table_args__ = (UniqueConstraint("ship_id", "code", name="uq_ship_capabilities_ship_id_code"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ship_id: Mapped[str] = mapped_column(String, ForeignKey("ships.id"), index=True)

    code: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    category: Mapped[str | None] = mapped_column(String, index=True)
    description: Mapped[str | None] = mapped_column(String)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class ShipRestaurant(Base):
    __tablename__ = "ship_restaurants"
    __table_args__ = (UniqueConstraint("ship_id", "code", name="uq_ship_restaurants_ship_id_code"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ship_id: Mapped[str] = mapped_column(String, ForeignKey("ships.id"), index=True)

    code: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    cuisine: Mapped[str | None] = mapped_column(String, index=True)
    deck: Mapped[int] = mapped_column(Integer, default=0)

    included: Mapped[bool] = mapped_column(Boolean, default=True)
    reservation_required: Mapped[bool] = mapped_column(Boolean, default=False)

    description: Mapped[str | None] = mapped_column(String)
    capability_codes: Mapped[list] = mapped_column(JSON, default=list)  # list[str]
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class ShoreExcursion(Base):
    __tablename__ = "shore_excursions"
    __table_args__ = (UniqueConstraint("ship_id", "code", name="uq_shore_excursions_ship_id_code"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ship_id: Mapped[str] = mapped_column(String, ForeignKey("ships.id"), index=True)

    code: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String)
    port_code: Mapped[str] = mapped_column(String, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)

    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    description: Mapped[str | None] = mapped_column(String)
    capability_codes: Mapped[list] = mapped_column(JSON, default=list)  # list[str]
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    prices: Mapped[list[ShoreExcursionPrice]] = relationship(back_populates="shorex")  # type: ignore[name-defined]


class ShoreExcursionPrice(Base):
    __tablename__ = "shore_excursion_prices"
    __table_args__ = (UniqueConstraint("shorex_id", "currency", "paxtype", name="uq_shorex_prices_key"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    shorex_id: Mapped[str] = mapped_column(String, ForeignKey("shore_excursions.id"), index=True)

    currency: Mapped[str] = mapped_column(String, default="USD")
    paxtype: Mapped[str] = mapped_column(String, default="adult")  # adult|child|infant
    price_cents: Mapped[int] = mapped_column(Integer, default=0)

    shorex: Mapped[ShoreExcursion] = relationship(back_populates="prices")  # type: ignore[name-defined]
