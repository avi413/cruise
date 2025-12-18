from datetime import datetime
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from .security import require_roles

app = FastAPI(
    title="Ship Management Service",
    version="0.1.0",
    description="Registers and manages ships, amenities, maintenance records, and operational status.",
)


class Amenity(BaseModel):
    name: str
    category: str | None = None
    description: str | None = None


class MaintenanceRecord(BaseModel):
    recorded_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    summary: str
    severity: Literal["low", "medium", "high"] = "low"


class ShipCreate(BaseModel):
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


_DB: dict[str, Ship] = {}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ships", response_model=Ship)
def create_ship(payload: ShipCreate, _principal=Depends(require_roles("staff", "admin"))):
    if any(s.code == payload.code for s in _DB.values()):
        raise HTTPException(status_code=409, detail="Ship code already exists")
    ship = Ship(
        id=str(uuid4()),
        created_at=datetime.utcnow(),
        **payload.model_dump(),
    )
    _DB[ship.id] = ship
    return ship


@app.get("/ships", response_model=list[Ship])
def list_ships():
    return list(_DB.values())


@app.get("/ships/{ship_id}", response_model=Ship)
def get_ship(ship_id: str):
    ship = _DB.get(ship_id)
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")
    return ship


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
    ship = _DB.get(ship_id)
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    updated = ship.model_copy(update={k: v for k, v in payload.model_dump().items() if v is not None})
    _DB[ship_id] = updated
    return updated


@app.post("/ships/{ship_id}/amenities", response_model=Ship)
def add_amenity(
    ship_id: str,
    amenity: Amenity,
    _principal=Depends(require_roles("staff", "admin")),
):
    ship = _DB.get(ship_id)
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    ship.amenities.append(amenity)
    _DB[ship_id] = ship
    return ship


@app.post("/ships/{ship_id}/maintenance-records", response_model=Ship)
def add_maintenance_record(
    ship_id: str,
    record: MaintenanceRecord,
    _principal=Depends(require_roles("staff", "admin")),
):
    ship = _DB.get(ship_id)
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    ship.maintenance_records.append(record)
    ship.status = "maintenance" if record.severity in ("medium", "high") else ship.status
    _DB[ship_id] = ship
    return ship
