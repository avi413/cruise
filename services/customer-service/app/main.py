from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import date, datetime, timezone
from typing import Annotated
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_

from .consumer import start_consumer
from .db import session
from .models import (
    AuditLog,
    BookingHistory,
    Customer,
    Passenger,
    StaffGroup,
    StaffGroupMember,
    StaffUser,
    StaffUserPreference,
    Translation,
)
from .security import get_principal_optional, issue_token, require_roles
from .tenancy import get_tenant_engine

app = FastAPI(
    title="Customer Management (CRM) Service",
    version="0.1.0",
    description="Customer profiles, preferences, loyalty/rewards, and booking history (projected from events).",
)

SHIP_SERVICE_URL = os.getenv("SHIP_SERVICE_URL", "http://localhost:8001")
_LOCALIZATION_DEFAULTS_CACHE: dict[str, tuple[dict, float]] = {}  # company_id -> (defaults, expires_at_epoch_s)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _audit(
    *,
    tenant_engine,
    principal: dict | None,
    action: str,
    entity_type: str,
    entity_id: str | None,
    meta: dict | None = None,
) -> None:
    """
    Best-effort audit logging. Never blocks the main request.
    """
    try:
        row = AuditLog(
            id=str(uuid4()),
            occurred_at=_now(),
            actor_user_id=(principal or {}).get("sub"),
            actor_role=(principal or {}).get("role"),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            meta=meta or {},
        )
        with session(tenant_engine) as s:
            s.add(row)
            s.commit()
    except Exception:
        # Never fail the main request due to audit.
        return


# ----------------------------
# Permissions (scopes)
# ----------------------------

# Keep this list business-oriented; expand as modules grow.
ALL_PERMISSIONS: set[str] = {
    "sales.quote",
    "sales.hold",
    "sales.confirm",
    "customers.read",
    "customers.write",
    "sailings.read",
    "sailings.write",
    "fleet.read",
    "fleet.write",
    "inventory.read",
    "inventory.write",
    "rates.write",
    "users.manage",
}


def _normalize_perm(p: str) -> str:
    return (p or "").strip()


def _validate_perms(perms: list[str]) -> list[str]:
    cleaned = sorted({p for p in (_normalize_perm(x) for x in perms or []) if p})
    unknown = [p for p in cleaned if p not in ALL_PERMISSIONS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown permissions: {', '.join(unknown)}")
    return cleaned


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


def _company_localization_defaults(company_id: str | None) -> dict:
    """
    Single source of truth for locale/currency defaults: ship-service company settings.

    Returns a dict like: {"default_locale": "en", "default_currency": "USD"}.
    Never raises; falls back to safe defaults if upstream is unavailable.
    """
    key = (company_id or "").strip()
    if not key:
        return {"default_locale": "en", "default_currency": "USD"}

    now = time.time()
    cached = _LOCALIZATION_DEFAULTS_CACHE.get(key)
    if cached and cached[1] > now:
        return dict(cached[0])

    url = f"{SHIP_SERVICE_URL}/companies/{key}/settings"
    try:
        req = Request(url, headers={"accept": "application/json"})
        with urlopen(req, timeout=2.5) as resp:
            raw = resp.read()
        data = json.loads(raw.decode("utf-8"))
        loc = (data or {}).get("localization") or {}
        default_locale = str(loc.get("default_locale") or "en").strip() or "en"
        default_currency = str(loc.get("default_currency") or "USD").strip().upper() or "USD"
        out = {"default_locale": default_locale, "default_currency": default_currency}
        _LOCALIZATION_DEFAULTS_CACHE[key] = (out, now + 60.0)
        return dict(out)
    except (HTTPError, URLError, TimeoutError, ValueError):
        return {"default_locale": "en", "default_currency": "USD"}


@app.on_event("startup")
async def _startup():
    # Run event consumer in background
    asyncio.create_task(start_consumer())


@app.get("/health")
def health():
    return {"status": "ok"}


class CustomerCreate(BaseModel):
    email: str
    title: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    birth_date: date | None = None
    loyalty_tier: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    national_id_number: str | None = None
    national_id_country: str | None = None
    passport_number: str | None = None
    passport_country: str | None = None
    passport_expiry: date | None = None
    preferences: dict = Field(default_factory=dict)


class CustomerOut(CustomerCreate):
    id: str
    created_at: datetime
    updated_at: datetime


@app.get("/customers", response_model=list[CustomerOut])
def list_customers(
    q: str | None = None,
    email: str | None = None,
    loyalty_tier: str | None = None,
    limit: int = 50,
    offset: int = 0,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("agent", "staff", "admin")),
):
    """
    Search/list customers for call-center workflows.

    - `email`: exact match
    - `q`: case-insensitive partial match on email / first name / last name
    """
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))

    with session(tenant_engine) as s:
        qry = s.query(Customer).order_by(Customer.updated_at.desc())
        if email:
            qry = qry.filter(Customer.email == _normalize_email(email))
        if loyalty_tier:
            qry = qry.filter(Customer.loyalty_tier == loyalty_tier)
        if q:
            like = f"%{q.strip().lower()}%"
            qry = qry.filter(
                or_(
                    func.lower(Customer.email).like(like),
                    func.lower(Customer.first_name).like(like),
                    func.lower(Customer.last_name).like(like),
                    func.lower(Customer.phone).like(like),
                    func.lower(Customer.national_id_number).like(like),
                    func.lower(Customer.passport_number).like(like),
                )
            )
        rows = qry.offset(offset).limit(limit).all()

    return [
        CustomerOut(
            id=r.id,
            created_at=r.created_at,
            updated_at=r.updated_at,
            email=r.email,
            title=r.title,
            first_name=r.first_name,
            last_name=r.last_name,
            birth_date=r.birth_date,
            loyalty_tier=r.loyalty_tier,
            phone=r.phone,
            address_line1=r.address_line1,
            address_line2=r.address_line2,
            city=r.city,
            state=r.state,
            postal_code=r.postal_code,
            country=r.country,
            national_id_number=r.national_id_number,
            national_id_country=r.national_id_country,
            passport_number=r.passport_number,
            passport_country=r.passport_country,
            passport_expiry=r.passport_expiry,
            preferences=r.preferences or {},
        )
        for r in rows
    ]


