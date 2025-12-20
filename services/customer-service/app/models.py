from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class StaffUser(Base):
    """
    Tenant-scoped portal users (call center / ops / admins).

    Notes:
    - Stored in the tenant DB (one DB per company), so no company_id column is needed.
    - Authentication is intentionally minimal (dev-friendly) for this starter repo.
    """

    __tablename__ = "staff_users"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)

    role: Mapped[str] = mapped_column(String, index=True)  # agent|staff|admin
    disabled: Mapped[int] = mapped_column(Integer, default=0)  # 0/1 (sqlite-friendly)


class StaffGroup(Base):
    """
    Tenant-scoped permission group.
    Example groups: sales_agents, ship_admins, service_agents, etc.
    """

    __tablename__ = "staff_groups"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    code: Mapped[str] = mapped_column(String, unique=True, index=True)  # stable identifier
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String)

    # List of permission strings (scopes)
    permissions: Mapped[list] = mapped_column(JSON, default=list)


class StaffGroupMember(Base):
    __tablename__ = "staff_group_members"
    __table_args__ = (UniqueConstraint("user_id", "group_id", name="uq_staff_group_member_user_group"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("staff_users.id"), index=True)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("staff_groups.id"), index=True)


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
