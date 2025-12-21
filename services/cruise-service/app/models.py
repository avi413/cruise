from __future__ import annotations
from datetime import datetime, date
from sqlalchemy import DateTime, ForeignKey, JSON, String, Date
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class Port(Base):
    __tablename__ = "ports"
    
    code: Mapped[str] = mapped_column(String, primary_key=True) # UN/LOCODE
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    
    names: Mapped[dict] = mapped_column(JSON, default=dict)
    cities: Mapped[dict] = mapped_column(JSON, default=dict)
    countries: Mapped[dict] = mapped_column(JSON, default=dict)

class Itinerary(Base):
    __tablename__ = "itineraries"
    
    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    
    code: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    titles: Mapped[dict] = mapped_column(JSON, default=dict)
    map_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    
    # Storing stops as JSON list of dicts
    stops: Mapped[list] = mapped_column(JSON, default=list) 

class Sailing(Base):
    __tablename__ = "sailings"
    
    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    
    code: Mapped[str] = mapped_column(String, unique=True)
    ship_id: Mapped[str] = mapped_column(String, index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    
    embark_port_code: Mapped[str] = mapped_column(String)
    debark_port_code: Mapped[str] = mapped_column(String)
    
    status: Mapped[str] = mapped_column(String, default="planned")
    
    itinerary_id: Mapped[str | None] = mapped_column(String, ForeignKey("itineraries.id"), nullable=True)
    
    # Storing port_stops as JSON list of dicts
    port_stops: Mapped[list] = mapped_column(JSON, default=list)