@app.post("/customers", response_model=CustomerOut)
def create_customer(
    payload: CustomerCreate,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("agent", "staff", "admin")),
):
    now = _now()
    cust = Customer(
        id=str(uuid4()),
        created_at=now,
        updated_at=now,
        email=payload.email.lower().strip(),
        title=payload.title,
        first_name=payload.first_name,
        last_name=payload.last_name,
        birth_date=payload.birth_date,
        loyalty_tier=payload.loyalty_tier,
        phone=payload.phone,
        address_line1=payload.address_line1,
        address_line2=payload.address_line2,
        city=payload.city,
        state=payload.state,
        postal_code=payload.postal_code,
        country=payload.country,
        national_id_number=payload.national_id_number,
        national_id_country=payload.national_id_country,
        passport_number=payload.passport_number,
        passport_country=payload.passport_country,
        passport_expiry=payload.passport_expiry,
        preferences=payload.preferences or {},
    )

    with session(tenant_engine) as s:
        existing = s.query(Customer).filter(Customer.email == cust.email).first()
        if existing is not None:
            raise HTTPException(status_code=409, detail="Customer email already exists")
        s.add(cust)
        s.commit()

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="customer.create",
        entity_type="customer",
        entity_id=cust.id,
        meta={"request": payload.model_dump()},
    )

    # Return the persisted row (normalized email, defaults applied).
    return get_customer(cust.id, tenant_engine=tenant_engine)


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
        title=cust.title,
        first_name=cust.first_name,
        last_name=cust.last_name,
        birth_date=cust.birth_date,
        loyalty_tier=cust.loyalty_tier,
        phone=cust.phone,
        address_line1=cust.address_line1,
        address_line2=cust.address_line2,
        city=cust.city,
        state=cust.state,
        postal_code=cust.postal_code,
        country=cust.country,
        national_id_number=cust.national_id_number,
        national_id_country=cust.national_id_country,
        passport_number=cust.passport_number,
        passport_country=cust.passport_country,
        passport_expiry=cust.passport_expiry,
        preferences=cust.preferences or {},
    )


class CustomerPatch(BaseModel):
    title: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    birth_date: date | None = None
    loyalty_tier: str | None = None
    preferences: dict | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    national_id_number: str | None = None
    national_id_country: str | None = None
    passport_number: str | None = None
    passport_country: str | None = None
    passport_expiry: date | None = None


