from datetime import date, datetime
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from .security import require_roles

app = FastAPI(
    title="Cruise & Itinerary Management Service",
    version="0.1.0",
    description="Plans and manages sailings, itineraries, port stops, and operational logistics.",
)


class PortStop(BaseModel):
    port_code: str = Field(description="UN/LOCODE or internal port code")
    port_name: str | None = None
    arrival: datetime
    departure: datetime


class SailingCreate(BaseModel):
    code: str = Field(description="Unique sailing code")
    ship_id: str
    start_date: date
    end_date: date
    embark_port_code: str
    debark_port_code: str
    status: Literal["planned", "open", "closed", "cancelled"] = "planned"


class Sailing(SailingCreate):
    id: str
    created_at: datetime
    port_stops: list[PortStop] = Field(default_factory=list)


_DB: dict[str, Sailing] = {}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/sailings", response_model=Sailing)
def create_sailing(payload: SailingCreate, _principal=Depends(require_roles("staff", "admin"))):
    if any(s.code == payload.code for s in _DB.values()):
        raise HTTPException(status_code=409, detail="Sailing code already exists")
    sailing = Sailing(id=str(uuid4()), created_at=datetime.utcnow(), **payload.model_dump())
    _DB[sailing.id] = sailing
    return sailing


@app.get("/sailings", response_model=list[Sailing])
def list_sailings(status: str | None = None, ship_id: str | None = None):
    sailings = list(_DB.values())
    if status:
        sailings = [s for s in sailings if s.status == status]
    if ship_id:
        sailings = [s for s in sailings if s.ship_id == ship_id]
    return sailings


@app.get("/sailings/{sailing_id}", response_model=Sailing)
def get_sailing(sailing_id: str):
    sailing = _DB.get(sailing_id)
    if not sailing:
        raise HTTPException(status_code=404, detail="Sailing not found")
    return sailing


@app.get("/sailings/{sailing_id}/itinerary", response_model=list[PortStop])
def get_itinerary(sailing_id: str):
    sailing = _DB.get(sailing_id)
    if not sailing:
        raise HTTPException(status_code=404, detail="Sailing not found")
    return sailing.port_stops


@app.post("/sailings/{sailing_id}/port-stops", response_model=Sailing)
def add_port_stop(
    sailing_id: str,
    stop: PortStop,
    _principal=Depends(require_roles("staff", "admin")),
):
    sailing = _DB.get(sailing_id)
    if not sailing:
        raise HTTPException(status_code=404, detail="Sailing not found")

    if stop.departure <= stop.arrival:
        raise HTTPException(status_code=400, detail="departure must be after arrival")

    sailing.port_stops.append(stop)
    sailing.port_stops.sort(key=lambda s: s.arrival)
    _DB[sailing_id] = sailing
    return sailing
