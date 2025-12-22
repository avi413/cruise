from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
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


class StaffUserPreference(Base):
    """
    Per-user preferences (tenant-scoped).

    Intended for:
    - agent-friendly UX defaults (language, currency)
    - widget/dashboard layouts
    - shortcut menus / saved searches (future)
    """

    __tablename__ = "staff_user_preferences"
    __table_args__ = (UniqueConstraint("user_id", name="uq_staff_user_preferences_user_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("staff_users.id"), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    # Flexible payload so we can evolve without migrations.
    # Example:
    # {
    #   "locale": "en",
    #   "currency": "USD",
    #   "dashboard": { "layout": [...], "widgets": {...} }
    # }
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)


class StaffAnnouncement(Base):
    __tablename__ = "staff_announcements"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("staff_users.id"))

    title: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(String)
    priority: Mapped[str] = mapped_column(String, default="normal") # normal, high, urgent
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StaffAnnouncementRead(Base):
    __tablename__ = "staff_announcement_reads"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", name="uq_staff_announcement_read"),)

    announcement_id: Mapped[str] = mapped_column(String, ForeignKey("staff_announcements.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("staff_users.id"), primary_key=True)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    title: Mapped[str | None] = mapped_column(String)  # MR/MRS/MS/etc
    first_name: Mapped[str | None] = mapped_column(String)
    last_name: Mapped[str | None] = mapped_column(String)
    birth_date: Mapped[date | None] = mapped_column(Date)

    loyalty_tier: Mapped[str | None] = mapped_column(String, index=True)

    phone: Mapped[str | None] = mapped_column(String)

    # Simple structured address (extend as needed)
    address_line1: Mapped[str | None] = mapped_column(String)
    address_line2: Mapped[str | None] = mapped_column(String)
    city: Mapped[str | None] = mapped_column(String)
    state: Mapped[str | None] = mapped_column(String)
    postal_code: Mapped[str | None] = mapped_column(String)
    country: Mapped[str | None] = mapped_column(String)

    national_id_number: Mapped[str | None] = mapped_column(String)
    national_id_country: Mapped[str | None] = mapped_column(String)

    passport_number: Mapped[str | None] = mapped_column(String)
    passport_country: Mapped[str | None] = mapped_column(String)
    passport_expiry: Mapped[date | None] = mapped_column(Date)

    preferences: Mapped[dict] = mapped_column(JSON)  # e.g. dining, accessibility


class Passenger(Base):
    """
    A passenger/traveler related to a customer (primary booker/contact).

    This supports the "add related passenger" workflow for sales/booking.
    """

    __tablename__ = "passengers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    customer_id: Mapped[str] = mapped_column(String, ForeignKey("customers.id"), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    title: Mapped[str | None] = mapped_column(String)
    first_name: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    birth_date: Mapped[date | None] = mapped_column(Date)

    gender: Mapped[str | None] = mapped_column(String)  # optional (M/F/X/...)
    nationality: Mapped[str | None] = mapped_column(String)

    email: Mapped[str | None] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)

    address_line1: Mapped[str | None] = mapped_column(String)
    address_line2: Mapped[str | None] = mapped_column(String)
    city: Mapped[str | None] = mapped_column(String)
    state: Mapped[str | None] = mapped_column(String)
    postal_code: Mapped[str | None] = mapped_column(String)
    country: Mapped[str | None] = mapped_column(String)

    national_id_number: Mapped[str | None] = mapped_column(String)
    national_id_country: Mapped[str | None] = mapped_column(String)

    passport_number: Mapped[str | None] = mapped_column(String)
    passport_country: Mapped[str | None] = mapped_column(String)
    passport_expiry: Mapped[date | None] = mapped_column(Date)


class BookingHistory(Base):
    __tablename__ = "booking_history"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # booking_id
    customer_id: Mapped[str | None] = mapped_column(String, index=True)
    sailing_id: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    meta: Mapped[dict] = mapped_column(JSON)


class AuditLog(Base):
    """
    Tenant-scoped audit log for compliance.

    Stored in the tenant DB (one DB per company), so no company_id column is needed.
    """

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    actor_user_id: Mapped[str | None] = mapped_column(String, index=True)
    actor_role: Mapped[str | None] = mapped_column(String, index=True)

    action: Mapped[str] = mapped_column(String, index=True)  # e.g. "customer.create"
    entity_type: Mapped[str] = mapped_column(String, index=True)  # e.g. "customer"
    entity_id: Mapped[str | None] = mapped_column(String, index=True)

    meta: Mapped[dict] = mapped_column(JSON)  # {before, after, request, ...}