@app.patch("/customers/{customer_id}", response_model=CustomerOut)
def patch_customer(
    customer_id: str,
    payload: CustomerPatch,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        cust = s.get(Customer, customer_id)
        if cust is None:
            raise HTTPException(status_code=404, detail="Customer not found")

        before = {
            "title": cust.title,
            "first_name": cust.first_name,
            "last_name": cust.last_name,
            "birth_date": cust.birth_date.isoformat() if cust.birth_date else None,
            "loyalty_tier": cust.loyalty_tier,
            "phone": cust.phone,
            "address_line1": cust.address_line1,
            "address_line2": cust.address_line2,
            "city": cust.city,
            "state": cust.state,
            "postal_code": cust.postal_code,
            "country": cust.country,
            "national_id_number": cust.national_id_number,
            "national_id_country": cust.national_id_country,
            "passport_number": cust.passport_number,
            "passport_country": cust.passport_country,
            "passport_expiry": cust.passport_expiry.isoformat() if cust.passport_expiry else None,
            "preferences": cust.preferences,
        }

        # Allow explicit nulls to clear values by checking which fields were provided.
        fields = payload.model_fields_set

        if "title" in fields:
            cust.title = payload.title
        if "first_name" in fields:
            cust.first_name = payload.first_name
        if "last_name" in fields:
            cust.last_name = payload.last_name
        if "birth_date" in fields:
            cust.birth_date = payload.birth_date
        if "loyalty_tier" in fields:
            cust.loyalty_tier = payload.loyalty_tier

        if "phone" in fields:
            cust.phone = payload.phone
        if "address_line1" in fields:
            cust.address_line1 = payload.address_line1
        if "address_line2" in fields:
            cust.address_line2 = payload.address_line2
        if "city" in fields:
            cust.city = payload.city
        if "state" in fields:
            cust.state = payload.state
        if "postal_code" in fields:
            cust.postal_code = payload.postal_code
        if "country" in fields:
            cust.country = payload.country

        if "national_id_number" in fields:
            cust.national_id_number = payload.national_id_number
        if "national_id_country" in fields:
            cust.national_id_country = payload.national_id_country
        if "passport_number" in fields:
            cust.passport_number = payload.passport_number
        if "passport_country" in fields:
            cust.passport_country = payload.passport_country
        if "passport_expiry" in fields:
            cust.passport_expiry = payload.passport_expiry

        if "preferences" in fields:
            cust.preferences = payload.preferences or {}

        cust.updated_at = _now()
        s.add(cust)
        s.commit()

        after = {
            "title": cust.title,
            "first_name": cust.first_name,
            "last_name": cust.last_name,
            "birth_date": cust.birth_date.isoformat() if cust.birth_date else None,
            "loyalty_tier": cust.loyalty_tier,
            "phone": cust.phone,
            "address_line1": cust.address_line1,
            "address_line2": cust.address_line2,
            "city": cust.city,
            "state": cust.state,
            "postal_code": cust.postal_code,
            "country": cust.country,
            "national_id_number": cust.national_id_number,
            "national_id_country": cust.national_id_country,
            "passport_number": cust.passport_number,
            "passport_country": cust.passport_country,
            "passport_expiry": cust.passport_expiry.isoformat() if cust.passport_expiry else None,
            "preferences": cust.preferences,
        }

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="customer.patch",
        entity_type="customer",
        entity_id=customer_id,
        meta={"request": payload.model_dump(exclude_none=True), "before": before, "after": after},
    )

    return get_customer(customer_id)


# ----------------------------
# Passenger profiles (related to customer)
# ----------------------------


class PassengerCreate(BaseModel):
    title: str | None = None
    first_name: str
    last_name: str
    birth_date: date | None = None
    gender: str | None = None
    nationality: str | None = None
    email: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    national_id_number: str | None = None
    national_id_country: str | None = None
    passport_number: str | None = None
    passport_country: str | None = None
    passport_expiry: date | None = None


class PassengerOut(PassengerCreate):
    id: str
    customer_id: str
    created_at: datetime
    updated_at: datetime


class PassengerPatch(BaseModel):
    title: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    nationality: str | None = None
    email: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    national_id_number: str | None = None
    national_id_country: str | None = None
    passport_number: str | None = None
    passport_country: str | None = None
    passport_expiry: date | None = None


