from __future__ import annotations

import os
from datetime import datetime

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Edge API (BFF)",
    version="0.1.0",
    description="Public website & mobile-facing API that aggregates/internal-proxies to core microservices.",
)

# CORS: admin portal (3000) calls Edge API (8000) from browser.
# For this starter repo we allow all origins; lock this down in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SHIP_SERVICE_URL = os.getenv("SHIP_SERVICE_URL", "http://localhost:8001")
CRUISE_SERVICE_URL = os.getenv("CRUISE_SERVICE_URL", "http://localhost:8002")
CUSTOMER_SERVICE_URL = os.getenv("CUSTOMER_SERVICE_URL", "http://localhost:8003")
BOOKING_SERVICE_URL = os.getenv("BOOKING_SERVICE_URL", "http://localhost:8005")
PRICING_SERVICE_URL = os.getenv("PRICING_SERVICE_URL", "http://localhost:8004")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://localhost:8006")


@app.get("/health")
def health():
    return {"status": "ok"}


async def _proxy(method: str, url: str, request: Request):
    headers = {}
    # Forward Authorization for service-side RBAC
    if "authorization" in request.headers:
        headers["authorization"] = request.headers["authorization"]
    # Forward tenant header for per-company databases
    if "x-company-id" in request.headers:
        headers["x-company-id"] = request.headers["x-company-id"]

    body = await request.body()

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.request(method, url, content=body, headers=headers)
        except httpx.RequestError as e:
            # Usually indicates a missing upstream service (ship-service/postgres/etc)
            raise HTTPException(status_code=502, detail=f"Upstream unavailable for {method} {url}: {e}")

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
        try:
            sailings = (await client.get(f"{CRUISE_SERVICE_URL}/sailings")).json()
            ships = (await client.get(f"{SHIP_SERVICE_URL}/ships")).json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Upstream unavailable: {e}")

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


@app.get("/v1/companies")
async def list_companies():
    """Admin portal: list cruise companies."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        companies = (await client.get(f"{SHIP_SERVICE_URL}/companies")).json()
    return {"items": companies}


@app.get("/v1/companies/{company_id}/settings")
async def get_company_settings(company_id: str, request: Request):
    """Admin portal: company white-label + localization settings."""
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/companies/{company_id}/settings", request)


@app.patch("/v1/companies/{company_id}/settings")
async def patch_company_settings(company_id: str, request: Request):
    """Admin portal: update company white-label + localization settings."""
    return await _proxy("PATCH", f"{SHIP_SERVICE_URL}/companies/{company_id}/settings", request)


@app.post("/v1/companies")
async def create_company(request: Request):
    """Admin portal: create cruise company."""
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/companies", request)


@app.get("/v1/companies/{company_id}/fleet")
async def list_company_fleet(company_id: str):
    """Admin portal: list ships by company (fleet)."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        ships = (await client.get(f"{SHIP_SERVICE_URL}/companies/{company_id}/ships")).json()
    return {"items": ships}


@app.post("/v1/ships")
async def create_ship(request: Request):
    """Admin portal: create ship under a company."""
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/ships", request)


@app.get("/v1/ships/{ship_id}")
async def get_ship(ship_id: str, request: Request):
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/ships/{ship_id}", request)


@app.patch("/v1/ships/{ship_id}")
async def patch_ship(ship_id: str, request: Request):
    return await _proxy("PATCH", f"{SHIP_SERVICE_URL}/ships/{ship_id}", request)


@app.get("/v1/ships/{ship_id}/cabin-categories")
async def list_ship_cabin_categories(ship_id: str, request: Request):
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabin-categories", request)


@app.post("/v1/ships/{ship_id}/cabin-categories")
async def create_ship_cabin_category(ship_id: str, request: Request):
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabin-categories", request)


@app.patch("/v1/cabin-categories/{category_id}")
async def patch_ship_cabin_category(category_id: str, request: Request):
    return await _proxy("PATCH", f"{SHIP_SERVICE_URL}/cabin-categories/{category_id}", request)


@app.get("/v1/ships/{ship_id}/cabins")
async def list_ship_cabins(ship_id: str, request: Request):
    # passthrough query params (category_id) by manually appending
    q = request.url.query
    url = f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabins"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)


@app.post("/v1/ships/{ship_id}/cabins")
async def create_ship_cabin(ship_id: str, request: Request):
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabins", request)


@app.post("/v1/ships/{ship_id}/cabins/bulk")
async def bulk_create_ship_cabins(ship_id: str, request: Request):
    """Admin portal: bulk import cabins for a ship."""
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabins/bulk", request)


@app.patch("/v1/cabins/{cabin_id}")
async def patch_ship_cabin(cabin_id: str, request: Request):
    return await _proxy("PATCH", f"{SHIP_SERVICE_URL}/cabins/{cabin_id}", request)


