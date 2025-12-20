from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_

from .consumer import start_consumer
from .db import session
from .models import AuditLog, BookingHistory, Customer, StaffGroup, StaffGroupMember, StaffUser
from .security import get_principal_optional, issue_token, require_roles
from .tenancy import get_tenant_engine

app = FastAPI(
    title="Customer Management (CRM) Service",
    version="0.1.0",
    description="Customer profiles, preferences, loyalty/rewards, and booking history (projected from events).",
)


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
                )
            )
        rows = qry.offset(offset).limit(limit).all()

    return [
        CustomerOut(
            id=r.id,
            created_at=r.created_at,
            updated_at=r.updated_at,
            email=r.email,
            first_name=r.first_name,
            last_name=r.last_name,
            loyalty_tier=r.loyalty_tier,
            preferences=r.preferences,
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

    _audit(
        tenant_engine=tenant_engine,
        principal=principal,
        action="customer.create",
        entity_type="customer",
        entity_id=cust.id,
        meta={"request": payload.model_dump()},
    )

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
    principal=Depends(require_roles("agent", "staff", "admin")),
):
    with session(tenant_engine) as s:
        cust = s.get(Customer, customer_id)
        if cust is None:
            raise HTTPException(status_code=404, detail="Customer not found")

        before = {
            "first_name": cust.first_name,
            "last_name": cust.last_name,
            "loyalty_tier": cust.loyalty_tier,
            "preferences": cust.preferences,
        }

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

        after = {
            "first_name": cust.first_name,
            "last_name": cust.last_name,
            "loyalty_tier": cust.loyalty_tier,
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