@app.get("/customers/{customer_id}/passengers", response_model=list[PassengerOut])
def list_customer_passengers(
    customer_id: str,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        rows = s.query(Passenger).filter(Passenger.customer_id == customer_id).order_by(Passenger.updated_at.desc()).all()
    return [
        PassengerOut(
            id=r.id,
            customer_id=r.customer_id,
            created_at=r.created_at,
            updated_at=r.updated_at,
            title=r.title,
            first_name=r.first_name,
            last_name=r.last_name,
            birth_date=r.birth_date,
            gender=r.gender,
            nationality=r.nationality,
            email=r.email,
            phone=r.phone,
            address_line1=r.address_line1,
            address_line2=r.address_line2,
            city=r.city,
            state=r.state,
            postal_code=r.postal_code,
            country=r.country,
            national_id_number=r.national_id_number,
            national_id_country=r.national_id_country,
            passport_number=r.passport_number,
            passport_country=r.passport_country,
            passport_expiry=r.passport_expiry,
        )
        for r in rows
    ]


@app.post("/customers/{customer_id}/passengers", response_model=PassengerOut)
def create_passenger(
    customer_id: str,
    payload: PassengerCreate,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("agent", "staff", "admin")),
):
    now = _now()
    row = Passenger(
        id=str(uuid4()),
        customer_id=customer_id,
        created_at=now,
        updated_at=now,
        title=payload.title,
        first_name=(payload.first_name or "").strip(),
        last_name=(payload.last_name or "").strip(),
        birth_date=payload.birth_date,
        gender=payload.gender,
        nationality=payload.nationality,
        email=_normalize_email(payload.email) if payload.email else None,
        phone=payload.phone,
        address_line1=payload.address_line1,
        address_line2=payload.address_line2,
        city=payload.city,
        state=payload.state,
        postal_code=payload.postal_code,
        country=payload.country,
        national_id_number=payload.national_id_number,
        national_id_country=payload.national_id_country,
        passport_number=payload.passport_number,
        passport_country=payload.passport_country,
        passport_expiry=payload.passport_expiry,
    )

    with session(tenant_engine) as s:
        cust = s.get(Customer, customer_id)
        if cust is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        s.add(row)
        s.commit()
        s.refresh(row)

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="passenger.create",
        entity_type="passenger",
        entity_id=row.id,
        meta={"customer_id": customer_id, "request": payload.model_dump()},
    )

    return PassengerOut(
        id=row.id,
        customer_id=row.customer_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        title=row.title,
        first_name=row.first_name,
        last_name=row.last_name,
        birth_date=row.birth_date,
        gender=row.gender,
        nationality=row.nationality,
        email=row.email,
        phone=row.phone,
        address_line1=row.address_line1,
        address_line2=row.address_line2,
        city=row.city,
        state=row.state,
        postal_code=row.postal_code,
        country=row.country,
        national_id_number=row.national_id_number,
        national_id_country=row.national_id_country,
        passport_number=row.passport_number,
        passport_country=row.passport_country,
        passport_expiry=row.passport_expiry,
    )


@app.patch("/passengers/{passenger_id}", response_model=PassengerOut)
def patch_passenger(
    passenger_id: str,
    payload: PassengerPatch,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        row = s.get(Passenger, passenger_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Passenger not found")

        before = {
            "title": row.title,
            "first_name": row.first_name,
            "last_name": row.last_name,
            "birth_date": row.birth_date.isoformat() if row.birth_date else None,
            "gender": row.gender,
            "nationality": row.nationality,
            "email": row.email,
            "phone": row.phone,
            "address_line1": row.address_line1,
            "address_line2": row.address_line2,
            "city": row.city,
            "state": row.state,
            "postal_code": row.postal_code,
            "country": row.country,
            "national_id_number": row.national_id_number,
            "national_id_country": row.national_id_country,
            "passport_number": row.passport_number,
            "passport_country": row.passport_country,
            "passport_expiry": row.passport_expiry.isoformat() if row.passport_expiry else None,
        }

        fields = payload.model_fields_set
        if "title" in fields:
            row.title = payload.title
        if "first_name" in fields:
            row.first_name = (payload.first_name or "").strip()
        if "last_name" in fields:
            row.last_name = (payload.last_name or "").strip()
        if "birth_date" in fields:
            row.birth_date = payload.birth_date
        if "gender" in fields:
            row.gender = payload.gender
        if "nationality" in fields:
            row.nationality = payload.nationality
        if "email" in fields:
            row.email = _normalize_email(payload.email) if payload.email else None
        if "phone" in fields:
            row.phone = payload.phone

        if "address_line1" in fields:
            row.address_line1 = payload.address_line1
        if "address_line2" in fields:
            row.address_line2 = payload.address_line2
        if "city" in fields:
            row.city = payload.city
        if "state" in fields:
            row.state = payload.state
        if "postal_code" in fields:
            row.postal_code = payload.postal_code
        if "country" in fields:
            row.country = payload.country

        if "national_id_number" in fields:
            row.national_id_number = payload.national_id_number
        if "national_id_country" in fields:
            row.national_id_country = payload.national_id_country
        if "passport_number" in fields:
            row.passport_number = payload.passport_number
        if "passport_country" in fields:
            row.passport_country = payload.passport_country
        if "passport_expiry" in fields:
            row.passport_expiry = payload.passport_expiry

        row.updated_at = _now()
        s.add(row)
        s.commit()
        s.refresh(row)

        after = {
            "title": row.title,
            "first_name": row.first_name,
            "last_name": row.last_name,
            "birth_date": row.birth_date.isoformat() if row.birth_date else None,
            "gender": row.gender,
            "nationality": row.nationality,
            "email": row.email,
            "phone": row.phone,
            "address_line1": row.address_line1,
            "address_line2": row.address_line2,
            "city": row.city,
            "state": row.state,
            "postal_code": row.postal_code,
            "country": row.country,
            "national_id_number": row.national_id_number,
            "national_id_country": row.national_id_country,
            "passport_number": row.passport_number,
            "passport_country": row.passport_country,
            "passport_expiry": row.passport_expiry.isoformat() if row.passport_expiry else None,
        }

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="passenger.patch",
        entity_type="passenger",
        entity_id=passenger_id,
        meta={"request": payload.model_dump(exclude_unset=True), "before": before, "after": after},
    )

    return PassengerOut(
        id=row.id,
        customer_id=row.customer_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        title=row.title,
        first_name=row.first_name,
        last_name=row.last_name,
        birth_date=row.birth_date,
        gender=row.gender,
        nationality=row.nationality,
        email=row.email,
        phone=row.phone,
        address_line1=row.address_line1,
        address_line2=row.address_line2,
        city=row.city,
        state=row.state,
        postal_code=row.postal_code,
        country=row.country,
        national_id_number=row.national_id_number,
        national_id_country=row.national_id_country,
        passport_number=row.passport_number,
        passport_country=row.passport_country,
        passport_expiry=row.passport_expiry,
    )


@app.delete("/passengers/{passenger_id}")
def delete_passenger(
    passenger_id: str,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        row = s.get(Passenger, passenger_id)
        if row is None:
            return {"status": "ok"}
        customer_id = row.customer_id
        s.delete(row)
        s.commit()

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="passenger.delete",
        entity_type="passenger",
        entity_id=passenger_id,
        meta={"customer_id": customer_id},
    )

    return {"status": "ok"}


class AuditLogOut(BaseModel):
    id: str
    occurred_at: datetime
    actor_user_id: str | None
    actor_role: str | None
    action: str
    entity_type: str
    entity_id: str | None
    meta: dict


@app.get("/staff/audit", response_model=list[AuditLogOut])
def list_audit_logs(
    limit: int = 200,
    offset: int = 0,
    actor_user_id: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("admin")),
):
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    with session(tenant_engine) as s:
        qry = s.query(AuditLog).order_by(AuditLog.occurred_at.desc())
        if actor_user_id:
            qry = qry.filter(AuditLog.actor_user_id == actor_user_id)
        if action:
            qry = qry.filter(AuditLog.action == action)
        if entity_type:
            qry = qry.filter(AuditLog.entity_type == entity_type)
        if entity_id:
            qry = qry.filter(AuditLog.entity_id == entity_id)
        rows = qry.offset(offset).limit(limit).all()

    return [
        AuditLogOut(
            id=r.id,
            occurred_at=r.occurred_at,
            actor_user_id=r.actor_user_id,
            actor_role=r.actor_role,
            action=r.action,
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            meta=r.meta or {},
        )
        for r in rows
    ]


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


