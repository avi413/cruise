from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from .db import engine, session
from .models import (
    Base,
    Cabin,
    CabinCategory,
    Company as CompanyRow,
    CompanySettings as CompanySettingsRow,
    Ship as ShipRow,
    ShipCapability,
    ShipRestaurant,
    ShoreExcursion,
    ShoreExcursionPrice,
)
from .security import get_principal_optional, require_roles
from .tenancy import ensure_tenant_database, tenant_db_name_from_code

app = FastAPI(
    title="Ship Management Service",
    version="0.1.0",
    description="Registers and manages ships, amenities, maintenance records, and operational status.",
)


Base.metadata.create_all(engine)


class Amenity(BaseModel):
    name: str
    category: str | None = None
    description: str | None = None


class MaintenanceRecord(BaseModel):
    recorded_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    summary: str
    severity: Literal["low", "medium", "high"] = "low"


class CompanyCreate(BaseModel):
    name: str
    code: str = Field(description="Unique company code")


class Company(CompanyCreate):
    id: str
    created_at: datetime
    tenant_db: str


def _default_company_settings(company: CompanyRow) -> dict:
    # Keep defaults stable and conservative; frontend applies these as CSS vars.
    return {
        "branding": {
            "display_name": company.name,
            "logo_url": None,
            "primary_color": "#388bfd",
            "secondary_color": "#9ecbff",
            "background_url": None,
            "email_from_name": company.name,
            "email_from_address": None,
            "email_templates": {},  # future: {template_key: {subject, html, text}}
            # UI Theme builder defaults (portal-level colors; independent of logo/background image).
            # Built-in theme definitions live in the admin portal; server stores selection + custom themes.
            "ui_theme_active_id": "dark",
            "ui_themes": [],
        },
        "localization": {
            "default_locale": "en",
            "supported_locales": ["en"],
            "default_currency": "USD",
            "supported_currencies": ["USD"],
        },
    }


def _load_or_create_company_settings(company_id: str) -> CompanySettingsRow:
    with session() as s:
        company = s.get(CompanyRow, company_id)
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        row = s.query(CompanySettingsRow).filter(CompanySettingsRow.company_id == company_id).first()
        if row is not None:
            return row

        now = _now()
        defaults = _default_company_settings(company)
        row = CompanySettingsRow(
            id=str(uuid4()),
            company_id=company_id,
            created_at=now,
            updated_at=now,
            branding=defaults["branding"],
            localization=defaults["localization"],
        )
        s.add(row)
        s.commit()
        s.refresh(row)
        return row


class CompanyBranding(BaseModel):
    display_name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    background_url: str | None = None
    email_from_name: str | None = None
    email_from_address: str | None = None
    email_templates: dict = Field(default_factory=dict)
    # Admin-portal UI theme builder (stored per company; applied as CSS vars).
    # Built-in themes ("dark"/"light") are defined client-side; `ui_themes` stores user-created themes.
    ui_theme_active_id: str | None = None
    ui_themes: list[dict] = Field(default_factory=list)


class CompanyLocalization(BaseModel):
    default_locale: str | None = None
    supported_locales: list[str] | None = None
    default_currency: str | None = None
    supported_currencies: list[str] | None = None


class CompanySettingsOut(BaseModel):
    company_id: str
    created_at: datetime
    updated_at: datetime
    branding: CompanyBranding
    localization: CompanyLocalization


class CompanySettingsPatch(BaseModel):
    branding: CompanyBranding | None = None
    localization: CompanyLocalization | None = None


class ShipCreate(BaseModel):
    company_id: str = Field(description="Owning cruise company id")
    name: str
    code: str = Field(description="Unique ship code")
    operator: str | None = None
    decks: int = 0
    status: Literal["active", "inactive", "maintenance"] = "active"


class Ship(ShipCreate):
    id: str
    created_at: datetime
    amenities: list[Amenity] = Field(default_factory=list)
    maintenance_records: list[MaintenanceRecord] = Field(default_factory=list)


