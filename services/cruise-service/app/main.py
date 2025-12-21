from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

from .security import require_roles
from .db import engine, session
from .models import Base, Port as PortRow, Itinerary as ItineraryRow, Sailing as SailingRow

app = FastAPI(
    title="Cruise & Itinerary Management Service",
    version="0.1.0",
    description="Plans and manages sailings, itineraries, port stops, and operational logistics.",
)

# Create tables on startup
Base.metadata.create_all(engine)

#
# Helpers
#

def _norm_code(code: str) -> str:
    c = (code or "").strip().upper()
    if not c:
        raise HTTPException(status_code=400, detail="port code is required")
    return c

def _clean_i18n_map(m: dict[str, str] | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in (m or {}).items():
        lk = (k or "").strip()
        lv = (v or "").strip()
        if lk and lv:
            out[lk] = lv
    return out

def _parse_fallback_langs(fallback_langs: str | None) -> list[str]:
    raw = fallback_langs or ""
    return [p.strip() for p in raw.split(",") if p.strip()]

def _pick_i18n(m: dict[str, str] | None, preferred: list[str]) -> str | None:
    mm = m or {}
    for k in preferred:
        v = mm.get(k)
        if v:
            return v
    return next(iter(mm.values()), None)

def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc).replace(tzinfo=None)

def _parse_hhmm(value: str | None, *, default: time) -> time:
    if value is None:
        return default
    try:
        hh, mm = value.split(":")
        return time(hour=int(hh), minute=int(mm))
    except Exception:
        raise HTTPException(status_code=400, detail="time must be in HH:MM format")

#
# Pydantic Models
#

class PortCreate(BaseModel):
    code: str = Field(description="UN/LOCODE or internal port code")
    names: dict[str, str] = Field(default_factory=dict)
    cities: dict[str, str] = Field(default_factory=dict)
    countries: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate(self) -> "PortCreate":
        self.code = _norm_code(self.code)
        self.names = _clean_i18n_map(self.names)
        self.cities = _clean_i18n_map(self.cities)
        self.countries = _clean_i18n_map(self.countries)
        if not self.names:
            raise ValueError("names must include at least one translation")
        return self

class PortPatch(BaseModel):
    names: dict[str, str] | None = None
    cities: dict[str, str] | None = None
    countries: dict[str, str] | None = None

class Port(PortCreate):
    created_at: datetime
    updated_at: datetime

class PortDisplay(BaseModel):
    code: str
    name: str | None = None
    city: str | None = None
    country: str | None = None

class PortStop(BaseModel):
    port_code: str
    port_name: str | None = None
    port_city: str | None = None
    port_country: str | None = None
    arrival: datetime
    departure: datetime

class ItineraryStop(BaseModel):
    day_offset: int = Field(ge=0)
    kind: Literal["port", "sea"]
    image_url: str = Field(min_length=1)
    port_code: str | None = None
    port_name: str | None = None
    port: PortDisplay | None = None
    arrival_time: str | None = None
    departure_time: str | None = None
    labels: dict[str, str] | None = None

    @model_validator(mode="after")
    def _validate_kind_fields(self) -> "ItineraryStop":
        if self.kind == "port":
            if not (self.port_code and self.port_code.strip()):
                raise ValueError("port_code is required when kind='port'")
        else:
            self.port_code = None
            self.port_name = None
            self.port = None
            self.arrival_time = None
            self.departure_time = None
        return self

class ItineraryCreate(BaseModel):
    code: str | None = None
    titles: dict[str, str]
    map_image_url: str | None = None
    stops: list[ItineraryStop] = Field(min_length=1)

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
    code: str
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
    itinerary_id: str | None = None

class SailingPatch(BaseModel):
    code: str | None = None
    ship_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    embark_port_code: str | None = None
    debark_port_code: str | None = None
    status: Literal["planned", "open", "closed", "cancelled"] | None = None

class ItineraryDates(BaseModel):
    start_date: date
    end_date: date
    nights: int
    days: int

