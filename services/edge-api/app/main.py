import os
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

#
# Configuration
#

# Service URLs (internal docker network)
# Defaults are set for local development (host machine ports) if running outside docker
SHIP_SERVICE_URL = os.getenv("SHIP_SERVICE_URL", "http://localhost:8001")
CRUISE_SERVICE_URL = os.getenv("CRUISE_SERVICE_URL", "http://localhost:8003")
CUSTOMER_SERVICE_URL = os.getenv("CUSTOMER_SERVICE_URL", "http://localhost:8002")
BOOKING_SERVICE_URL = os.getenv("BOOKING_SERVICE_URL", "http://localhost:8005")
PRICING_SERVICE_URL = os.getenv("PRICING_SERVICE_URL", "http://localhost:8004")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://localhost:8006")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")

# Fallback map for local development when services are running in docker but accessed from host
# or when one service is down and we want to try the host port.
# Format: service_name -> [primary_url, fallback_url]
_DEV_DOCKER_DNS_FALLBACK: dict[str, list[str]] = {
    "ship-service": ["http://localhost:8001", "http://localhost:8000"],
    "cruise-service": ["http://localhost:8003", "http://localhost:8000"],
    "customer-service": ["http://localhost:8002", "http://localhost:8000"],
    "booking-service": ["http://localhost:8005", "http://localhost:8000"],
    "pricing-service": ["http://localhost:8004", "http://localhost:8000"],
    "notification-service": ["http://localhost:8006", "http://localhost:8000"],
}

app = FastAPI(title="Edge API", description="Gateway for the Cruise Management System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = httpx.AsyncClient()

async def _proxy(method: str, url: str, request: Request, service_name: str | None = None) -> Response:
    """
    Proxy request to upstream service.
    Includes simple retry logic for local dev (docker dns vs localhost).
    """
    # Extract body
    body = await request.body()
    
    # Prepare headers (exclude host to avoid confusion)
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None) # let httpx handle it

    # Determine URLs to try
    urls = [url]
    if service_name and service_name in _DEV_DOCKER_DNS_FALLBACK:
        # If we are running locally, the primary URL might be the docker service name
        # which isn't resolvable if we are running this script on host.
        # Or vice versa. We try the configured URL first, then fallbacks.
        # For simplicity in this starter, we just try the configured URL.
        # If you want robust fallback:
        # base_path = url.replace(os.getenv(f"{service_name.upper().replace('-','_')}_URL"), "")
        # urls = [f"{base}{base_path}" for base in _DEV_DOCKER_DNS_FALLBACK[service_name]]
        pass

    resp = None
    err = None
    
    try:
        resp = await client.request(method, url, content=body, headers=headers, params=request.query_params)
    except httpx.ConnectError as e:
        err = e
        # If connection failed, try to guess if we are in a mixed env
        # (e.g. edge-api running on host, service in docker on localhost port)
        if service_name and "localhost" not in url:
             # Try localhost fallback
             fallback_base = _DEV_DOCKER_DNS_FALLBACK[service_name][0] # try the host port
             # reconstruct path
             # This is a bit hacky, assumes standard env var naming
             env_val = os.getenv(f"{service_name.upper().replace('-','_')}_URL")
             if env_val and url.startswith(env_val):
                 fallback_url = url.replace(env_val, fallback_base)
                 try:
                     print(f"Proxy fallback: {url} -> {fallback_url}")
                     resp = await client.request(method, fallback_url, content=body, headers=headers, params=request.query_params)
                     err = None
                 except Exception as e2:
                     err = e2

    if err:
        return Response(content=f"Upstream unavailable: {err}", status_code=502)

    return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))


@app.get("/health")
def health():
    return {"status": "ok"}

#
# Ship Service Routes
#

@app.get("/v1/companies")
async def list_companies(request: Request):
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/companies", request, "ship-service")

@app.post("/v1/companies")
async def create_company(request: Request):
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/companies", request, "ship-service")

@app.get("/v1/companies/{company_id}")
async def get_company(company_id: str, request: Request):
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/companies/{company_id}", request, "ship-service")

@app.patch("/v1/companies/{company_id}")
async def patch_company(company_id: str, request: Request):
    return await _proxy("PATCH", f"{SHIP_SERVICE_URL}/companies/{company_id}", request, "ship-service")

@app.get("/v1/companies/{company_id}/settings")
async def get_company_settings(company_id: str, request: Request):
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/companies/{company_id}/settings", request, "ship-service")

@app.patch("/v1/companies/{company_id}/settings")
async def patch_company_settings(company_id: str, request: Request):
    return await _proxy("PATCH", f"{SHIP_SERVICE_URL}/companies/{company_id}/settings", request, "ship-service")

@app.get("/v1/ships")
async def list_ships(request: Request):
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/ships", request, "ship-service")

@app.post("/v1/ships")
async def create_ship(request: Request):
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/ships", request, "ship-service")

@app.get("/v1/ships/{ship_id}")
async def get_ship(ship_id: str, request: Request):
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/ships/{ship_id}", request, "ship-service")

