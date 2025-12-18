from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from .db import engine, session
from .models import Base, Company as CompanyRow, Ship as ShipRow
from .security import require_roles
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


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/companies", response_model=Company)
def create_company(payload: CompanyCreate, _principal=Depends(require_roles("staff", "admin"))):
    tenant_db = tenant_db_name_from_code(payload.code)
    ensure_tenant_database(tenant_db)

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