class SailingFromItineraryCreate(BaseModel):
    code: str
    ship_id: str
    start_date: date
    status: Literal["planned", "open", "closed", "cancelled"] = "planned"

#
# Logic Helpers
#

def _port_display_from_db(code: str, session, *, lang: str | None, fallback_langs: str | None) -> PortDisplay | None:
    c = _norm_code(code)
    p = session.get(PortRow, c)
    if not p:
        return None
    preferred: list[str] = []
    if lang and lang.strip():
        preferred.append(lang.strip())
    preferred.extend(_parse_fallback_langs(fallback_langs))
    if "en" not in preferred:
        preferred.append("en")
    return PortDisplay(
        code=p.code,
        name=_pick_i18n(p.names, preferred),
        city=_pick_i18n(p.cities, preferred),
        country=_pick_i18n(p.countries, preferred),
    )

def _enrich_itinerary(itinerary: Itinerary, session, *, lang: str | None, fallback_langs: str | None) -> Itinerary:
    it = itinerary.model_copy(deep=True)
    for s in it.stops:
        if s.kind == "port" and s.port_code:
            s.port = _port_display_from_db(s.port_code, session, lang=lang, fallback_langs=fallback_langs)
    return it

#
# Endpoints
#

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/ports", response_model=list[Port])
def list_ports(q: str | None = None):
    with session() as s:
        query = s.query(PortRow)
        # Simple in-memory filtering for now as JSON querying varies by DB
        rows = query.order_by(PortRow.code).all()
        
        items = [
            Port(
                code=r.code,
                names=r.names or {},
                cities=r.cities or {},
                countries=r.countries or {},
                created_at=r.created_at,
                updated_at=r.updated_at
            ) for r in rows
        ]
        
        if q and q.strip():
            qq = q.strip().lower()
            items = [
                p for p in items
                if qq in p.code.lower()
                or any(qq in (v or "").lower() for v in p.names.values())
                or any(qq in (v or "").lower() for v in p.cities.values())
                or any(qq in (v or "").lower() for v in p.countries.values())
            ]
        return items

@app.post("/ports", response_model=Port)
def create_port(payload: PortCreate, _principal=Depends(require_roles("staff", "admin"))):
    code = _norm_code(payload.code)
    now = _utcnow()
    with session() as s:
        if s.get(PortRow, code):
            raise HTTPException(status_code=409, detail="Port code already exists")
        
        row = PortRow(
            code=code,
            created_at=now,
            updated_at=now,
            names=payload.names,
            cities=payload.cities,
            countries=payload.countries
        )
        s.add(row)
        s.commit()
        s.refresh(row)
        return Port(
            code=row.code,
            names=row.names,
            cities=row.cities,
            countries=row.countries,
            created_at=row.created_at,
            updated_at=row.updated_at
        )

@app.get("/ports/{port_code}", response_model=Port)
def get_port(port_code: str):
    code = _norm_code(port_code)
    with session() as s:
        row = s.get(PortRow, code)
        if not row:
            raise HTTPException(status_code=404, detail="Port not found")
        return Port(
            code=row.code,
            names=row.names,
            cities=row.cities,
            countries=row.countries,
            created_at=row.created_at,
            updated_at=row.updated_at
        )

@app.patch("/ports/{port_code}", response_model=Port)
def patch_port(port_code: str, payload: PortPatch, _principal=Depends(require_roles("staff", "admin"))):
    code = _norm_code(port_code)
    with session() as s:
        row = s.get(PortRow, code)
        if not row:
            raise HTTPException(status_code=404, detail="Port not found")

        if payload.names is not None:
            row.names = {**(row.names or {}), **_clean_i18n_map(payload.names)}
            if not row.names:
                raise HTTPException(status_code=400, detail="names must include at least one translation")
        if payload.cities is not None:
            row.cities = {**(row.cities or {}), **_clean_i18n_map(payload.cities)}
        if payload.countries is not None:
            row.countries = {**(row.countries or {}), **_clean_i18n_map(payload.countries)}

        row.updated_at = _utcnow()
        s.add(row)
        s.commit()
        s.refresh(row)
        
        return Port(
            code=row.code,
            names=row.names,
            cities=row.cities,
            countries=row.countries,
            created_at=row.created_at,
            updated_at=row.updated_at
        )