@app.patch("/v1/ships/{ship_id}")
async def patch_ship(ship_id: str, request: Request):
    return await _proxy("PATCH", f"{SHIP_SERVICE_URL}/ships/{ship_id}", request, "ship-service")

@app.delete("/v1/ships/{ship_id}")
async def delete_ship(ship_id: str, request: Request):
    return await _proxy("DELETE", f"{SHIP_SERVICE_URL}/ships/{ship_id}", request, "ship-service")

@app.get("/v1/ships/{ship_id}/cabin-categories")
async def list_cabin_categories(ship_id: str, request: Request):
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabin-categories", request, "ship-service")

@app.post("/v1/ships/{ship_id}/cabin-categories")
async def create_cabin_category(ship_id: str, request: Request):
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabin-categories", request, "ship-service")

@app.patch("/v1/cabin-categories/{category_id}")
async def patch_cabin_category(category_id: str, request: Request):
    return await _proxy("PATCH", f"{SHIP_SERVICE_URL}/cabin-categories/{category_id}", request, "ship-service")

@app.delete("/v1/cabin-categories/{category_id}")
async def delete_cabin_category(category_id: str, request: Request):
    return await _proxy("DELETE", f"{SHIP_SERVICE_URL}/cabin-categories/{category_id}", request, "ship-service")