class PlatformLoginIn(BaseModel):
    email: str
    password: str


def _load_or_create_user_prefs(tenant_engine, user_id: str, *, company_id: str | None) -> StaffUserPreference:
    with session(tenant_engine) as s:
        # Platform admin tokens use a synthetic subject ("platform-admin") which may not
        # exist in a tenant DB's `staff_users` table. In Postgres, `staff_user_preferences.user_id`
        # has a FK to `staff_users.id`, so creating preferences would fail with a 500.
        #
        # To keep the starter repo dev-friendly, we auto-provision a disabled "shadow" user
        # row when missing. This preserves FK integrity and still prevents direct login
        # (random password hash, disabled=1).
        if user_id:
            existing_user = s.get(StaffUser, user_id)
            if existing_user is None:
                shadow_email = f"{user_id}@platform.local"
                # Ensure email uniqueness within the tenant DB
                dupe = s.query(StaffUser).filter(StaffUser.email == shadow_email).first()
                if dupe is None:
                    now = _now()
                    s.add(
                        StaffUser(
                            id=user_id,
                            created_at=now,
                            updated_at=now,
                            email=shadow_email,
                            password_hash=_hash_password(secrets.token_urlsafe(24)),
                            role="admin",
                            disabled=1,
                        )
                    )
                    s.commit()

        row = s.query(StaffUserPreference).filter(StaffUserPreference.user_id == user_id).first()
        if row is not None:
            return row
        now = _now()
        defaults = _company_localization_defaults(company_id)
        row = StaffUserPreference(
            id=str(uuid4()),
            user_id=user_id,
            created_at=now,
            updated_at=now,
            preferences={
                "locale": defaults.get("default_locale") or "en",
                "currency": defaults.get("default_currency") or "USD",
                "dashboard": {
                    "layout": [],  # frontend-defined (widget grid / positions)
                },
            },
        )
        s.add(row)
        s.commit()
        s.refresh(row)
        return row


class StaffMePreferencesOut(BaseModel):
    user_id: str
    updated_at: datetime
    preferences: dict


class StaffMePreferencesPatch(BaseModel):
    # Keep this intentionally flexible; the portal owns shape.
    preferences: dict = Field(default_factory=dict)