@app.delete("/ports/{port_code}")
def delete_port(port_code: str, _principal=Depends(require_roles("staff", "admin"))):
    code = _norm_code(port_code)
    with session() as s:
        row = s.get(PortRow, code)
        if not row:
            raise HTTPException(status_code=404, detail="Port not found")
        s.delete(row)
        s.commit()
    return {"status": "ok"}

@app.post("/itineraries", response_model=Itinerary)
def create_itinerary(payload: ItineraryCreate, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        if payload.code:
            code = payload.code.strip()
            if not code:
                raise HTTPException(status_code=400, detail="code cannot be blank")
            if s.query(ItineraryRow).filter(ItineraryRow.code == code).first():
                raise HTTPException(status_code=409, detail="Itinerary code already exists")
            payload.code = code

        now = _utcnow()
        row = ItineraryRow(
            id=str(uuid4()),
            created_at=now,
            updated_at=now,
            code=payload.code,
            titles=payload.titles,
            map_image_url=payload.map_image_url,
            stops=[stop.model_dump() for stop in payload.stops]
        )
        s.add(row)
        s.commit()
        
        itinerary = Itinerary(
            id=row.id,
            created_at=row.created_at,
            updated_at=row.updated_at,
            code=row.code,
            titles=row.titles or {},
            map_image_url=row.map_image_url,
            stops=[ItineraryStop(**stop) for stop in (row.stops or [])]
        )
        return _enrich_itinerary(itinerary, s, lang="en", fallback_langs=None)

@app.get("/itineraries", response_model=list[Itinerary])
def list_itineraries(code: str | None = None, lang: str | None = None, fallback_langs: str | None = None):
    with session() as s:
        q = s.query(ItineraryRow)
        if code is not None:
            q = q.filter(ItineraryRow.code == code)
        rows = q.all()
        
        results = []
        for r in rows:
            it = Itinerary(
                id=r.id,
                created_at=r.created_at,
                updated_at=r.updated_at,
                code=r.code,
                titles=r.titles or {},
                map_image_url=r.map_image_url,
                stops=[ItineraryStop(**stop) for stop in (r.stops or [])]
            )
            results.append(_enrich_itinerary(it, s, lang=lang, fallback_langs=fallback_langs))
        return results

@app.get("/itineraries/{itinerary_id}", response_model=Itinerary)
def get_itinerary_entity(itinerary_id: str, lang: str | None = None, fallback_langs: str | None = None):
    with session() as s:
        r = s.get(ItineraryRow, itinerary_id)
        if not r:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        
        it = Itinerary(
            id=r.id,
            created_at=r.created_at,
            updated_at=r.updated_at,
            code=r.code,
            titles=r.titles or {},
            map_image_url=r.map_image_url,
            stops=[ItineraryStop(**stop) for stop in (r.stops or [])]
        )
        return _enrich_itinerary(it, s, lang=lang, fallback_langs=fallback_langs)

@app.put("/itineraries/{itinerary_id}", response_model=Itinerary)
def replace_itinerary(
    itinerary_id: str,
    payload: ItineraryCreate,
    _principal=Depends(require_roles("staff", "admin")),
):
    with session() as s:
        existing = s.get(ItineraryRow, itinerary_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Itinerary not found")

        if payload.code is not None:
            code = payload.code.strip()
            if not code:
                # If code was explicitly sent as empty string/null but we want to allow removing it?
                # The model says `code: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)`
                # payload.code is Optional[str].
                # If the user wants to remove code, they might send null.
                # But here we strip() and check if not code.
                # If payload.code is "", stripped is "".
                # Then we raise 400.
                # But maybe we should allow clearing the code?
                # If payload.code is None, we skip this block.
                # If the user sends `code: ""` in JSON, pydantic makes it "".
                # Then we raise 400.
                # If the user wants to clear it, they should send `null`.
                # If they send `null`, pydantic makes it None.
                # Then we skip this block.
                # And later: `existing.code = payload.code`.
                # So if payload.code is None, we set existing.code to None.
                # This seems correct for clearing.
                raise HTTPException(status_code=400, detail="code cannot be blank")
            # Ensure unique code across itineraries (excluding self)
            conflict = s.query(ItineraryRow).filter(ItineraryRow.code == code).filter(ItineraryRow.id != itinerary_id).first()
            if conflict:
                raise HTTPException(status_code=409, detail="Itinerary code already exists")
            payload.code = code

        now = _utcnow()
        existing.updated_at = now
        existing.code = payload.code
        existing.titles = payload.titles
        existing.map_image_url = payload.map_image_url
        existing.stops = [stop.model_dump() for stop in payload.stops]
        
        s.add(existing)
        s.commit()
        s.refresh(existing)
        
        updated = Itinerary(
            id=existing.id,
            created_at=existing.created_at,
            updated_at=existing.updated_at,
            code=existing.code,
            titles=existing.titles or {},
            map_image_url=existing.map_image_url,
            stops=[ItineraryStop(**stop) for stop in (existing.stops or [])]
        )
        return _enrich_itinerary(updated, s, lang="en", fallback_langs=None)

@app.delete("/itineraries/{itinerary_id}")
def delete_itinerary(itinerary_id: str, _principal=Depends(require_roles("staff", "admin"))):
    with session() as s:
        row = s.get(ItineraryRow, itinerary_id)
        if not row:
            raise HTTPException(status_code=404, detail="Itinerary not found")
            
        # Check usage
        usage = s.query(SailingRow).filter(SailingRow.itinerary_id == itinerary_id).first()
        if usage:
             raise HTTPException(status_code=409, detail="Cannot delete itinerary used by sailings")
             
        s.delete(row)
        s.commit()
    return {"status": "ok"}

@app.get("/itineraries/{itinerary_id}/compute", response_model=ItineraryDates)
def compute_itinerary_dates(itinerary_id: str, start_date: date):
    # Re-use get_itinerary_entity logic but simpler
    with session() as s:
        r = s.get(ItineraryRow, itinerary_id)
        if not r:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        
        itinerary = Itinerary(
            id=r.id,
            created_at=r.created_at,
            updated_at=r.updated_at,
            code=r.code,
            titles=r.titles or {},
            map_image_url=r.map_image_url,
            stops=[ItineraryStop(**stop) for stop in (r.stops or [])]
        )
        
    end_date = start_date + timedelta(days=itinerary.days - 1)
    return ItineraryDates(start_date=start_date, end_date=end_date, nights=itinerary.nights, days=itinerary.days)

@app.post("/sailings", response_model=Sailing)
def create_sailing(payload: SailingCreate, _principal=Depends(require_roles("staff", "admin"))):
    raise HTTPException(
        status_code=400,
        detail="Sailing must be created from an itinerary. Use POST /itineraries/{itinerary_id}/sailings.",
    )

@app.get("/sailings", response_model=list[Sailing])
def list_sailings(status: str | None = None, ship_id: str | None = None, itinerary_id: str | None = None):
    with session() as s:
        q = s.query(SailingRow)
        if status:
            q = q.filter(SailingRow.status == status)
        if ship_id:
            q = q.filter(SailingRow.ship_id == ship_id)
        if itinerary_id:
            q = q.filter(SailingRow.itinerary_id == itinerary_id)
        rows = q.all()
        
        return [
            Sailing(
                id=r.id,
                created_at=r.created_at,
                code=r.code,
                ship_id=r.ship_id,
                start_date=r.start_date,
                end_date=r.end_date,
                embark_port_code=r.embark_port_code,
                debark_port_code=r.debark_port_code,
                status=r.status,
                itinerary_id=r.itinerary_id,
                port_stops=[PortStop(**ps) for ps in (r.port_stops or [])]
            ) for r in rows
        ]

@app.get("/sailings/{sailing_id}", response_model=Sailing)
def get_sailing(sailing_id: str):
    with session() as s:
        r = s.get(SailingRow, sailing_id)
        if not r:
            raise HTTPException(status_code=404, detail="Sailing not found")
        return Sailing(
            id=r.id,
            created_at=r.created_at,
            code=r.code,
            ship_id=r.ship_id,
            start_date=r.start_date,
            end_date=r.end_date,
            embark_port_code=r.embark_port_code,
            debark_port_code=r.debark_port_code,
            status=r.status,
            itinerary_id=r.itinerary_id,
            port_stops=[PortStop(**ps) for ps in (r.port_stops or [])]
        )

@app.patch("/sailings/{sailing_id}", response_model=Sailing)
def patch_sailing(
    sailing_id: str,
    payload: SailingPatch,
    _principal=Depends(require_roles("staff", "admin")),
):
    with session() as s:
        sailing = s.get(SailingRow, sailing_id)
        if not sailing:
            raise HTTPException(status_code=404, detail="Sailing not found")

        if payload.code is not None:
            code = payload.code.strip()
            if not code:
                raise HTTPException(status_code=400, detail="code cannot be blank")
            # Ensure unique code
            conflict = s.query(SailingRow).filter(SailingRow.code == code).filter(SailingRow.id != sailing_id).first()
            if conflict:
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

        s.add(sailing)
        s.commit()
        s.refresh(sailing)
        
        return Sailing(
            id=sailing.id,
            created_at=sailing.created_at,
            code=sailing.code,
            ship_id=sailing.ship_id,
            start_date=sailing.start_date,
            end_date=sailing.end_date,
            embark_port_code=sailing.embark_port_code,
            debark_port_code=sailing.debark_port_code,
            status=sailing.status,
            itinerary_id=sailing.itinerary_id,
            port_stops=[PortStop(**ps) for ps in (sailing.port_stops or [])]
        )

@app.post("/itineraries/{itinerary_id}/sailings", response_model=Sailing)
def create_sailing_from_itinerary(
    itinerary_id: str,
    payload: SailingFromItineraryCreate,
    _principal=Depends(require_roles("staff", "admin")),
):
    with session() as s:
        itinerary_row = s.get(ItineraryRow, itinerary_id)
        if not itinerary_row:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        
        # Convert to Pydantic for logic
        itinerary = Itinerary(
            id=itinerary_row.id,
            created_at=itinerary_row.created_at,
            updated_at=itinerary_row.updated_at,
            code=itinerary_row.code,
            titles=itinerary_row.titles or {},
            map_image_url=itinerary_row.map_image_url,
            stops=[ItineraryStop(**stop) for stop in (itinerary_row.stops or [])]
        )

        if s.query(SailingRow).filter(SailingRow.code == payload.code).first():
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

            # If a managed Port exists, use it to populate name/city/country unless explicitly overridden.
            port_disp = _port_display_from_db(day.port_code or "", s, lang="en", fallback_langs=None) if day.port_code else None
            port_name = (day.port_name or "").strip() or (port_disp.name if port_disp else None)
            port_city = port_disp.city if port_disp else None
            port_country = port_disp.country if port_disp else None

            port_stops.append(
                PortStop(
                    port_code=day.port_code or "",
                    port_name=port_name,
                    port_city=port_city,
                    port_country=port_country,
                    arrival=arrival,
                    departure=departure,
                )
            )
        port_stops.sort(key=lambda s: s.arrival)

        sailing = SailingRow(
            id=str(uuid4()),
            created_at=_utcnow(),
            code=payload.code,
            ship_id=payload.ship_id,
            start_date=payload.start_date,
            end_date=end_date,
            embark_port_code=embark_port_code,
            debark_port_code=debark_port_code,
            status=payload.status,
            port_stops=[ps.model_dump(mode='json') for ps in port_stops],
            itinerary_id=itinerary_id,
        )
        s.add(sailing)
        s.commit()
        s.refresh(sailing)
        
        return Sailing(
            id=sailing.id,
            created_at=sailing.created_at,
            code=sailing.code,
            ship_id=sailing.ship_id,
            start_date=sailing.start_date,
            end_date=sailing.end_date,
            embark_port_code=sailing.embark_port_code,
            debark_port_code=sailing.debark_port_code,
            status=sailing.status,
            itinerary_id=sailing.itinerary_id,
            port_stops=[PortStop(**ps) for ps in (sailing.port_stops or [])]
        )

@app.get("/itineraries/{itinerary_id}/sailings", response_model=list[Sailing])
def list_related_sailings(itinerary_id: str):
    with session() as s:
        rows = s.query(SailingRow).filter(SailingRow.itinerary_id == itinerary_id).all()
        return [
            Sailing(
                id=r.id,
                created_at=r.created_at,
                code=r.code,
                ship_id=r.ship_id,
                start_date=r.start_date,
                end_date=r.end_date,
                embark_port_code=r.embark_port_code,
                debark_port_code=r.debark_port_code,
                status=r.status,
                itinerary_id=r.itinerary_id,
                port_stops=[PortStop(**ps) for ps in (r.port_stops or [])]
            ) for r in rows
        ]

@app.get("/sailings/{sailing_id}/itinerary", response_model=list[PortStop])
def get_itinerary(sailing_id: str, lang: str | None = None, fallback_langs: str | None = None):
    with session() as s:
        sailing = s.get(SailingRow, sailing_id)
        if not sailing:
            raise HTTPException(status_code=404, detail="Sailing not found")

        out: list[PortStop] = []
        for ps_dict in (sailing.port_stops or []):
            s_obj = PortStop(**ps_dict)
            disp = _port_display_from_db(s_obj.port_code, s, lang=lang, fallback_langs=fallback_langs)
            prefer_disp = bool(lang and lang.strip())
            out.append(
                PortStop(
                    port_code=s_obj.port_code,
                    port_name=(disp.name if (prefer_disp and disp) else None) or s_obj.port_name or (disp.name if disp else None),
                    port_city=(disp.city if (prefer_disp and disp) else None) or s_obj.port_city or (disp.city if disp else None),
                    port_country=(disp.country if (prefer_disp and disp) else None) or s_obj.port_country or (disp.country if disp else None),
                    arrival=s_obj.arrival,
                    departure=s_obj.departure,
                )
            )
        return out

@app.post("/sailings/{sailing_id}/port-stops", response_model=Sailing)
def add_port_stop(
    sailing_id: str,
    stop: PortStop,
    _principal=Depends(require_roles("staff", "admin")),
):
    with session() as s:
        sailing = s.get(SailingRow, sailing_id)
        if not sailing:
            raise HTTPException(status_code=404, detail="Sailing not found")

        if stop.departure <= stop.arrival:
            raise HTTPException(status_code=400, detail="departure must be after arrival")

        # Backfill managed port fields if available.
        disp = _port_display_from_db(stop.port_code, s, lang="en", fallback_langs=None)
        if disp:
            if not (stop.port_name and stop.port_name.strip()):
                stop.port_name = disp.name
            if not (stop.port_city and stop.port_city.strip()):
                stop.port_city = disp.city
            if not (stop.port_country and stop.port_country.strip()):
                stop.port_country = disp.country

        stops = [PortStop(**ps) for ps in (sailing.port_stops or [])]
        stops.append(stop)
        stops.sort(key=lambda s: s.arrival)
        
        sailing.port_stops = [ps.model_dump() for ps in stops]
        s.add(sailing)
        s.commit()
        s.refresh(sailing)
        
        return Sailing(
            id=sailing.id,
            created_at=sailing.created_at,
            code=sailing.code,
            ship_id=sailing.ship_id,
            start_date=sailing.start_date,
            end_date=sailing.end_date,
            embark_port_code=sailing.embark_port_code,
            debark_port_code=sailing.debark_port_code,
            status=sailing.status,
            itinerary_id=sailing.itinerary_id,
            port_stops=[PortStop(**ps) for ps in (sailing.port_stops or [])]
        )