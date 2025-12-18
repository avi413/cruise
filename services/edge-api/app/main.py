from __future__ import annotations

import os
from datetime import datetime

import httpx
from fastapi import FastAPI, HTTPException, Request

app = FastAPI(
    title="Edge API (BFF)",
    version="0.1.0",
    description="Public website & mobile-facing API that aggregates/internal-proxies to core microservices.",
)

SHIP_SERVICE_URL = os.getenv("SHIP_SERVICE_URL", "http://localhost:8001")
CRUISE_SERVICE_URL = os.getenv("CRUISE_SERVICE_URL", "http://localhost:8002")
CUSTOMER_SERVICE_URL = os.getenv("CUSTOMER_SERVICE_URL", "http://localhost:8003")
BOOKING_SERVICE_URL = os.getenv("BOOKING_SERVICE_URL", "http://localhost:8005")
PRICING_SERVICE_URL = os.getenv("PRICING_SERVICE_URL", "http://localhost:8004")


@app.get("/health")
def health():
    return {"status": "ok"}


async def _proxy(method: str, url: str, request: Request):
    headers = {}
    # Forward Authorization for service-side RBAC
    if "authorization" in request.headers:
        headers["authorization"] = request.headers["authorization"]

    body = await request.body()

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.request(method, url, content=body, headers=headers)

    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    # Best-effort JSON return; fallback to text
    try:
        return r.json()
    except Exception:
        return {"raw": r.text}


@app.get("/v1/cruises")
async def list_cruises():
    """Website: browse sailings, with ship metadata."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        sailings = (await client.get(f"{CRUISE_SERVICE_URL}/sailings")).json()
        ships = (await client.get(f"{SHIP_SERVICE_URL}/ships")).json()

    ships_by_id = {s["id"]: s for s in ships}
    items = []
    for s in sailings:
        items.append(
            {
                "sailing": s,
                "ship": ships_by_id.get(s.get("ship_id")),
            }
        )
    return {"items": items}


@app.post("/v1/quote")
async def create_quote(request: Request):
    """Website/mobile: get real-time pricing quote."""
    return await _proxy("POST", f"{PRICING_SERVICE_URL}/quote", request)


@app.post("/v1/holds")
async def create_hold(request: Request):
    """Website/call-center: place a temporary hold/lock."""
    return await _proxy("POST", f"{BOOKING_SERVICE_URL}/holds", request)


@app.post("/v1/bookings/{booking_id}/confirm")
async def confirm_booking(booking_id: str, request: Request):
    """Website/mobile/call-center: confirm booking (payment integration stub)."""
    return await _proxy("POST", f"{BOOKING_SERVICE_URL}/bookings/{booking_id}/confirm", request)


@app.get("/v1/customers/{customer_id}")
async def get_customer(customer_id: str, request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/customers/{customer_id}", request)


@app.get("/v1/customers/{customer_id}/bookings")
async def get_customer_bookings(customer_id: str, request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/customers/{customer_id}/bookings", request)


@app.get("/v1/mobile/agenda")
async def mobile_agenda(customer_id: str, sailing_id: str):
    """Mobile: very small "What's On Today" starter (stub).

    In a full implementation this would call activity/event + dining + itinerary services.
    """
    today = datetime.utcnow().date().isoformat()
    return {
        "customer_id": customer_id,
        "sailing_id": sailing_id,
        "date": today,
        "items": [
            {
                "time": "09:00",
                "title": "Safety drill",
                "location": "Main Theater",
                "kind": "info",
            },
            {
                "time": "19:00",
                "title": "Dinner seating",
                "location": "Oceanview Restaurant",
                "kind": "dining",
            },
        ],
    }