@app.get("/staff/me/preferences", response_model=StaffMePreferencesOut)
def get_my_preferences(
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("agent", "staff", "admin")),
    x_company_id: Annotated[str | None, Header()] = None,
):
    user_id = str((principal or {}).get("sub") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    row = _load_or_create_user_prefs(tenant_engine, user_id, company_id=x_company_id)
    return StaffMePreferencesOut(user_id=row.user_id, updated_at=row.updated_at, preferences=row.preferences or {})


@app.patch("/staff/me/preferences", response_model=StaffMePreferencesOut)
def patch_my_preferences(
    payload: StaffMePreferencesPatch,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("agent", "staff", "admin")),
    x_company_id: Annotated[str | None, Header()] = None,
):
    user_id = str((principal or {}).get("sub") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    row = _load_or_create_user_prefs(tenant_engine, user_id, company_id=x_company_id)
    with session(tenant_engine) as s:
        row = s.get(StaffUserPreference, row.id)
        if row is None:
            raise HTTPException(status_code=404, detail="Preferences not found")

        merged = dict(row.preferences or {})
        # Shallow merge keeps API predictable; frontend can store nested objects under keys.
        incoming = dict(payload.preferences or {})
        # Currency is tenant-wide (single source of truth in Company Settings), not per-user.
        incoming.pop("currency", None)
        merged.update(incoming)
        row.preferences = merged
        row.updated_at = _now()
        s.add(row)
        s.commit()
        s.refresh(row)

    return StaffMePreferencesOut(user_id=row.user_id, updated_at=row.updated_at, preferences=row.preferences or {})


class StaffGroupCreate(BaseModel):
    code: str = Field(description="Stable identifier, e.g. sales_agents")
    name: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)


class StaffGroupOut(StaffGroupCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class StaffGroupPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list[str] | None = None


class GroupMemberOut(BaseModel):
    user_id: str
    group_id: str


class GroupAddMemberIn(BaseModel):
    user_id: str


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

        rows = (
            s.query(StaffGroup, StaffGroupMember)
            .join(StaffGroupMember, StaffGroupMember.group_id == StaffGroup.id)
            .filter(StaffGroupMember.user_id == user.id)
            .all()
        )
        groups = [{"id": g.id, "code": g.code, "name": g.name} for (g, _m) in rows]
        perms: set[str] = set()
        for (g, _m) in rows:
            for p in (g.permissions or []):
                if isinstance(p, str) and p.strip():
                    perms.add(p.strip())
        # Admins should be able to manage the tenant even if no groups exist yet.
        # This avoids lockouts like "can't manage users/pricing unless attached to a group".
        if user.role == "admin":
            perms_list = sorted(ALL_PERMISSIONS)
        else:
            perms_list = sorted(perms)

    return {
        "access_token": issue_token(sub=user.id, role=user.role, extra_claims={"groups": groups, "perms": perms_list}),
        "token_type": "bearer",
    }


@app.post("/platform/login")
def platform_login(payload: PlatformLoginIn):
    """
    Platform (cross-tenant) admin login.

    This returns a JWT that can be used with any X-Company-Id header to manage any tenant.
    In production, back this with a real IdP / central directory.
    """
    expected_email = os.getenv("PLATFORM_ADMIN_EMAIL", "admin@platform.local").strip().lower()
    expected_password = os.getenv("PLATFORM_ADMIN_PASSWORD", "admin").strip()
    email = _normalize_email(payload.email)
    if email != expected_email or (payload.password or "") != expected_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    perms_list = sorted(ALL_PERMISSIONS)
    groups = [{"id": "platform", "code": "platform_admin", "name": "Platform Admin"}]
    return {
        "access_token": issue_token(
            sub="platform-admin",
            role="admin",
            extra_claims={"platform": True, "groups": groups, "perms": perms_list},
        ),
        "token_type": "bearer",
    }


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

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="staff_user.create",
        entity_type="staff_user",
        entity_id=user.id,
        meta={"request": {"email": payload.email, "role": role, "disabled": payload.disabled}},
    )

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
    principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        user = s.get(StaffUser, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        before = {"email": user.email, "role": user.role, "disabled": bool(user.disabled)}

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

        after = {"email": user.email, "role": user.role, "disabled": bool(user.disabled)}

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="staff_user.patch",
        entity_type="staff_user",
        entity_id=user_id,
        meta={"request": payload.model_dump(exclude_none=True, exclude={"password"}), "before": before, "after": after},
    )

    return StaffUserOut(
        id=user.id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        email=user.email,
        role=user.role,
        disabled=bool(user.disabled),
    )