def _clean_codes(items: list[str] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for x in (items or []):
        c = (x or "").strip()
        if not c:
            continue
        key = c.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/companies", response_model=Company)
def create_company(payload: CompanyCreate, principal=Depends(get_principal_optional)):
    # Bootstrapping: allow creating the first company without auth.
    with session() as s:
        existing_count = s.query(CompanyRow).count()
    
    if existing_count > 0:
        role = (principal or {}).get("role")
        if role not in ("staff", "admin"):
            raise HTTPException(status_code=403, detail="Forbidden")

    tenant_db = tenant_db_name_from_code(payload.code)
    try:
        ensure_tenant_database(tenant_db)
    except Exception as e:
        # Most common: postgres is not reachable / wrong DSN.
        raise HTTPException(
            status_code=503,
            detail=f"Unable to provision tenant database '{tenant_db}'. Ensure postgres is running and POSTGRES_ADMIN_DSN is correct. Error: {e}",
        )

    now = _now()
    row = CompanyRow(
        id=str(uuid4()),
        created_at=now,
        name=payload.name,
        code=payload.code,
        tenant_db=tenant_db,
    )

    with session() as s:
        existing = s.query(CompanyRow).filter(CompanyRow.code == payload.code).first()
        if existing is not None:
            raise HTTPException(status_code=409, detail="Company code already exists")
        s.add(row)
        s.commit()

    return Company(id=row.id, created_at=row.created_at, name=row.name, code=row.code, tenant_db=row.tenant_db)


@app.get("/companies", response_model=list[Company])
def list_companies():
    with session() as s:
        rows = s.query(CompanyRow).order_by(CompanyRow.created_at.desc()).all()
    return [Company(id=r.id, created_at=r.created_at, name=r.name, code=r.code, tenant_db=r.tenant_db) for r in rows]


@app.get("/companies/{company_id}", response_model=Company)
def get_company(company_id: str):
    with session() as s:
        r = s.get(CompanyRow, company_id)
    if not r:
        raise HTTPException(status_code=404, detail="Company not found")
    return Company(id=r.id, created_at=r.created_at, name=r.name, code=r.code, tenant_db=r.tenant_db)


@app.get("/companies/{company_id}/settings", response_model=CompanySettingsOut)
def get_company_settings(company_id: str):
    """
    White-label + localization settings for this company.

    - Public read (used to brand the login experience).
    - Writes require staff/admin.
    """
    row = _load_or_create_company_settings(company_id)
    return CompanySettingsOut(
        company_id=row.company_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        branding=CompanyBranding(**(row.branding or {})),
        localization=CompanyLocalization(**(row.localization or {})),
    )


@app.patch("/companies/{company_id}/settings", response_model=CompanySettingsOut)
def patch_company_settings(company_id: str, payload: CompanySettingsPatch, _principal=Depends(require_roles("staff", "admin"))):
    row = _load_or_create_company_settings(company_id)
    with session() as s:
        row = s.get(CompanySettingsRow, row.id)
        if row is None:
            raise HTTPException(status_code=404, detail="Settings not found")

        if payload.branding is not None:
            merged = dict(row.branding or {})
            merged.update({k: v for (k, v) in payload.branding.model_dump().items() if v is not None})
            row.branding = merged

        if payload.localization is not None:
            merged = dict(row.localization or {})
            merged.update({k: v for (k, v) in payload.localization.model_dump().items() if v is not None})
            row.localization = merged

        row.updated_at = _now()
        s.add(row)
        s.commit()
        s.refresh(row)

    return CompanySettingsOut(
        company_id=row.company_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        branding=CompanyBranding(**(row.branding or {})),
        localization=CompanyLocalization(**(row.localization or {})),
    )


class CompanyPatch(BaseModel):
    name: str | None = None


@app.patch("/companies/{company_id}", response_model=Company)
def patch_company(company_id: str, payload: CompanyPatch, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        r = s.get(CompanyRow, company_id)
        if not r:
            raise HTTPException(status_code=404, detail="Company not found")

        if payload.name is not None:
            r.name = payload.name
        s.add(r)
        s.commit()

        return Company(id=r.id, created_at=r.created_at, name=r.name, code=r.code, tenant_db=r.tenant_db)


@app.post("/ships", response_model=Ship)
def create_ship(payload: ShipCreate, _principal=Depends(require_roles("staff", "admin"))):
    now = _now()
    with session() as s:
        company = s.get(CompanyRow, payload.company_id)
        if company is None:
            raise HTTPException(status_code=400, detail="Unknown company_id")

        existing = s.query(ShipRow).filter(ShipRow.code == payload.code).first()
        if existing is not None:
            raise HTTPException(status_code=409, detail="Ship code already exists")

        row = ShipRow(
            id=str(uuid4()),
            created_at=now,
            company_id=payload.company_id,
            name=payload.name,
            code=payload.code,
            operator=payload.operator,
            decks=payload.decks,
            status=payload.status,
            amenities=[],
            maintenance_records=[],
        )
        s.add(row)
        s.commit()

    return Ship(
        id=row.id,
        created_at=row.created_at,
        company_id=row.company_id,
        name=row.name,
        code=row.code,
        operator=row.operator,
        decks=row.decks,
        status=row.status,
        amenities=[Amenity(**a) for a in (row.amenities or [])],
        maintenance_records=[MaintenanceRecord(**m) for m in (row.maintenance_records or [])],
    )


@app.get("/ships", response_model=list[Ship])
def list_ships(company_id: str | None = None):
    with session() as s:
        q = s.query(ShipRow)
        if company_id is not None:
            q = q.filter(ShipRow.company_id == company_id)
        rows = q.order_by(ShipRow.created_at.desc()).all()

    return [
        Ship(
            id=r.id,
            created_at=r.created_at,
            company_id=r.company_id,
            name=r.name,
            code=r.code,
            operator=r.operator,
            decks=r.decks,
            status=r.status,
            amenities=[Amenity(**a) for a in (r.amenities or [])],
            maintenance_records=[MaintenanceRecord(**m) for m in (r.maintenance_records or [])],
        )
        for r in rows
    ]


@app.get("/companies/{company_id}/ships", response_model=list[Ship])
def list_company_ships(company_id: str):
    # will raise if company missing
    _ = get_company(company_id)
    return list_ships(company_id=company_id)


@app.get("/ships/{ship_id}", response_model=Ship)
def get_ship(ship_id: str):
    with session() as s:
        r = s.get(ShipRow, ship_id)
    if not r:
        raise HTTPException(status_code=404, detail="Ship not found")
    return Ship(
        id=r.id,
        created_at=r.created_at,
        company_id=r.company_id,
        name=r.name,
        code=r.code,
        operator=r.operator,
        decks=r.decks,
        status=r.status,
        amenities=[Amenity(**a) for a in (r.amenities or [])],
        maintenance_records=[MaintenanceRecord(**m) for m in (r.maintenance_records or [])],
    )


#
# On-ship: Capabilities, Restaurants, Shore Excursions (with port+duration+pricing)
# -------------------------------------------------------------------------------
#


class ShipCapabilityCreate(BaseModel):
    code: str = Field(min_length=1, description="Ship-scoped capability code (e.g. 'wheelchair_accessible').")
    name: str = Field(min_length=1)
    category: str | None = None
    description: str | None = None
    meta: dict = Field(default_factory=dict)


class ShipCapabilityOut(ShipCapabilityCreate):
    id: str
    ship_id: str


class ShipCapabilityPatch(BaseModel):
    name: str | None = None
    category: str | None = None
    description: str | None = None
    meta: dict | None = None


@app.get("/ships/{ship_id}/capabilities", response_model=list[ShipCapabilityOut])
def list_ship_capabilities(ship_id: str):
    _ = get_ship(ship_id)
    with session() as s:
        rows = s.query(ShipCapability).filter(ShipCapability.ship_id == ship_id).order_by(ShipCapability.code.asc()).all()
    return [
        ShipCapabilityOut(
            id=r.id,
            ship_id=r.ship_id,
            code=r.code,
            name=r.name,
            category=r.category,
            description=r.description,
            meta=r.meta or {},
        )
        for r in rows
    ]


@app.post("/ships/{ship_id}/capabilities", response_model=ShipCapabilityOut)
def create_ship_capability(ship_id: str, payload: ShipCapabilityCreate, _principal=Depends(require_roles("staff", "admin"))):
    _ = get_ship(ship_id)
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code is required")
    with session() as s:
        existing = (
            s.query(ShipCapability)
            .filter(ShipCapability.ship_id == ship_id)
            .filter(ShipCapability.code == code)
            .first()
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="Capability code already exists for this ship")
        row = ShipCapability(
            id=str(uuid4()),
            ship_id=ship_id,
            code=code,
            name=(payload.name or "").strip(),
            category=(payload.category or "").strip() or None,
            description=(payload.description or "").strip() or None,
            meta=payload.meta or {},
        )
        s.add(row)
        s.commit()
        s.refresh(row)
    return ShipCapabilityOut(
        id=row.id,
        ship_id=row.ship_id,
        code=row.code,
        name=row.name,
        category=row.category,
        description=row.description,
        meta=row.meta or {},
    )


@app.patch("/capabilities/{capability_id}", response_model=ShipCapabilityOut)
def patch_ship_capability(capability_id: str, payload: ShipCapabilityPatch, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        row = s.get(ShipCapability, capability_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Capability not found")
        if payload.name is not None:
            row.name = payload.name
        if payload.category is not None:
            row.category = payload.category or None
        if payload.description is not None:
            row.description = payload.description or None
        if payload.meta is not None:
            row.meta = payload.meta
        s.add(row)
        s.commit()
        s.refresh(row)
    return ShipCapabilityOut(
        id=row.id,
        ship_id=row.ship_id,
        code=row.code,
        name=row.name,
        category=row.category,
        description=row.description,
        meta=row.meta or {},
    )


@app.delete("/capabilities/{capability_id}")
def delete_ship_capability(capability_id: str, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        row = s.get(ShipCapability, capability_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Capability not found")
        s.delete(row)
        s.commit()
    return {"status": "ok"}


class ShipRestaurantCreate(BaseModel):
    code: str = Field(min_length=1)
    name: str = Field(min_length=1)
    cuisine: str | None = None
    deck: int = Field(default=0, ge=0)
    included: bool = True
    reservation_required: bool = False
    description: str | None = None
    capability_codes: list[str] = Field(default_factory=list, description="Optional capability codes (ship-scoped).")
    meta: dict = Field(default_factory=dict)


class ShipRestaurantOut(ShipRestaurantCreate):
    id: str
    ship_id: str


class ShipRestaurantPatch(BaseModel):
    name: str | None = None
    cuisine: str | None = None
    deck: int | None = Field(default=None, ge=0)
    included: bool | None = None
    reservation_required: bool | None = None
    description: str | None = None
    capability_codes: list[str] | None = None
    meta: dict | None = None


@app.get("/ships/{ship_id}/restaurants", response_model=list[ShipRestaurantOut])
def list_ship_restaurants(ship_id: str):
    _ = get_ship(ship_id)
    with session() as s:
        rows = s.query(ShipRestaurant).filter(ShipRestaurant.ship_id == ship_id).order_by(ShipRestaurant.code.asc()).all()
    return [
        ShipRestaurantOut(
            id=r.id,
            ship_id=r.ship_id,
            code=r.code,
            name=r.name,
            cuisine=r.cuisine,
            deck=int(r.deck or 0),
            included=bool(r.included),
            reservation_required=bool(r.reservation_required),
            description=r.description,
            capability_codes=list(r.capability_codes or []),
            meta=r.meta or {},
        )
        for r in rows
    ]


@app.post("/ships/{ship_id}/restaurants", response_model=ShipRestaurantOut)
def create_ship_restaurant(ship_id: str, payload: ShipRestaurantCreate, _principal=Depends(require_roles("staff", "admin"))):
    _ = get_ship(ship_id)
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code is required")
    with session() as s:
        existing = (
            s.query(ShipRestaurant)
            .filter(ShipRestaurant.ship_id == ship_id)
            .filter(ShipRestaurant.code == code)
            .first()
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="Restaurant code already exists for this ship")
        row = ShipRestaurant(
            id=str(uuid4()),
            ship_id=ship_id,
            code=code,
            name=(payload.name or "").strip(),
            cuisine=(payload.cuisine or "").strip() or None,
            deck=int(payload.deck or 0),
            included=bool(payload.included),
            reservation_required=bool(payload.reservation_required),
            description=(payload.description or "").strip() or None,
            capability_codes=_clean_codes(payload.capability_codes),
            meta=payload.meta or {},
        )
        s.add(row)
        s.commit()
        s.refresh(row)
    return ShipRestaurantOut(
        id=row.id,
        ship_id=row.ship_id,
        code=row.code,
        name=row.name,
        cuisine=row.cuisine,
        deck=int(row.deck or 0),
        included=bool(row.included),
        reservation_required=bool(row.reservation_required),
        description=row.description,
        capability_codes=list(row.capability_codes or []),
        meta=row.meta or {},
    )


@app.patch("/restaurants/{restaurant_id}", response_model=ShipRestaurantOut)
def patch_ship_restaurant(restaurant_id: str, payload: ShipRestaurantPatch, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        row = s.get(ShipRestaurant, restaurant_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Restaurant not found")
        if payload.name is not None:
            row.name = payload.name
        if payload.cuisine is not None:
            row.cuisine = payload.cuisine or None
        if payload.deck is not None:
            row.deck = int(payload.deck)
        if payload.included is not None:
            row.included = bool(payload.included)
        if payload.reservation_required is not None:
            row.reservation_required = bool(payload.reservation_required)
        if payload.description is not None:
            row.description = payload.description or None
        if payload.capability_codes is not None:
            row.capability_codes = _clean_codes(payload.capability_codes)
        if payload.meta is not None:
            row.meta = payload.meta
        s.add(row)
        s.commit()
        s.refresh(row)
    return ShipRestaurantOut(
        id=row.id,
        ship_id=row.ship_id,
        code=row.code,
        name=row.name,
        cuisine=row.cuisine,
        deck=int(row.deck or 0),
        included=bool(row.included),
        reservation_required=bool(row.reservation_required),
        description=row.description,
        capability_codes=list(row.capability_codes or []),
        meta=row.meta or {},
    )


@app.delete("/restaurants/{restaurant_id}")
def delete_ship_restaurant(restaurant_id: str, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        row = s.get(ShipRestaurant, restaurant_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Restaurant not found")
        s.delete(row)
        s.commit()
    return {"status": "ok"}


class ShoreExcursionCreate(BaseModel):
    code: str = Field(min_length=1)
    title: str = Field(min_length=1)
    port_code: str = Field(min_length=1, description="Port code (UN/LOCODE or internal).")
    duration_minutes: int = Field(default=0, ge=0)
    active: bool = True
    description: str | None = None
    capability_codes: list[str] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)


class ShoreExcursionOut(ShoreExcursionCreate):
    id: str
    ship_id: str


class ShoreExcursionPatch(BaseModel):
    title: str | None = None
    port_code: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    active: bool | None = None
    description: str | None = None
    capability_codes: list[str] | None = None
    meta: dict | None = None


@app.get("/ships/{ship_id}/shorex", response_model=list[ShoreExcursionOut])
def list_ship_shorex(ship_id: str, port_code: str | None = None):
    _ = get_ship(ship_id)
    with session() as s:
        q = s.query(ShoreExcursion).filter(ShoreExcursion.ship_id == ship_id)
        if port_code and port_code.strip():
            q = q.filter(ShoreExcursion.port_code == port_code.strip().upper())
        rows = q.order_by(ShoreExcursion.port_code.asc(), ShoreExcursion.code.asc()).all()
    return [
        ShoreExcursionOut(
            id=r.id,
            ship_id=r.ship_id,
            code=r.code,
            title=r.title,
            port_code=r.port_code,
            duration_minutes=int(r.duration_minutes or 0),
            active=bool(r.active),
            description=r.description,
            capability_codes=list(r.capability_codes or []),
            meta=r.meta or {},
        )
        for r in rows
    ]


@app.post("/ships/{ship_id}/shorex", response_model=ShoreExcursionOut)
def create_ship_shorex(ship_id: str, payload: ShoreExcursionCreate, _principal=Depends(require_roles("staff", "admin"))):
    _ = get_ship(ship_id)
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code is required")
    port = (payload.port_code or "").strip().upper()
    if not port:
        raise HTTPException(status_code=400, detail="port_code is required")
    with session() as s:
        existing = (
            s.query(ShoreExcursion)
            .filter(ShoreExcursion.ship_id == ship_id)
            .filter(ShoreExcursion.code == code)
            .first()
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="Shore excursion code already exists for this ship")
        row = ShoreExcursion(
            id=str(uuid4()),
            ship_id=ship_id,
            code=code,
            title=(payload.title or "").strip(),
            port_code=port,
            duration_minutes=int(payload.duration_minutes or 0),
            active=bool(payload.active),
            description=(payload.description or "").strip() or None,
            capability_codes=_clean_codes(payload.capability_codes),
            meta=payload.meta or {},
        )
        s.add(row)
        s.commit()
        s.refresh(row)
    return ShoreExcursionOut(
        id=row.id,
        ship_id=row.ship_id,
        code=row.code,
        title=row.title,
        port_code=row.port_code,
        duration_minutes=int(row.duration_minutes or 0),
        active=bool(row.active),
        description=row.description,
        capability_codes=list(row.capability_codes or []),
        meta=row.meta or {},
    )


@app.patch("/shorex/{shorex_id}", response_model=ShoreExcursionOut)
def patch_ship_shorex(shorex_id: str, payload: ShoreExcursionPatch, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        row = s.get(ShoreExcursion, shorex_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Shore excursion not found")
        if payload.title is not None:
            row.title = payload.title
        if payload.port_code is not None:
            row.port_code = (payload.port_code or "").strip().upper()
        if payload.duration_minutes is not None:
            row.duration_minutes = int(payload.duration_minutes)
        if payload.active is not None:
            row.active = bool(payload.active)
        if payload.description is not None:
            row.description = payload.description or None
        if payload.capability_codes is not None:
            row.capability_codes = _clean_codes(payload.capability_codes)
        if payload.meta is not None:
            row.meta = payload.meta
        s.add(row)
        s.commit()
        s.refresh(row)
    return ShoreExcursionOut(
        id=row.id,
        ship_id=row.ship_id,
        code=row.code,
        title=row.title,
        port_code=row.port_code,
        duration_minutes=int(row.duration_minutes or 0),
        active=bool(row.active),
        description=row.description,
        capability_codes=list(row.capability_codes or []),
        meta=row.meta or {},
    )


@app.delete("/shorex/{shorex_id}")
def delete_ship_shorex(shorex_id: str, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        row = s.get(ShoreExcursion, shorex_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Shore excursion not found")
        # cascade delete prices explicitly (sqlite doesn't enforce FK cascades by default)
        s.query(ShoreExcursionPrice).filter(ShoreExcursionPrice.shorex_id == shorex_id).delete()
        s.delete(row)
        s.commit()
    return {"status": "ok"}


class ShoreExcursionPriceCreate(BaseModel):
    currency: str = Field(default="USD", min_length=3, max_length=3)
    paxtype: str = Field(default="adult", description="adult|child|infant")
    price_cents: int = Field(ge=0)


class ShoreExcursionPriceOut(ShoreExcursionPriceCreate):
    id: str
    shorex_id: str


@app.get("/shorex/{shorex_id}/prices", response_model=list[ShoreExcursionPriceOut])
def list_shorex_prices(shorex_id: str):
    with session() as s:
        shorex = s.get(ShoreExcursion, shorex_id)
        if shorex is None:
            raise HTTPException(status_code=404, detail="Shore excursion not found")
        rows = (
            s.query(ShoreExcursionPrice)
            .filter(ShoreExcursionPrice.shorex_id == shorex_id)
            .order_by(ShoreExcursionPrice.currency.asc(), ShoreExcursionPrice.paxtype.asc())
            .all()
        )
    return [
        ShoreExcursionPriceOut(
            id=r.id,
            shorex_id=r.shorex_id,
            currency=(r.currency or "USD"),
            paxtype=r.paxtype,
            price_cents=int(r.price_cents or 0),
        )
        for r in rows
    ]


@app.post("/shorex/{shorex_id}/prices", response_model=ShoreExcursionPriceOut)
def upsert_shorex_price(
    shorex_id: str, payload: ShoreExcursionPriceCreate, _principal=Depends(require_roles("staff", "admin"))
):
    cur = (payload.currency or "USD").strip().upper()
    pax = (payload.paxtype or "adult").strip().lower()
    if pax not in ("adult", "child", "infant"):
        raise HTTPException(status_code=400, detail="paxtype must be adult|child|infant")
    with session() as s:
        shorex = s.get(ShoreExcursion, shorex_id)
        if shorex is None:
            raise HTTPException(status_code=404, detail="Shore excursion not found")
        row = (
            s.query(ShoreExcursionPrice)
            .filter(ShoreExcursionPrice.shorex_id == shorex_id)
            .filter(ShoreExcursionPrice.currency == cur)
            .filter(ShoreExcursionPrice.paxtype == pax)
            .first()
        )
        if row is None:
            row = ShoreExcursionPrice(
                id=str(uuid4()),
                shorex_id=shorex_id,
                currency=cur,
                paxtype=pax,
                price_cents=int(payload.price_cents),
            )
        else:
            row.price_cents = int(payload.price_cents)
        s.add(row)
        s.commit()
        s.refresh(row)
    return ShoreExcursionPriceOut(id=row.id, shorex_id=row.shorex_id, currency=row.currency, paxtype=row.paxtype, price_cents=row.price_cents)


@app.delete("/shorex-prices/{price_id}")
def delete_shorex_price(price_id: str, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        row = s.get(ShoreExcursionPrice, price_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Price not found")
        s.delete(row)
        s.commit()
    return {"status": "ok"}


class CabinView(str):
    pass


class CabinCategoryCreate(BaseModel):
    code: str
    name: str
    view: str = Field(description="inside|no_view|partial_view|full_view|balcony|suite|panoramic|... (free text)")
    cabin_class: str = Field(default="classic", description="classic|deluxe|suite|... (free text)")
    max_occupancy: int = Field(default=2, ge=1)
    meta: dict = Field(default_factory=dict)


class CabinCategoryOut(CabinCategoryCreate):
    id: str
    ship_id: str


class CabinCategoryPatch(BaseModel):
    name: str | None = None
    view: str | None = None
    cabin_class: str | None = None
    max_occupancy: int | None = Field(default=None, ge=1)
    meta: dict | None = None


class CabinCreate(BaseModel):
    cabin_no: str
    deck: int = Field(default=0, ge=0)
    category_id: str | None = None
    status: str = Field(default="active", description="active|inactive|maintenance")
    accessories: list[str] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)


class CabinOut(CabinCreate):
    id: str
    ship_id: str


class CabinPatch(BaseModel):
    deck: int | None = Field(default=None, ge=0)
    category_id: str | None = None
    status: str | None = None
    accessories: list[str] | None = None
    meta: dict | None = None


class CabinBulkCreateItem(BaseModel):
    cabin_no: str
    deck: int = Field(default=0, ge=0)
    category_id: str | None = None
    category_code: str | None = Field(default=None, description="Optional alternative to category_id (ship-scoped)")
    status: str = Field(default="active", description="active|inactive|maintenance")
    accessories: list[str] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)


class CabinBulkCreateRequest(BaseModel):
    items: list[CabinBulkCreateItem] = Field(min_length=1)
    mode: Literal["skip_existing", "error_on_existing"] = "skip_existing"


class CabinBulkCreateResult(BaseModel):
    created: int
    skipped: int
    errors: list[dict]


@app.get("/ships/{ship_id}/cabin-categories", response_model=list[CabinCategoryOut])
def list_cabin_categories(ship_id: str):
    _ = get_ship(ship_id)
    with session() as s:
        rows = s.query(CabinCategory).filter(CabinCategory.ship_id == ship_id).order_by(CabinCategory.code.asc()).all()
    return [
        CabinCategoryOut(
            id=r.id,
            ship_id=r.ship_id,
            code=r.code,
            name=r.name,
            view=r.view,
            cabin_class=r.cabin_class,
            max_occupancy=r.max_occupancy,
            meta=r.meta or {},
        )
        for r in rows
    ]


@app.post("/ships/{ship_id}/cabin-categories", response_model=CabinCategoryOut)
def create_cabin_category(
    ship_id: str,
    payload: CabinCategoryCreate,
    _principal=Depends(require_roles("staff", "admin")),
):
    _ = get_ship(ship_id)
    with session() as s:
        existing = (
            s.query(CabinCategory)
            .filter(CabinCategory.ship_id == ship_id)
            .filter(CabinCategory.code == payload.code)
            .first()
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="Category code already exists for this ship")
        row = CabinCategory(
            id=str(uuid4()),
            ship_id=ship_id,
            code=payload.code.strip(),
            name=payload.name.strip(),
            view=(payload.view or "").strip(),
            cabin_class=(payload.cabin_class or "").strip(),
            max_occupancy=int(payload.max_occupancy),
            meta=payload.meta,
        )
        s.add(row)
        s.commit()
        s.refresh(row)
    return CabinCategoryOut(
        id=row.id,
        ship_id=row.ship_id,
        code=row.code,
        name=row.name,
        view=row.view,
        cabin_class=row.cabin_class,
        max_occupancy=row.max_occupancy,
        meta=row.meta or {},
    )


@app.patch("/cabin-categories/{category_id}", response_model=CabinCategoryOut)
def patch_cabin_category(
    category_id: str,
    payload: CabinCategoryPatch,
    _principal=Depends(require_roles("staff", "admin")),
):
    with session() as s:
        row = s.get(CabinCategory, category_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Category not found")
        if payload.name is not None:
            row.name = payload.name
        if payload.view is not None:
            row.view = payload.view
        if payload.cabin_class is not None:
            row.cabin_class = payload.cabin_class
        if payload.max_occupancy is not None:
            row.max_occupancy = int(payload.max_occupancy)
        if payload.meta is not None:
            row.meta = payload.meta
        s.add(row)
        s.commit()
        s.refresh(row)
    return CabinCategoryOut(
        id=row.id,
        ship_id=row.ship_id,
        code=row.code,
        name=row.name,
        view=row.view,
        cabin_class=row.cabin_class,
        max_occupancy=row.max_occupancy,
        meta=row.meta or {},
    )


@app.get("/ships/{ship_id}/cabins", response_model=list[CabinOut])
def list_cabins(ship_id: str, category_id: str | None = None):
    _ = get_ship(ship_id)
    with session() as s:
        q = s.query(Cabin).filter(Cabin.ship_id == ship_id)
        if category_id:
            q = q.filter(Cabin.category_id == category_id)
        rows = q.order_by(Cabin.deck.asc(), Cabin.cabin_no.asc()).all()
    return [
        CabinOut(
            id=r.id,
            ship_id=r.ship_id,
            cabin_no=r.cabin_no,
            deck=r.deck,
            category_id=r.category_id,
            status=r.status,
            accessories=list(r.accessories or []),
            meta=r.meta or {},
        )
        for r in rows
    ]


@app.post("/ships/{ship_id}/cabins", response_model=CabinOut)
def create_cabin(
    ship_id: str,
    payload: CabinCreate,
    _principal=Depends(require_roles("staff", "admin")),
):
    _ = get_ship(ship_id)
    with session() as s:
        existing = (
            s.query(Cabin).filter(Cabin.ship_id == ship_id).filter(Cabin.cabin_no == payload.cabin_no.strip()).first()
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="Cabin number already exists for this ship")

        if payload.category_id is not None:
            cat = s.get(CabinCategory, payload.category_id)
            if cat is None or cat.ship_id != ship_id:
                raise HTTPException(status_code=400, detail="Invalid category_id for this ship")

        row = Cabin(
            id=str(uuid4()),
            ship_id=ship_id,
            category_id=payload.category_id,
            cabin_no=payload.cabin_no.strip(),
            deck=int(payload.deck),
            status=payload.status.strip(),
            accessories=list(payload.accessories or []),
            meta=payload.meta,
        )
        s.add(row)
        s.commit()
        s.refresh(row)
    return CabinOut(
        id=row.id,
        ship_id=row.ship_id,
        cabin_no=row.cabin_no,
        deck=row.deck,
        category_id=row.category_id,
        status=row.status,
        accessories=list(row.accessories or []),
        meta=row.meta or {},
    )


@app.post("/ships/{ship_id}/cabins/bulk", response_model=CabinBulkCreateResult)
def bulk_create_cabins(
    ship_id: str,
    payload: CabinBulkCreateRequest,
    _principal=Depends(require_roles("staff", "admin")),
):
    """
    Bulk create cabins (for Excel/CSV imports).

    - `mode=skip_existing`: if a cabin with the same cabin_no exists for the ship, skip it.
    - `mode=error_on_existing`: treat existing cabin_no as an error.
    """
    _ = get_ship(ship_id)

    # Preload category code -> id mapping for this ship (to support Excel files).
    with session() as s:
        cats = s.query(CabinCategory).filter(CabinCategory.ship_id == ship_id).all()
        cat_by_code = {c.code: c.id for c in cats}

        existing = s.query(Cabin.cabin_no).filter(Cabin.ship_id == ship_id).all()
        existing_nos = {r[0] for r in existing}

        created = 0
        skipped = 0
        errors: list[dict] = []

        # Detect duplicates within upload.
        seen: set[str] = set()

        for idx, it in enumerate(payload.items):
            cabin_no = (it.cabin_no or "").strip()
            if not cabin_no:
                errors.append({"index": idx, "cabin_no": it.cabin_no, "error": "cabin_no is required"})
                continue
            if cabin_no in seen:
                errors.append({"index": idx, "cabin_no": cabin_no, "error": "duplicate cabin_no in upload"})
                continue
            seen.add(cabin_no)

            if cabin_no in existing_nos:
                if payload.mode == "error_on_existing":
                    errors.append({"index": idx, "cabin_no": cabin_no, "error": "cabin already exists"})
                else:
                    skipped += 1
                continue

            category_id = it.category_id
            if category_id is None and it.category_code:
                code = it.category_code.strip()
                if code:
                    category_id = cat_by_code.get(code)
                    if category_id is None:
                        errors.append({"index": idx, "cabin_no": cabin_no, "error": f"unknown category_code: {code}"})
                        continue

            row = Cabin(
                id=str(uuid4()),
                ship_id=ship_id,
                category_id=category_id,
                cabin_no=cabin_no,
                deck=int(it.deck or 0),
                status=(it.status or "active").strip(),
                accessories=list(it.accessories or []),
                meta=it.meta or {},
            )
            s.add(row)
            created += 1
            existing_nos.add(cabin_no)

        s.commit()

    return CabinBulkCreateResult(created=created, skipped=skipped, errors=errors)


@app.patch("/cabins/{cabin_id}", response_model=CabinOut)
def patch_cabin(
    cabin_id: str,
    payload: CabinPatch,
    _principal=Depends(require_roles("staff", "admin")),
):
    with session() as s:
        row = s.get(Cabin, cabin_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Cabin not found")
        if payload.category_id is not None:
            if payload.category_id == "":
                row.category_id = None
            else:
                cat = s.get(CabinCategory, payload.category_id)
                if cat is None or cat.ship_id != row.ship_id:
                    raise HTTPException(status_code=400, detail="Invalid category_id for this ship")
                row.category_id = payload.category_id
        if payload.deck is not None:
            row.deck = int(payload.deck)
        if payload.status is not None:
            row.status = payload.status
        if payload.accessories is not None:
            row.accessories = list(payload.accessories or [])
        if payload.meta is not None:
            row.meta = payload.meta

        s.add(row)
        s.commit()
        s.refresh(row)
    return CabinOut(
        id=row.id,
        ship_id=row.ship_id,
        cabin_no=row.cabin_no,
        deck=row.deck,
        category_id=row.category_id,
        status=row.status,
        accessories=list(row.accessories or []),
        meta=row.meta or {},
    )


class ShipPatch(BaseModel):
    name: str | None = None
    operator: str | None = None
    decks: int | None = None
    status: Literal["active", "inactive", "maintenance"] | None = None


@app.patch("/ships/{ship_id}", response_model=Ship)
def patch_ship(
    ship_id: str,
    payload: ShipPatch,
    _principal=Depends(require_roles("staff", "admin")),
):
    with session() as s:
        r = s.get(ShipRow, ship_id)
        if not r:
            raise HTTPException(status_code=404, detail="Ship not found")

        if payload.name is not None:
            r.name = payload.name
        if payload.operator is not None:
            r.operator = payload.operator
        if payload.decks is not None:
            r.decks = payload.decks
        if payload.status is not None:
            r.status = payload.status

        s.add(r)
        s.commit()

    return get_ship(ship_id)


@app.delete("/ships/{ship_id}", status_code=204)
def delete_ship(ship_id: str, _principal=Depends(require_roles("staff", "admin"))):
    """
    Delete a ship and all of its ship-scoped data.

    Notes:
    - Cabins and cabin categories live in the same DB in this starter repo.
    - We delete child rows first to avoid FK constraint failures.
    """
    with session() as s:
        r = s.get(ShipRow, ship_id)
        if not r:
            raise HTTPException(status_code=404, detail="Ship not found")

        # Delete cabins first (FK -> ships)
        s.query(Cabin).filter(Cabin.ship_id == ship_id).delete(synchronize_session=False)
        # Delete categories (FK -> ships)
        s.query(CabinCategory).filter(CabinCategory.ship_id == ship_id).delete(synchronize_session=False)
        # Finally delete ship
        s.delete(r)
        s.commit()
    return None


@app.delete("/cabin-categories/{category_id}", status_code=204)
def delete_cabin_category(category_id: str, _principal=Depends(require_roles("staff", "admin"))):
    """
    Delete a cabin category.

    Any cabins referencing this category are set to NULL (no category).
    """
    with session() as s:
        row = s.get(CabinCategory, category_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Category not found")

        s.query(Cabin).filter(Cabin.category_id == category_id).update({Cabin.category_id: None}, synchronize_session=False)
        s.delete(row)
        s.commit()
    return None


@app.delete("/cabins/{cabin_id}", status_code=204)
def delete_cabin(cabin_id: str, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        row = s.get(Cabin, cabin_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Cabin not found")
        s.delete(row)
        s.commit()
    return None


@app.post("/ships/{ship_id}/amenities", response_model=Ship)
def add_amenity(
    ship_id: str,
    amenity: Amenity,
    _principal=Depends(require_roles("staff", "admin")),
):
    with session() as s:
        r = s.get(ShipRow, ship_id)
        if not r:
            raise HTTPException(status_code=404, detail="Ship not found")

        amenities = list(r.amenities or [])
        amenities.append(amenity.model_dump())
        r.amenities = amenities
        s.add(r)
        s.commit()

    return get_ship(ship_id)


@app.post("/ships/{ship_id}/maintenance-records", response_model=Ship)
def add_maintenance_record(
    ship_id: str,
    record: MaintenanceRecord,
    _principal=Depends(require_roles("staff", "admin")),
):
    with session() as s:
        r = s.get(ShipRow, ship_id)
        if not r:
            raise HTTPException(status_code=404, detail="Ship not found")

        records = list(r.maintenance_records or [])
        records.append(record.model_dump())
        r.maintenance_records = records
        if record.severity in ("medium", "high"):
            r.status = "maintenance"

        s.add(r)
        s.commit()

    return get_ship(ship_id)
