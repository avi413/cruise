from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

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


def _parse_hhmm(value: str | None, *, default: time) -> time:
    if value is None:
        return default
    try:
        hh, mm = value.split(":")
        return time(hour=int(hh), minute=int(mm))
    except Exception:
        raise HTTPException(status_code=400, detail="time must be in HH:MM format")


def _utcnow() -> datetime:
    # Keep timestamps naive-UTC for consistency with the starter code.
    return datetime.now(tz=timezone.utc).replace(tzinfo=None)


class ItineraryStop(BaseModel):
    """A single day in an itinerary (port stop or sea day).

    Stored as a reusable, relative schedule (day_offset from itinerary start).
    """

    day_offset: int = Field(ge=0, description="0-based day offset from itinerary start")
    kind: Literal["port", "sea"]
    image_url: str = Field(min_length=1, description="Image URL for this day/stop")

    # Port-specific fields (required when kind == 'port')
    port_code: str | None = None
    port_name: str | None = None
    arrival_time: str | None = Field(
        default=None,
        description="Optional arrival time (HH:MM). Used when generating sailings from this itinerary.",
    )
    departure_time: str | None = Field(
        default=None,
        description="Optional departure time (HH:MM). Used when generating sailings from this itinerary.",
    )

    # Optional per-day label (multilingual)
    labels: dict[str, str] | None = Field(
        default=None,
        description="Localized labels for this stop/day, keyed by language code (e.g. 'en', 'ar').",
    )

    @model_validator(mode="after")
    def _validate_kind_fields(self) -> "ItineraryStop":
        if self.kind == "port":
            if not (self.port_code and self.port_code.strip()):
                raise ValueError("port_code is required when kind='port'")
        else:
            self.port_code = None
            self.port_name = None
            self.arrival_time = None
            self.departure_time = None
        return self


class ItineraryCreate(BaseModel):
    code: str | None = Field(default=None, description="Optional unique itinerary code (e.g. 'CARIB-7N').")
    titles: dict[str, str] = Field(
        description="Localized itinerary titles keyed by language code (e.g. {'en': 'Greek Isles', 'ar': '...'})."
    )
    stops: list[ItineraryStop] = Field(min_length=1, description="Ordered list of itinerary days/stops.")

    @model_validator(mode="after")
    def _validate_stops(self) -> "ItineraryCreate":
        offsets = [s.day_offset for s in self.stops]
        if len(set(offsets)) != len(offsets):
            raise ValueError("stops.day_offset must be unique")
        if min(offsets) != 0:
            raise ValueError("stops must start at day_offset=0")
        expected = list(range(max(offsets) + 1))
        if sorted(offsets) != expected:
            raise ValueError("stops.day_offset must be contiguous with no gaps")
        self.stops.sort(key=lambda s: s.day_offset)
        return self


class Itinerary(ItineraryCreate):
    id: str
    created_at: datetime
    updated_at: datetime

    @property
    def days(self) -> int:
        return max(s.day_offset for s in self.stops) + 1

    @property
    def nights(self) -> int:
        return max(0, self.days - 1)


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
    itinerary_id: str | None = Field(default=None, description="Optional link to a reusable itinerary.")


class SailingPatch(BaseModel):
    code: str | None = None
    ship_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    embark_port_code: str | None = None
    debark_port_code: str | None = None
    status: Literal["planned", "open", "closed", "cancelled"] | None = None


_DB: dict[str, Sailing] = {}
_ITINERARIES: dict[str, Itinerary] = {}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/sailings", response_model=Sailing)
def create_sailing(payload: SailingCreate, _principal=Depends(require_roles("staff", "admin"))):
    if any(s.code == payload.code for s in _DB.values()):
        raise HTTPException(status_code=409, detail="Sailing code already exists")
    sailing = Sailing(id=str(uuid4()), created_at=_utcnow(), **payload.model_dump())
    _DB[sailing.id] = sailing
    return sailing


@app.get("/sailings", response_model=list[Sailing])
def list_sailings(status: str | None = None, ship_id: str | None = None, itinerary_id: str | None = None):
    sailings = list(_DB.values())
    if status:
        sailings = [s for s in sailings if s.status == status]
    if ship_id:
        sailings = [s for s in sailings if s.ship_id == ship_id]
    if itinerary_id:
        sailings = [s for s in sailings if s.itinerary_id == itinerary_id]
    return sailings


@app.get("/sailings/{sailing_id}", response_model=Sailing)
def get_sailing(sailing_id: str):
    sailing = _DB.get(sailing_id)
    if not sailing:
        raise HTTPException(status_code=404, detail="Sailing not found")
    return sailing