@app.delete("/staff/users/{user_id}")
def delete_staff_user(
    user_id: str,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("admin")),
):
    """
    Delete a tenant-scoped portal user.

    Notes:
    - We explicitly delete dependent rows (group memberships, preferences) because
      sqlite does not enforce FK cascades by default.
    - Prevent deleting yourself / last remaining admin to avoid lockouts.
    """
    actor_id = str((principal or {}).get("sub") or "")
    if actor_id and actor_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own user. Disable it instead.")

    with session(tenant_engine) as s:
        user = s.get(StaffUser, user_id)
        if user is None:
            return {"status": "ok"}

        # Avoid tenant lockout: don't allow deleting the last admin.
        if (user.role or "").strip().lower() == "admin":
            admin_count = int(s.query(StaffUser).filter(StaffUser.role == "admin").count())
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot delete the last admin user for this tenant.")

        before = {"email": user.email, "role": user.role, "disabled": bool(user.disabled)}

        # Delete dependencies first (sqlite-safe)
        s.query(StaffGroupMember).filter(StaffGroupMember.user_id == user_id).delete(synchronize_session=False)
        s.query(StaffUserPreference).filter(StaffUserPreference.user_id == user_id).delete(synchronize_session=False)

        s.delete(user)
        s.commit()

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="staff_user.delete",
        entity_type="staff_user",
        entity_id=user_id,
        meta={"before": before},
    )

    return {"status": "ok"}


@app.get("/staff/groups", response_model=list[StaffGroupOut])
def list_staff_groups(
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        rows = s.query(StaffGroup).order_by(StaffGroup.created_at.desc()).all()
    return [
        StaffGroupOut(
            id=r.id,
            created_at=r.created_at,
            updated_at=r.updated_at,
            code=r.code,
            name=r.name,
            description=r.description,
            permissions=list(r.permissions or []),
        )
        for r in rows
    ]


@app.post("/staff/groups", response_model=StaffGroupOut)
def create_staff_group(
    payload: StaffGroupCreate,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("admin")),
):
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code is required")
    perms = _validate_perms(payload.permissions)

    with session(tenant_engine) as s:
        exists = s.query(StaffGroup).filter(StaffGroup.code == code).first()
        if exists is not None:
            raise HTTPException(status_code=409, detail="Group code already exists")
        now = _now()
        g = StaffGroup(
            id=str(uuid4()),
            created_at=now,
            updated_at=now,
            code=code,
            name=(payload.name or "").strip(),
            description=payload.description,
            permissions=perms,
        )
        s.add(g)
        s.commit()
        s.refresh(g)

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="staff_group.create",
        entity_type="staff_group",
        entity_id=g.id,
        meta={"request": {"code": code, "name": payload.name, "description": payload.description, "permissions": perms}},
    )

    return StaffGroupOut(
        id=g.id,
        created_at=g.created_at,
        updated_at=g.updated_at,
        code=g.code,
        name=g.name,
        description=g.description,
        permissions=list(g.permissions or []),
    )


@app.patch("/staff/groups/{group_id}", response_model=StaffGroupOut)
def patch_staff_group(
    group_id: str,
    payload: StaffGroupPatch,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        g = s.get(StaffGroup, group_id)
        if g is None:
            raise HTTPException(status_code=404, detail="Group not found")

        before = {"name": g.name, "description": g.description, "permissions": list(g.permissions or [])}

        if payload.name is not None:
            g.name = payload.name
        if payload.description is not None:
            g.description = payload.description
        if payload.permissions is not None:
            g.permissions = _validate_perms(payload.permissions)

        g.updated_at = _now()
        s.add(g)
        s.commit()
        s.refresh(g)

        after = {"name": g.name, "description": g.description, "permissions": list(g.permissions or [])}

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="staff_group.patch",
        entity_type="staff_group",
        entity_id=group_id,
        meta={"request": payload.model_dump(exclude_none=True), "before": before, "after": after},
    )

    return StaffGroupOut(
        id=g.id,
        created_at=g.created_at,
        updated_at=g.updated_at,
        code=g.code,
        name=g.name,
        description=g.description,
        permissions=list(g.permissions or []),
    )