@app.get("/v1/ships/{ship_id}/cabins")
async def list_cabins(ship_id: str, request: Request):
    return await _proxy("GET", f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabins", request, "ship-service")

@app.post("/v1/ships/{ship_id}/cabins")
async def create_cabin(ship_id: str, request: Request):
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabins", request, "ship-service")

@app.post("/v1/ships/{ship_id}/cabins/bulk")
async def bulk_create_cabins(ship_id: str, request: Request):
    return await _proxy("POST", f"{SHIP_SERVICE_URL}/ships/{ship_id}/cabins/bulk", request, "ship-service")

@app.patch("/v1/cabins/{cabin_id}")
async def patch_cabin(cabin_id: str, request: Request):
    return await _proxy("PATCH", f"{SHIP_SERVICE_URL}/cabins/{cabin_id}", request, "ship-service")

@app.delete("/v1/cabins/{cabin_id}")
async def delete_cabin(cabin_id: str, request: Request):
    return await _proxy("DELETE", f"{SHIP_SERVICE_URL}/cabins/{cabin_id}", request, "ship-service")

#
# Cruise Service Routes (Ports, Itineraries, Sailings)
#

@app.get("/v1/ports")
async def list_ports(request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/ports", request, "cruise-service")

@app.post("/v1/ports")
async def create_port(request: Request):
    return await _proxy("POST", f"{CRUISE_SERVICE_URL}/ports", request, "cruise-service")

@app.get("/v1/ports/{port_code}")
async def get_port(port_code: str, request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/ports/{port_code}", request, "cruise-service")

@app.patch("/v1/ports/{port_code}")
async def patch_port(port_code: str, request: Request):
    return await _proxy("PATCH", f"{CRUISE_SERVICE_URL}/ports/{port_code}", request, "cruise-service")

@app.delete("/v1/ports/{port_code}")
async def delete_port(port_code: str, request: Request):
    return await _proxy("DELETE", f"{CRUISE_SERVICE_URL}/ports/{port_code}", request, "cruise-service")

@app.get("/v1/itineraries")
async def list_itineraries(request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/itineraries", request, "cruise-service")

@app.post("/v1/itineraries")
async def create_itinerary(request: Request):
    return await _proxy("POST", f"{CRUISE_SERVICE_URL}/itineraries", request, "cruise-service")

@app.get("/v1/itineraries/{itinerary_id}")
async def get_itinerary(itinerary_id: str, request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/itineraries/{itinerary_id}", request, "cruise-service")

@app.put("/v1/itineraries/{itinerary_id}")
async def replace_itinerary(itinerary_id: str, request: Request):
    return await _proxy("PUT", f"{CRUISE_SERVICE_URL}/itineraries/{itinerary_id}", request, "cruise-service")

@app.get("/v1/itineraries/{itinerary_id}/compute")
async def compute_itinerary_dates(itinerary_id: str, request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/itineraries/{itinerary_id}/compute", request, "cruise-service")

@app.get("/v1/itineraries/{itinerary_id}/sailings")
async def list_itinerary_sailings(itinerary_id: str, request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/itineraries/{itinerary_id}/sailings", request, "cruise-service")

@app.post("/v1/itineraries/{itinerary_id}/sailings")
async def create_sailing_from_itinerary(itinerary_id: str, request: Request):
    return await _proxy("POST", f"{CRUISE_SERVICE_URL}/itineraries/{itinerary_id}/sailings", request, "cruise-service")

@app.get("/v1/sailings")
async def list_sailings(request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/sailings", request, "cruise-service")

@app.get("/v1/sailings/{sailing_id}")
async def get_sailing(sailing_id: str, request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/sailings/{sailing_id}", request, "cruise-service")

@app.patch("/v1/sailings/{sailing_id}")
async def patch_sailing(sailing_id: str, request: Request):
    return await _proxy("PATCH", f"{CRUISE_SERVICE_URL}/sailings/{sailing_id}", request, "cruise-service")

@app.get("/v1/sailings/{sailing_id}/itinerary")
async def get_sailing_itinerary(sailing_id: str, request: Request):
    return await _proxy("GET", f"{CRUISE_SERVICE_URL}/sailings/{sailing_id}/itinerary", request, "cruise-service")

#
# Customer Service Routes
#

@app.post("/v1/platform/login")
async def platform_login(request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/platform/login", request, "customer-service")

@app.post("/v1/staff/login")
async def staff_login(request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/staff/login", request, "customer-service")

@app.get("/v1/customers")
async def list_customers(request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/customers", request, "customer-service")

@app.post("/v1/customers")
async def create_customer(request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/customers", request, "customer-service")

@app.get("/v1/customers/{customer_id}")
async def get_customer(customer_id: str, request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/customers/{customer_id}", request, "customer-service")

@app.patch("/v1/customers/{customer_id}")
async def patch_customer(customer_id: str, request: Request):
    return await _proxy("PATCH", f"{CUSTOMER_SERVICE_URL}/customers/{customer_id}", request, "customer-service")

@app.get("/v1/staff/me/preferences")
async def get_my_preferences(request: Request):
    # In a real app, we'd extract user_id from JWT.
    # For this starter, we'll just use a hardcoded user_id or pass through.
    # The customer-service handles /staff/me/preferences logic.
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/staff/me/preferences", request, "customer-service")

@app.patch("/v1/staff/me/preferences")
async def patch_my_preferences(request: Request):
    return await _proxy("PATCH", f"{CUSTOMER_SERVICE_URL}/staff/me/preferences", request, "customer-service")

@app.get("/v1/staff/users")
async def list_staff_users(request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/staff/users", request, "customer-service")

@app.post("/v1/staff/users")
async def create_staff_user(request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/staff/users", request, "customer-service")

@app.patch("/v1/staff/users/{user_id}")
async def patch_staff_user(user_id: str, request: Request):
    return await _proxy("PATCH", f"{CUSTOMER_SERVICE_URL}/staff/users/{user_id}", request, "customer-service")

@app.delete("/v1/staff/users/{user_id}")
async def delete_staff_user(user_id: str, request: Request):
    return await _proxy("DELETE", f"{CUSTOMER_SERVICE_URL}/staff/users/{user_id}", request, "customer-service")

@app.get("/v1/staff/groups")
async def list_staff_groups(request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/staff/groups", request, "customer-service")

@app.post("/v1/staff/groups")
async def create_staff_group(request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/staff/groups", request, "customer-service")

@app.patch("/v1/staff/groups/{group_id}")
async def patch_staff_group(group_id: str, request: Request):
    return await _proxy("PATCH", f"{CUSTOMER_SERVICE_URL}/staff/groups/{group_id}", request, "customer-service")

@app.get("/v1/staff/groups/{group_id}/members")
async def list_group_members(group_id: str, request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/staff/groups/{group_id}/members", request, "customer-service")

@app.post("/v1/staff/groups/{group_id}/members")
async def add_group_member(group_id: str, request: Request):
    return await _proxy("POST", f"{CUSTOMER_SERVICE_URL}/staff/groups/{group_id}/members", request, "customer-service")

@app.delete("/v1/staff/groups/{group_id}/members/{user_id}")
async def remove_group_member(group_id: str, user_id: str, request: Request):
    return await _proxy("DELETE", f"{CUSTOMER_SERVICE_URL}/staff/groups/{group_id}/members/{user_id}", request, "customer-service")

@app.get("/v1/staff/audit")
async def list_audit_logs(request: Request):
    return await _proxy("GET", f"{CUSTOMER_SERVICE_URL}/staff/audit", request, "customer-service")

#
# Booking Service Routes
#

@app.post("/v1/bookings")
async def create_booking(request: Request):
    return await _proxy("POST", f"{BOOKING_SERVICE_URL}/bookings", request, "booking-service")

@app.get("/v1/bookings")
async def list_bookings(request: Request):
    return await _proxy("GET", f"{BOOKING_SERVICE_URL}/bookings", request, "booking-service")

@app.get("/v1/bookings/{booking_id}")
async def get_booking(booking_id: str, request: Request):
    return await _proxy("GET", f"{BOOKING_SERVICE_URL}/bookings/{booking_id}", request, "booking-service")

@app.post("/v1/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, request: Request):
    return await _proxy("POST", f"{BOOKING_SERVICE_URL}/bookings/{booking_id}/cancel", request, "booking-service")

@app.post("/v1/bookings/{booking_id}/payments")
async def add_payment(booking_id: str, request: Request):
    return await _proxy("POST", f"{BOOKING_SERVICE_URL}/bookings/{booking_id}/payments", request, "booking-service")

#
# Pricing Service Routes
#

@app.post("/v1/quotes")
async def create_quote(request: Request):
    return await _proxy("POST", f"{PRICING_SERVICE_URL}/quotes", request, "pricing-service")