@app.patch("/sailings/{sailing_id}", response_model=Sailing)
def patch_sailing(
    sailing_id: str,
    payload: SailingPatch,
    _principal=Depends(require_roles("staff", "admin")),
):
    sailing = _DB.get(sailing_id)
    if not sailing:
        raise HTTPException(status_code=404, detail="Sailing not found")

    if payload.code is not None:
        code = payload.code.strip()
        if not code:
            raise HTTPException(status_code=400, detail="code cannot be blank")
        # Ensure unique code across sailings (excluding self)
        if any((sid != sailing_id and s.code == code) for (sid, s) in _DB.items()):
            raise HTTPException(status_code=409, detail="Sailing code already exists")
        sailing.code = code

    if payload.ship_id is not None:
        ship_id = payload.ship_id.strip()
        if not ship_id:
            raise HTTPException(status_code=400, detail="ship_id cannot be blank")
        sailing.ship_id = ship_id

    if payload.start_date is not None:
        sailing.start_date = payload.start_date
    if payload.end_date is not None:
        sailing.end_date = payload.end_date

    if sailing.end_date < sailing.start_date:
        raise HTTPException(status_code=400, detail="end_date must be on/after start_date")

    if payload.embark_port_code is not None:
        embark = payload.embark_port_code.strip()
        if not embark:
            raise HTTPException(status_code=400, detail="embark_port_code cannot be blank")
        sailing.embark_port_code = embark

    if payload.debark_port_code is not None:
        debark = payload.debark_port_code.strip()
        if not debark:
            raise HTTPException(status_code=400, detail="debark_port_code cannot be blank")
        sailing.debark_port_code = debark

    if payload.status is not None:
        sailing.status = payload.status

    _DB[sailing_id] = sailing
    return sailing


@app.post("/itineraries", response_model=Itinerary)
def create_itinerary(payload: ItineraryCreate, _principal=Depends(require_roles("staff", "admin"))):
    if payload.code is not None:
        code = payload.code.strip()
        if not code:
            raise HTTPException(status_code=400, detail="code cannot be blank")
        if any(i.code == code for i in _ITINERARIES.values()):
            raise HTTPException(status_code=409, detail="Itinerary code already exists")
        payload.code = code

    now = _utcnow()
    itinerary = Itinerary(id=str(uuid4()), created_at=now, updated_at=now, **payload.model_dump())
    _ITINERARIES[itinerary.id] = itinerary
    return itinerary


@app.get("/itineraries", response_model=list[Itinerary])
def list_itineraries(code: str | None = None):
    items = list(_ITINERARIES.values())
    if code is not None:
        items = [i for i in items if i.code == code]
    return items


@app.get("/itineraries/{itinerary_id}", response_model=Itinerary)
def get_itinerary_entity(itinerary_id: str):
    itinerary = _ITINERARIES.get(itinerary_id)
    if not itinerary:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    return itinerary


class ItineraryDates(BaseModel):
    start_date: date
    end_date: date
    nights: int
    days: int


@app.get("/itineraries/{itinerary_id}/compute", response_model=ItineraryDates)
def compute_itinerary_dates(itinerary_id: str, start_date: date):
    itinerary = _ITINERARIES.get(itinerary_id)
    if not itinerary:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    end_date = start_date + timedelta(days=itinerary.days - 1)
    return ItineraryDates(start_date=start_date, end_date=end_date, nights=itinerary.nights, days=itinerary.days)


class SailingFromItineraryCreate(BaseModel):
    code: str = Field(description="Unique sailing code")
    ship_id: str
    start_date: date
    status: Literal["planned", "open", "closed", "cancelled"] = "planned"


@app.post("/itineraries/{itinerary_id}/sailings", response_model=Sailing)
def create_sailing_from_itinerary(
    itinerary_id: str,
    payload: SailingFromItineraryCreate,
    _principal=Depends(require_roles("staff", "admin")),
):
    itinerary = _ITINERARIES.get(itinerary_id)
    if not itinerary:
        raise HTTPException(status_code=404, detail="Itinerary not found")

    if any(s.code == payload.code for s in _DB.values()):
        raise HTTPException(status_code=409, detail="Sailing code already exists")

    port_days = [d for d in itinerary.stops if d.kind == "port"]
    if not port_days:
        raise HTTPException(status_code=400, detail="Itinerary must contain at least one port day")
    first_port = min(port_days, key=lambda d: d.day_offset)
    last_port = max(port_days, key=lambda d: d.day_offset)
    embark_port_code = first_port.port_code or ""
    debark_port_code = last_port.port_code or ""
    if not embark_port_code or not debark_port_code:
        raise HTTPException(status_code=400, detail="Itinerary port days must have port_code")

    end_date = payload.start_date + timedelta(days=itinerary.days - 1)

    port_stops: list[PortStop] = []
    for day in port_days:
        stop_date = payload.start_date + timedelta(days=day.day_offset)
        arr_t = _parse_hhmm(day.arrival_time, default=time(hour=8, minute=0))
        dep_t = _parse_hhmm(day.departure_time, default=time(hour=18, minute=0))
        arrival = datetime.combine(stop_date, arr_t)
        departure = datetime.combine(stop_date, dep_t)
        if departure <= arrival:
            raise HTTPException(status_code=400, detail="departure_time must be after arrival_time for port days")
        port_stops.append(
            PortStop(
                port_code=day.port_code or "",
                port_name=day.port_name,
                arrival=arrival,
                departure=departure,
            )
        )
    port_stops.sort(key=lambda s: s.arrival)

    sailing = Sailing(
        id=str(uuid4()),
        created_at=_utcnow(),
        code=payload.code,
        ship_id=payload.ship_id,
        start_date=payload.start_date,
        end_date=end_date,
        embark_port_code=embark_port_code,
        debark_port_code=debark_port_code,
        status=payload.status,
        port_stops=port_stops,
        itinerary_id=itinerary_id,
    )
    _DB[sailing.id] = sailing
    return sailing


@app.get("/itineraries/{itinerary_id}/sailings", response_model=list[Sailing])
def list_related_sailings(itinerary_id: str):
    return [s for s in _DB.values() if s.itinerary_id == itinerary_id]


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