@app.post("/v1/staff/login")
async def staff_login(request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/staff/login", request)


@app.post("/v1/platform/login")
async def platform_login(request: Request):
    """Platform admin login (cross-tenant)."""
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/platform/login", request)


@app.get("/v1/staff/me/preferences")
async def get_my_preferences(request: Request):
    """Admin portal: per-user preferences (tenant-scoped)."""
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/staff/me/preferences", request)


@app.patch("/v1/staff/me/preferences")
async def patch_my_preferences(request: Request):
    """Admin portal: update per-user preferences (tenant-scoped)."""
    return await _proxy("PATCH", f"{CUSTOMER_SERVICE_URL}/staff/me/preferences", request)


@app.get("/v1/staff/users")
async def list_staff_users(request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/staff/users", request)


@app.post("/v1/staff/users")
async def create_staff_user(request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/staff/users", request)


@app.patch("/v1/staff/users/{user_id}")
async def patch_staff_user(user_id: str, request: Request):
    return await _proxy("PATCH", f"{CUSTOMER_SERVICE_URL}/staff/users/{user_id}", request)


@app.get("/v1/staff/groups")
async def list_staff_groups(request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/staff/groups", request)


@app.post("/v1/staff/groups")
async def create_staff_group(request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/staff/groups", request)


@app.patch("/v1/staff/groups/{group_id}")
async def patch_staff_group(group_id: str, request: Request):
    return await _proxy("PATCH", f"{CUSTOMER_SERVICE_URL}/staff/groups/{group_id}", request)


@app.get("/v1/staff/groups/{group_id}/members")
async def list_staff_group_members(group_id: str, request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/staff/groups/{group_id}/members", request)


@app.post("/v1/staff/groups/{group_id}/members")
async def add_staff_group_member(group_id: str, request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/staff/groups/{group_id}/members", request)


@app.delete("/v1/staff/groups/{group_id}/members/{user_id}")
async def remove_staff_group_member(group_id: str, user_id: str, request: Request):
    return await _proxy("DELETE", f"{CUSTOMER_SERVICE_URL}/staff/groups/{group_id}/members/{user_id}", request)


@app.get("/v1/staff/audit")
async def list_staff_audit(request: Request):
    """Admin portal: staff action audit log (tenant-scoped)."""
    q = request.url.query
    url = f"{CUSTOMER_SERVICE_URL}/staff/audit"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)


@app.post("/v1/customers")
async def create_customer(request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/customers", request)


@app.get("/v1/customers")
async def list_customers(request: Request):
    """Admin portal: search/list customers (supports query params)."""
    q = request.url.query
    url = f"{CUSTOMER_SERVICE_URL}/customers"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)


@app.patch("/v1/customers/{customer_id}")
async def patch_customer(customer_id: str, request: Request):
    return await _proxy("PATCH", f"{CUSTOMER_SERVICE_URL}/customers/{customer_id}", request)


@app.get("/v1/inventory/sailings/{sailing_id}")
async def get_inventory(sailing_id: str, request: Request):
    return await _proxy("GET", f"{BOOKING_SERVICE_URL}/inventory/sailings/{sailing_id}", request)


@app.post("/v1/inventory/sailings/{sailing_id}")
async def upsert_inventory(sailing_id: str, request: Request):
    return await _proxy("POST", f"{BOOKING_SERVICE_URL}/inventory/sailings/{sailing_id}", request)


@app.get("/v1/inventory/sailings/{sailing_id}/categories")
async def get_category_inventory(sailing_id: str, request: Request):
    return await _proxy("GET", f"{BOOKING_SERVICE_URL}/inventory/sailings/{sailing_id}/categories", request)


@app.post("/v1/inventory/sailings/{sailing_id}/categories")
async def upsert_category_inventory(sailing_id: str, request: Request):
    return await _proxy("POST", f"{BOOKING_SERVICE_URL}/inventory/sailings/{sailing_id}/categories", request)


@app.post("/v1/sailings")
async def create_sailing(request: Request):
    return await _proxy("POST", f"{CRUISE_SERVICE_URL}/sailings", request)


@app.get("/v1/sailings")
async def list_sailings(request: Request):
    q = request.url.query
    url = f"{CRUISE_SERVICE_URL}/sailings"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)


@app.get("/v1/sailings/{sailing_id}")
async def get_sailing(sailing_id: str, request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/sailings/{sailing_id}", request)


@app.patch("/v1/sailings/{sailing_id}")
async def patch_sailing(sailing_id: str, request: Request):
    """Admin portal: update sailing fields (status, dates, ports, etc)."""
    return await _proxy("PATCH", f"{CRUISE_SERVICE_URL}/sailings/{sailing_id}", request)


@app.get("/v1/sailings/{sailing_id}/itinerary")
async def get_sailing_itinerary(sailing_id: str, request: Request):
    q = request.url.query
    url = f"{CRUISE_SERVICE_URL}/sailings/{sailing_id}/itinerary"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)


@app.post("/v1/sailings/{sailing_id}/port-stops")
async def add_port_stop(sailing_id: str, request: Request):
    return await _proxy("POST", f"{CRUISE_SERVICE_URL}/sailings/{sailing_id}/port-stops", request)


@app.get("/v1/ports")
async def list_ports(request: Request):
    q = request.url.query
    url = f"{CRUISE_SERVICE_URL}/ports"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)


@app.post("/v1/ports")
async def create_port(request: Request):
    return await _proxy("POST", f"{CRUISE_SERVICE_URL}/ports", request)


@app.get("/v1/ports/{port_code}")
async def get_port(port_code: str, request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/ports/{port_code}", request)


@app.patch("/v1/ports/{port_code}")
async def patch_port(port_code: str, request: Request):
    return await _proxy("PATCH", f"{CRUISE_SERVICE_URL}/ports/{port_code}", request)


@app.delete("/v1/ports/{port_code}")
async def delete_port(port_code: str, request: Request):
    return await _proxy("DELETE", f"{CRUISE_SERVICE_URL}/ports/{port_code}", request)


@app.get("/v1/itineraries")
async def list_itineraries(request: Request):
    q = request.url.query
    url = f"{CRUISE_SERVICE_URL}/itineraries"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)


@app.post("/v1/itineraries")
async def create_itinerary(request: Request):
    return await _proxy("POST", f"{CRUISE_SERVICE_URL}/itineraries", request)


@app.get("/v1/itineraries/{itinerary_id}")
async def get_itinerary(itinerary_id: str, request: Request):
    q = request.url.query
    url = f"{CRUISE_SERVICE_URL}/itineraries/{itinerary_id}"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)


@app.get("/v1/itineraries/{itinerary_id}/compute")
async def compute_itinerary_dates(itinerary_id: str, request: Request):
    q = request.url.query
    url = f"{CRUISE_SERVICE_URL}/itineraries/{itinerary_id}/compute"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)


@app.get("/v1/itineraries/{itinerary_id}/sailings")
async def list_itinerary_sailings(itinerary_id: str, request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/itineraries/{itinerary_id}/sailings", request)


@app.post("/v1/itineraries/{itinerary_id}/sailings")
async def create_sailing_from_itinerary(itinerary_id: str, request: Request):
    return await _proxy("POST", f"{CRUISE_SERVICE_URL}/itineraries/{itinerary_id}/sailings", request)


@app.post("/v1/quote")
async def create_quote(request: Request):
    """Website/mobile: get real-time pricing quote."""
    return await _proxy("POST", f"{PRICING_SERVICE_URL}/quote", request)


@app.get("/v1/pricing/overrides")
async def list_pricing_overrides(request: Request):
    return await _proxy("GET", f"{PRICING_SERVICE_URL}/overrides", request)


@app.post("/v1/pricing/overrides/cabin-multipliers")
async def set_pricing_cabin_multiplier(request: Request):
    return await _proxy("POST", f"{PRICING_SERVICE_URL}/overrides/cabin-multipliers", request)


@app.post("/v1/pricing/overrides/base-fares")
async def set_pricing_base_fare(request: Request):
    return await _proxy("POST", f"{PRICING_SERVICE_URL}/overrides/base-fares", request)


@app.delete("/v1/pricing/overrides/{company_id}")
async def clear_pricing_overrides(company_id: str, request: Request):
    return await _proxy("DELETE", f"{PRICING_SERVICE_URL}/overrides/{company_id}", request)


@app.get("/v1/pricing/category-prices")
async def list_pricing_category_prices(request: Request):
    return await _proxy("GET", f"{PRICING_SERVICE_URL}/category-prices", request)


@app.post("/v1/pricing/category-prices")
async def upsert_pricing_category_price(request: Request):
    return await _proxy("POST", f"{PRICING_SERVICE_URL}/category-prices", request)


@app.post("/v1/holds")
async def create_hold(request: Request):
    """Website/call-center: place a temporary hold/lock."""
    return await _proxy("POST", f"{BOOKING_SERVICE_URL}/holds", request)


@app.post("/v1/bookings/{booking_id}/confirm")
async def confirm_booking(booking_id: str, request: Request):
    """Website/mobile/call-center: confirm booking (payment integration stub)."""
    return await _proxy("POST", f"{BOOKING_SERVICE_URL}/bookings/{booking_id}/confirm", request)


@app.get("/v1/bookings/{booking_id}")
async def get_booking(booking_id: str, request: Request):
    """Call-center: load booking details by id."""
    return await _proxy("GET", f"{BOOKING_SERVICE_URL}/bookings/{booking_id}", request)


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


@app.get("/v1/notifications")
async def list_notifications(request: Request):
    """Portal: in-app notifications feed (consumes domain events)."""
    q = request.url.query
    url = f"{NOTIFICATION_SERVICE_URL}/notifications"
    if q:
        url = f"{url}?{q}"
    return await _proxy("GET", url, request)