@app.get("/staff/groups/{group_id}/members", response_model=list[GroupMemberOut])
def list_group_members(
    group_id: str,
    tenant_engine=Depends(get_tenant_engine),
    _principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        g = s.get(StaffGroup, group_id)
        if g is None:
            raise HTTPException(status_code=404, detail="Group not found")
        rows = s.query(StaffGroupMember).filter(StaffGroupMember.group_id == group_id).all()
    return [GroupMemberOut(user_id=r.user_id, group_id=r.group_id) for r in rows]


@app.post("/staff/groups/{group_id}/members", response_model=GroupMemberOut)
def add_group_member(
    group_id: str,
    payload: GroupAddMemberIn,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        g = s.get(StaffGroup, group_id)
        if g is None:
            raise HTTPException(status_code=404, detail="Group not found")
        u = s.get(StaffUser, payload.user_id)
        if u is None:
            raise HTTPException(status_code=404, detail="User not found")
        exists = (
            s.query(StaffGroupMember)
            .filter(StaffGroupMember.group_id == group_id)
            .filter(StaffGroupMember.user_id == payload.user_id)
            .first()
        )
        if exists is not None:
            return GroupMemberOut(user_id=exists.user_id, group_id=exists.group_id)
        m = StaffGroupMember(id=str(uuid4()), group_id=group_id, user_id=payload.user_id)
        s.add(m)
        s.commit()

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="staff_group.member_add",
        entity_type="staff_group",
        entity_id=group_id,
        meta={"user_id": payload.user_id},
    )
    return GroupMemberOut(user_id=payload.user_id, group_id=group_id)


@app.delete("/staff/groups/{group_id}/members/{user_id}")
def remove_group_member(
    group_id: str,
    user_id: str,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        row = (
            s.query(StaffGroupMember)
            .filter(StaffGroupMember.group_id == group_id)
            .filter(StaffGroupMember.user_id == user_id)
            .first()
        )
        if row is None:
            return {"status": "ok"}
        s.delete(row)
        s.commit()

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="staff_group.member_remove",
        entity_type="staff_group",
        entity_id=group_id,
        meta={"user_id": user_id},
    )
    return {"status": "ok"}

# ----------------------------
# Translations
# ----------------------------

class TranslationCreate(BaseModel):
    lang: str
    namespace: str = "translation"
    key: str
    value: str

class TranslationOut(TranslationCreate):
    id: str
    updated_at: datetime


DEFAULT_TRANSLATIONS = [
    {"lang": "en", "namespace": "translation", "key": "app.title", "value": "Cruise Management"},
    {"lang": "en", "namespace": "translation", "key": "app.welcome", "value": "Welcome to the Dashboard"},
    {"lang": "en", "namespace": "translation", "key": "common.save", "value": "Save Changes"},
    {"lang": "en", "namespace": "translation", "key": "common.cancel", "value": "Cancel"},
]


@app.get("/translations", response_model=list[TranslationOut])
def list_translations(
    lang: str | None = None,
    namespace: str | None = None,
    tenant_engine=Depends(get_tenant_engine),
):
    with session(tenant_engine) as s:
        # Auto-seed if table is completely empty
        if s.query(Translation).first() is None:
            now = _now()
            for item in DEFAULT_TRANSLATIONS:
                t = Translation(
                    id=str(uuid4()),
                    lang=item["lang"],
                    namespace=item["namespace"],
                    key=item["key"],
                    value=item["value"],
                    updated_at=now,
                )
                s.add(t)
            s.commit()

        qry = s.query(Translation)
        if lang:
            qry = qry.filter(Translation.lang == lang)
        if namespace:
            qry = qry.filter(Translation.namespace == namespace)
        rows = qry.all()
    return [
        TranslationOut(
            id=r.id,
            updated_at=r.updated_at,
            lang=r.lang,
            namespace=r.namespace,
            key=r.key,
            value=r.value,
        )
        for r in rows
    ]

@app.post("/translations", response_model=TranslationOut)
def create_translation(
    payload: TranslationCreate,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        # Check if exists
        exists = s.query(Translation).filter(
            Translation.lang == payload.lang,
            Translation.namespace == payload.namespace,
            Translation.key == payload.key
        ).first()
        
        now = _now()
        if exists:
            exists.value = payload.value
            exists.updated_at = now
            s.add(exists)
            s.commit()
            return TranslationOut(
                id=exists.id,
                updated_at=exists.updated_at,
                lang=exists.lang,
                namespace=exists.namespace,
                key=exists.key,
                value=exists.value,
            )
        
        t = Translation(
            id=str(uuid4()),
            lang=payload.lang,
            namespace=payload.namespace,
            key=payload.key,
            value=payload.value,
            updated_at=now,
        )
        s.add(t)
        s.commit()
        return TranslationOut(
            id=t.id,
            updated_at=t.updated_at,
            lang=t.lang,
            namespace=t.namespace,
            key=t.key,
            value=t.value,
        )

@app.delete("/translations/{translation_id}")
def delete_translation(
    translation_id: str,
    tenant_engine=Depends(get_tenant_engine),
    principal=Depends(require_roles("admin")),
):
    with session(tenant_engine) as s:
        t = s.get(Translation, translation_id)
        if t:
            s.delete(t)
            s.commit()
    return {"status": "ok"}

@app.get("/translations/bundle/{lang}/{namespace}")
def get_translation_bundle(
    lang: str,
    namespace: str,
    tenant_engine=Depends(get_tenant_engine),
):
    with session(tenant_engine) as s:
        rows = s.query(Translation).filter(
            Translation.lang == lang,
            Translation.namespace == namespace
        ).all()
    
    return {r.key: r.value for r in rows}
