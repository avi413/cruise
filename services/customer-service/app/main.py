from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from .consumer import start_consumer
from .db import session
from .models import BookingHistory, Customer, StaffUser
from .security import get_principal_optional, issue_token, require_roles
from .tenancy import get_tenant_engine

app = FastAPI(
    title="Customer Management (CRM) Service",
    version="0.1.0",
    description="Customer profiles, preferences, loyalty/rewards, and booking history (projected from events).",
)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _normalize_email(email: str) -> str:
    return email.lower().strip()


def _hash_password(password: str) -> str:
    """
    PBKDF2-HMAC-SHA256 password hash in a portable text format.

    Format: pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>
    """
    password = password or ""
    iterations = 210_000
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)
    return "pbkdf2_sha256$%d$%s$%s" % (
        iterations,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(dk).decode("ascii"),
    )


def _verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iters_s, salt_b64, hash_b64 = encoded.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        iterations = int(iters_s)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(hash_b64.encode("ascii"))
        dk = hashlib.pbkdf2_hmac("sha256", (password or "").encode("utf-8"), salt, iterations, dklen=len(expected))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


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


# ----------------------------
# Staff portal users (tenant)
# ----------------------------


class StaffUserCreate(BaseModel):
    email: str
    password: str = Field(min_length=6)
    role: str = Field(default="agent", description="agent|staff|admin")
    disabled: bool = False


class StaffUserOut(BaseModel):
    id: str
    created_at: datetime
    updated_at: datetime
    email: str
    role: str
    disabled: bool


class StaffUserPatch(BaseModel):
    password: str | None = Field(default=None, min_length=6)
    role: str | None = Field(default=None, description="agent|staff|admin")
    disabled: bool | None = None


class StaffLoginIn(BaseModel):
    email: str
    password: str


@app.post("/staff/login")
def staff_login(payload: StaffLoginIn, tenant_engine=Depends(get_tenant_engine)):
    email = _normalize_email(payload.email)
    with session(tenant_engine) as s:
        user = s.query(StaffUser).filter(StaffUser.email == email).first()
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if user.disabled:
            raise HTTPException(status_code=403, detail="User disabled")
        if not _verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"access_token": issue_token(sub=user.id, role=user.role), "token_type": "bearer"}


@app.get("/staff/users", response_model=list[StaffUserOut])
def list_staff_users(
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        rows = s.query(StaffUser).order_by(StaffUser.created_at.desc()).all()
    return [
        StaffUserOut(
            id=r.id,
            created_at=r.created_at,
            updated_at=r.updated_at,
            email=r.email,
            role=r.role,
            disabled=bool(r.disabled),
        )
        for r in rows
    ]


@app.post("/staff/users", response_model=StaffUserOut)
def create_staff_user(
    payload: StaffUserCreate,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(get_principal_optional),
):
    # Bootstrap: allow creating the first admin user without auth in an empty tenant DB.
    with session(tenant_engine) as s:
        existing_count = int(s.query(StaffUser).count())
        if existing_count > 0:
            role = (principal or {}).get("role")
            if role != "admin":
                raise HTTPException(status_code=403, detail="Forbidden")

        email = _normalize_email(payload.email)
        exists = s.query(StaffUser).filter(StaffUser.email == email).first()
        if exists is not None:
            raise HTTPException(status_code=409, detail="User email already exists")

        role = (payload.role or "agent").strip().lower()
        if role not in {"agent", "staff", "admin"}:
            raise HTTPException(status_code=400, detail="Invalid role")

        now = _now()
        user = StaffUser(
            id=str(uuid4()),
            created_at=now,
            updated_at=now,
            email=email,
            password_hash=_hash_password(payload.password),
            role=role,
            disabled=1 if payload.disabled else 0,
        )
        s.add(user)
        s.commit()

    return StaffUserOut(
        id=user.id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        email=user.email,
        role=user.role,
        disabled=bool(user.disabled),
    )


@app.patch("/staff/users/{user_id}", response_model=StaffUserOut)
def patch_staff_user(
    user_id: str,
    payload: StaffUserPatch,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        user = s.get(StaffUser, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        if payload.password is not None:
            user.password_hash = _hash_password(payload.password)
        if payload.role is not None:
            role = payload.role.strip().lower()
            if role not in {"agent", "staff", "admin"}:
                raise HTTPException(status_code=400, detail="Invalid role")
            user.role = role
        if payload.disabled is not None:
            user.disabled = 1 if payload.disabled else 0

        user.updated_at = _now()
        s.add(user)
        s.commit()

    return StaffUserOut(
        id=user.id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        email=user.email,
        role=user.role,
        disabled=bool(user.disabled),
    )
